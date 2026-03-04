import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_JSON_FILE = process.env.REMOTE_OUTPUT_JSON || "remote/news.remote.json";
const OUTPUT_JS_FILE = process.env.REMOTE_OUTPUT_JS || "remote/news.remote.js";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_API_BASE = String(process.env.OPENAI_API_BASE || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
const OPENAI_SITE_URL = String(process.env.OPENAI_SITE_URL || "").trim();
const OPENAI_APP_NAME = String(process.env.OPENAI_APP_NAME || "").trim();
const REMOTE_CRAWL_ONLY = String(process.env.REMOTE_CRAWL_ONLY || "0") === "1";
const REMOTE_ALLOW_RULE_FALLBACK = String(process.env.REMOTE_ALLOW_RULE_FALLBACK || "0") === "1";
const RAW_MAX_AGE_HOURS = Math.max(24, Number(process.env.RAW_MAX_AGE_HOURS || 72));
const IS_FREE_MODEL = /:free$/i.test(OPENAI_MODEL);

const TARGET_COUNT = 12;
const FREE_CAPS = {
  maxCandidates: 80,
  maxFeedItems: 240,
  chunkSize: 80,
  pickCount: 14,
  poolLimit: 120,
  maxRetries: 3
};

function readEnvNumber(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

const chunkSizeRaw = Math.max(40, readEnvNumber("OPENAI_STAGE1_CHUNK_SIZE", IS_FREE_MODEL ? FREE_CAPS.chunkSize : 120));
const OPENAI_STAGE1_CHUNK_SIZE = IS_FREE_MODEL ? FREE_CAPS.chunkSize : chunkSizeRaw;

const minCandidates = IS_FREE_MODEL ? 40 : 120;
const maxCandidatesRaw = Math.max(minCandidates, readEnvNumber("REMOTE_MAX_CANDIDATES", IS_FREE_MODEL ? FREE_CAPS.maxCandidates : 1200));
const MAX_CANDIDATES = IS_FREE_MODEL
  ? Math.min(FREE_CAPS.maxCandidates, OPENAI_STAGE1_CHUNK_SIZE, maxCandidatesRaw)
  : maxCandidatesRaw;

const maxFeedItemsRaw = Math.max(MAX_CANDIDATES, readEnvNumber("REMOTE_MAX_FEED_ITEMS", IS_FREE_MODEL ? FREE_CAPS.maxFeedItems : 3000));
const MAX_FEED_ITEMS = IS_FREE_MODEL
  ? Math.min(FREE_CAPS.maxFeedItems, Math.max(MAX_CANDIDATES, maxFeedItemsRaw))
  : maxFeedItemsRaw;

const pickCountRaw = Math.max(10, readEnvNumber("OPENAI_STAGE1_PICK_COUNT", IS_FREE_MODEL ? FREE_CAPS.pickCount : 24));
const OPENAI_STAGE1_PICK_COUNT = Math.min(OPENAI_STAGE1_CHUNK_SIZE, IS_FREE_MODEL ? Math.min(FREE_CAPS.pickCount, pickCountRaw) : pickCountRaw);

const stage2PoolRaw = Math.max(120, readEnvNumber("OPENAI_STAGE2_POOL_LIMIT", IS_FREE_MODEL ? FREE_CAPS.poolLimit : 360));
const OPENAI_STAGE2_POOL_LIMIT = IS_FREE_MODEL ? Math.min(FREE_CAPS.poolLimit, stage2PoolRaw) : stage2PoolRaw;

const OPENAI_REQUEST_GAP_MS = Math.max(0, readEnvNumber("OPENAI_REQUEST_GAP_MS", IS_FREE_MODEL ? 1200 : 180));
const retriesRaw = Math.max(IS_FREE_MODEL ? 1 : 0, readEnvNumber("OPENAI_MAX_RETRIES", IS_FREE_MODEL ? 2 : 3));
const OPENAI_MAX_RETRIES = IS_FREE_MODEL ? Math.min(FREE_CAPS.maxRetries, retriesRaw) : retriesRaw;
const OPENAI_RETRY_BASE_MS = Math.max(200, readEnvNumber("OPENAI_RETRY_BASE_MS", IS_FREE_MODEL ? 1800 : 900));
const OPENAI_RETRY_MAX_MS = Math.max(1000, Number(process.env.OPENAI_RETRY_MAX_MS || 20000));
const OPENAI_TIMEOUT_MS = Math.max(6000, Number(process.env.OPENAI_TIMEOUT_MS || (IS_FREE_MODEL ? 45000 : 30000)));

const BASE_RSS_FEEDS = [
  { url: "https://www.federalreserve.gov/feeds/press_all.xml", source: "Fed", category: "Policy" },
  { url: "https://www.sec.gov/news/pressreleases.rss", source: "SEC", category: "Policy" },
  { url: "https://www.ecb.europa.eu/rss/press.html", source: "ECB", category: "Macro" },
  { url: "https://www.bankofengland.co.uk/rss/news", source: "BoE", category: "Macro" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", source: "CNBC", category: "Market" },
  { url: "https://www.cnbc.com/id/100727362/device/rss/rss.html", source: "CNBC", category: "Geo" },
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", source: "BBC", category: "Geo" },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", source: "BBC", category: "Market" },
  { url: "https://www.theguardian.com/world/rss", source: "Guardian", category: "Geo" },
  { url: "https://www.theguardian.com/business/rss", source: "Guardian", category: "Market" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", source: "NYTimes", category: "Geo" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", source: "NYTimes", category: "Macro" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", source: "AlJazeera", category: "Geo" },
  { url: "https://feeds.npr.org/1001/rss.xml", source: "NPR", category: "Geo" },
  { url: "https://feeds.npr.org/1006/rss.xml", source: "NPR", category: "Macro" },
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", source: "MarketWatch", category: "Market" },
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph", category: "Crypto" },
  { url: "https://cn.cointelegraph.com/rss", source: "CointelegraphCN", category: "Crypto" },
  { url: "https://www.panewslab.com/rss.xml", source: "PANews", category: "Crypto" },
  { url: "https://decrypt.co/feed", source: "Decrypt", category: "Crypto" },
  { url: "https://blockworks.co/feed", source: "Blockworks", category: "Crypto" },
  { url: "https://www.fxstreet.com/rss/news", source: "FXStreet", category: "Macro" },
  { url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets", source: "Nasdaq", category: "Market" }
];

const EXTRA_RSS_FEEDS = [
  { url: "https://finance.yahoo.com/news/rssindex", source: "YahooFinance", category: "Market" },
  { url: "https://feeds.reuters.com/reuters/businessNews", source: "Reuters", category: "Market" },
  { url: "https://feeds.reuters.com/reuters/worldNews", source: "Reuters", category: "Geo" },
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk", category: "Crypto" }
];

const GOOGLE_NEWS_QUERIES = [
  { query: "stock market OR nasdaq OR s&p 500 OR dollar index OR oil OR gold", category: "Market", hl: "en-US", gl: "US", ceid: "US:en" },
  { query: "federal reserve OR cpi OR inflation OR treasury yield", category: "Macro", hl: "en-US", gl: "US", ceid: "US:en" },
  { query: "bitcoin OR ethereum OR crypto etf", category: "Crypto", hl: "en-US", gl: "US", ceid: "US:en" },
  { query: "geopolitics OR sanctions OR conflict OR middle east", category: "Geo", hl: "en-US", gl: "US", ceid: "US:en" },
  { query: "banking crisis OR credit spread OR liquidity risk OR treasury market", category: "Macro", hl: "en-US", gl: "US", ceid: "US:en" },
  { query: "opec OR brent OR wti OR oil supply shock OR strait of hormuz", category: "Geo", hl: "en-US", gl: "US", ceid: "US:en" },
  { query: "stablecoin regulation OR sec enforcement OR cftc OR crypto policy", category: "Policy", hl: "en-US", gl: "US", ceid: "US:en" },
  { query: "\u80a1\u5e02 OR \u7eb3\u65af\u8fbe\u514b OR \u6807\u666e OR \u7f8e\u5143\u6307\u6570 OR \u9ec4\u91d1 OR \u539f\u6cb9", category: "Market", hl: "zh-CN", gl: "CN", ceid: "CN:zh-Hans" },
  { query: "\u7f8e\u8054\u50a8 OR CPI OR \u901a\u80c0 OR \u975e\u519c OR \u7f8e\u503a\u6536\u76ca\u7387", category: "Macro", hl: "zh-CN", gl: "CN", ceid: "CN:zh-Hans" },
  { query: "\u6bd4\u7279\u5e01 OR \u4ee5\u592a\u574a OR \u52a0\u5bc6ETF OR \u7a33\u5b9a\u5e01", category: "Crypto", hl: "zh-CN", gl: "CN", ceid: "CN:zh-Hans" },
  { query: "\u5730\u7f18\u51b2\u7a81 OR \u5236\u88c1 OR \u822a\u8fd0 OR \u4e2d\u4e1c OR \u6218\u4e89\u98ce\u9669", category: "Geo", hl: "zh-CN", gl: "CN", ceid: "CN:zh-Hans" },
  { query: "\u592e\u884c OR \u8d27\u5e01\u653f\u7b56 OR \u52a0\u606f OR \u964d\u606f OR \u91d1\u878d\u76d1\u7ba1", category: "Policy", hl: "zh-CN", gl: "CN", ceid: "CN:zh-Hans" }
];

const BING_NEWS_QUERIES = [
  { query: "global economy inflation central bank rates growth recession", category: "Macro" },
  { query: "geopolitics sanctions conflict middle east shipping oil", category: "Geo" },
  { query: "stock market earnings treasury yield dollar index commodities", category: "Market" },
  { query: "crypto regulation etf stablecoin ethereum solana", category: "Crypto" },
  { query: "federal reserve cpi payroll unemployment pce treasury", category: "Macro" },
  { query: "opec oil gas lng shipping strait hormuz", category: "Geo" },
  { query: "bitcoin etf inflow outflow sec cftc stablecoin", category: "Policy" }
];

const REDDIT_HOT_FEEDS = [
  { subreddit: "worldnews", category: "Geo" },
  { subreddit: "CryptoCurrency", category: "Crypto" },
  { subreddit: "stocks", category: "Market" },
  { subreddit: "investing", category: "Macro" },
  { subreddit: "economics", category: "Macro" }
];

const REDDIT_SEARCH_QUERIES = [
  { query: "federal reserve OR CPI OR treasury yield OR stock market OR oil", category: "Macro" },
  { query: "geopolitics OR sanctions OR conflict OR middle east", category: "Geo" },
  { query: "bitcoin OR ethereum OR crypto ETF OR SEC", category: "Crypto" }
];

const GDELT_FEEDS = [
  { category: "Geo", query: "(geopolitics OR war OR sanctions OR tariff OR oil supply OR conflict OR central bank)" },
  { category: "Market", query: "(stock market OR equities OR treasury yield OR bond market OR dollar index OR oil OR gold) AND (volatility OR risk assets OR recession OR earnings)" },
  { category: "Policy", query: "(SEC OR regulation OR policy OR lawsuit OR approval OR ban OR framework OR bill) AND (crypto OR ETF OR stablecoin OR exchange OR digital asset)" },
  { category: "Macro", query: "(fed OR cpi OR inflation OR treasury yield OR interest rate OR dollar index OR jobs report OR unemployment) AND (stock market OR bond market OR risk assets OR commodities OR currencies)" },
  { category: "Crypto", query: "(bitcoin OR ethereum OR solana OR xrp OR stablecoin OR ETF OR exchange) AND (market OR regulation OR inflow OR volatility OR institutional adoption)" }
];

const SOURCE_WEIGHTS = {
  Fed: 9.6,
  SEC: 9.4,
  ECB: 9.0,
  BoE: 8.8,
  Reuters: 8.1,
  BBC: 7.6,
  Guardian: 7.2,
  NYTimes: 7.8,
  NPR: 7.0,
  AlJazeera: 6.8,
  MarketWatch: 7.0,
  Nasdaq: 7.3,
  YahooFinance: 6.8,
  CoinDesk: 6.4,
  Decrypt: 6.1,
  Blockworks: 6.0,
  GoogleNews: 6.1,
  BingNews: 5.9,
  GDELT: 5.6,
  Reddit: 3.8,
  CNBC: 7.1,
  FXStreet: 6.4,
  Cointelegraph: 5.9,
  CointelegraphCN: 5.9,
  PANews: 6.0
};

const CATEGORY_WEIGHTS = {
  Policy: 4.2,
  Geo: 4.0,
  Macro: 3.7,
  Market: 3.2,
  Crypto: 3.0,
  Social: 1.8
};

const HIGH_IMPACT_PATTERNS = [
  /\b(war|invasion|attack|missile|sanction|ceasefire|emergency|default|bankruptcy|executive order)\b/i,
  /\b(rate hike|rate cut|federal reserve|fomc|cpi|pce|payroll|inflation)\b/i,
  /(\u6218\u4e89|\u51b2\u7a81|\u88ad\u51fb|\u5bfc\u5f39|\u5236\u88c1|\u505c\u706b|\u7d27\u6025|\u52a0\u606f|\u964d\u606f|\u901a\u80c0|\u975e\u519c)/
];

function decodeEntities(input) {
  return String(input || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function stripHtml(input) {
  return String(input || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanText(input, maxLen = 220) {
  const raw = stripHtml(decodeEntities(input)).replace(/\s+/g, " ").trim();
  if (!raw) return "";
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, Math.max(0, maxLen - 3)).trim()}...`;
}

function hasChineseText(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ""));
}

function latinRatio(text) {
  const sample = String(text || "");
  const latin = (sample.match(/[A-Za-z]/g) || []).length;
  const useful = (sample.match(/[A-Za-z\u4e00-\u9fff]/g) || []).length;
  return useful ? latin / useful : 0;
}

function cleanOutputText(input, maxLen = 220) {
  const raw = String(input || "");
  const cleaned = stripHtml(decodeEntities(raw))
    .replace(/&nbsp;|&#160;|\u00a0/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLen - 3)).trim()}...`;
}

function normalizeTitle(raw) {
  const text = cleanText(raw, 180);
  if (!text) return "";
  const parts = text.split(" - ");
  if (parts.length >= 2 && parts[parts.length - 1].length <= 44) {
    return parts.slice(0, -1).join(" - ").trim() || text;
  }
  return text;
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1] : "";
}

function extractAtomLink(block) {
  const m = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i);
  return m ? m[1] : "";
}

function normalizeDedupTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\([^)]*\)$/g, " ")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\b(reuters|cnbc|cointelegraph|coindesk|the block|decrypt|fed|sec|ecb|boe)\b/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 170);
}

function newsDedupKey(row) {
  const titleKey = normalizeDedupTitle(row?.title || "");
  if (titleKey) return titleKey;
  return `${String(row?.source || "news").toLowerCase()}|${String(row?.url || "")}`;
}

function parseRss(xmlText, sourcePrefix, category) {
  const xml = String(xmlText || "");
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const chunks = isAtom ? xml.match(/<entry[\s\S]*?<\/entry>/gi) || [] : xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const out = [];

  for (const chunk of chunks) {
    const titleRaw = extractTag(chunk, "title");
    const linkRaw = isAtom ? extractAtomLink(chunk) : extractTag(chunk, "link");
    const dateRaw = isAtom ? extractTag(chunk, "updated") || extractTag(chunk, "published") : extractTag(chunk, "pubDate");
    const sourceRaw = extractTag(chunk, "source");
    const descRaw = extractTag(chunk, "description") || extractTag(chunk, "summary") || extractTag(chunk, "content");

    const title = normalizeTitle(titleRaw);
    const url = cleanText(linkRaw, 500);
    if (!title || !url) continue;

    const source = normalizeTitle(sourceRaw) || sourcePrefix;
    const ts = Date.parse(cleanText(dateRaw, 120));
    const time = Number.isFinite(ts) ? ts : Date.now();
    const summary = cleanText(descRaw, 220);

    out.push({
      title,
      summary,
      url,
      source: `${sourcePrefix}/${source}`,
      category,
      time,
      engagement: 0
    });
  }
  return out;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, timeoutMs = 16000, retries = 2) {
  let lastError = null;
  for (let i = 0; i <= retries; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (error) {
      lastError = error;
      if (i < retries) await sleep(400 * (i + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("fetch failed");
}

async function fetchJson(url, timeoutMs = 16000, retries = 2) {
  const text = await fetchText(url, timeoutMs, retries);
  return JSON.parse(text);
}

async function loadFeed(feed) {
  const xml = await fetchText(feed.url, 16000, 1);
  return parseRss(xml, feed.source, feed.category);
}

function buildGoogleNewsRssUrl(cfg) {
  const q = encodeURIComponent(String(cfg.query || ""));
  return `https://news.google.com/rss/search?q=${q}&hl=${encodeURIComponent(cfg.hl || "en-US")}&gl=${encodeURIComponent(cfg.gl || "US")}&ceid=${encodeURIComponent(cfg.ceid || "US:en")}`;
}

async function loadGoogleNewsRss(cfg) {
  const rssUrl = buildGoogleNewsRssUrl(cfg);
  const xml = await fetchText(rssUrl, 16000, 1);
  return parseRss(xml, "GoogleNews", cfg.category || "Market");
}

async function loadBingNewsRss(cfg) {
  const q = encodeURIComponent(String(cfg.query || ""));
  const rssUrl = `https://www.bing.com/news/search?q=${q}&format=rss&setlang=en-us`;
  const xml = await fetchText(rssUrl, 16000, 1);
  return parseRss(xml, "BingNews", cfg.category || "Market");
}

async function loadRedditHot(cfg) {
  const subreddit = String(cfg.subreddit || "").trim();
  const category = String(cfg.category || "Social").trim();
  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=10`;
  const data = await fetchJson(url, 16000, 1);
  const rows = Array.isArray(data?.data?.children) ? data.data.children : [];
  return rows
    .map((item) => item?.data)
    .filter(Boolean)
    .map((post) => ({
      title: normalizeTitle(post?.title || ""),
      summary: cleanText(post?.selftext || "", 220),
      url: cleanText(post?.url || "", 500),
      source: `Reddit/r/${subreddit}`,
      category,
      time: Number(post?.created_utc) * 1000 || Date.now(),
      engagement: Number(post?.score || 0) + Number(post?.num_comments || 0)
    }))
    .filter((row) => row.title && row.url);
}

async function loadRedditSearch(cfg) {
  const query = String(cfg.query || "").trim();
  const category = String(cfg.category || "Social").trim();
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&t=day&limit=16`;
  const data = await fetchJson(url, 16000, 1);
  const rows = Array.isArray(data?.data?.children) ? data.data.children : [];
  return rows
    .map((item) => item?.data)
    .filter(Boolean)
    .map((post) => ({
      title: normalizeTitle(post?.title || ""),
      summary: cleanText(post?.selftext || "", 220),
      url: cleanText(post?.url || "", 500),
      source: `Reddit/Search/${String(post?.subreddit || "all")}`,
      category,
      time: Number(post?.created_utc) * 1000 || Date.now(),
      engagement: Number(post?.score || 0) + Number(post?.num_comments || 0)
    }))
    .filter((row) => row.title && row.url);
}

async function loadGdelt(cfg) {
  const category = String(cfg.category || "Market").trim();
  const query = encodeURIComponent(String(cfg.query || ""));
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&maxrecords=12&format=json&sort=DateDesc`;
  const data = await fetchJson(url, 16000, 1);
  const articles = Array.isArray(data?.articles) ? data.articles : [];
  return articles
    .map((a) => ({
      title: normalizeTitle(a?.title || ""),
      summary: cleanText(a?.socialimage || a?.seendate || "", 180),
      url: cleanText(a?.url || "", 500),
      source: `GDELT/${cleanText(a?.sourcecommonname || a?.domain || "GDELT", 80)}`,
      category,
      time: Date.parse(cleanText(a?.seendate || "", 120)) || Date.now(),
      engagement: 0
    }))
    .filter((row) => row.title && row.url);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computePreScore(item, now = Date.now()) {
  const sourceKey = String(item.source || "News").split("/")[0];
  const sourceScore = SOURCE_WEIGHTS[sourceKey] || 4.5;
  const categoryScore = CATEGORY_WEIGHTS[item.category] || 2.4;
  const ageHours = Math.max(0, (now - Number(item.time || now)) / 3600000);
  const recencyScore = clamp(5 - ageHours * 0.18, -2, 5);
  const keywordBoost = HIGH_IMPACT_PATTERNS.some((re) => re.test(item.title)) ? 4.6 : 0;
  return sourceScore + categoryScore + recencyScore + keywordBoost;
}

function pickCandidates(rows, now = Date.now()) {
  const merged = [...rows]
    .filter((row) => row.title && row.url)
    .sort((a, b) => (b.time || 0) - (a.time || 0));

  const dedup = [];
  const seen = new Set();
  for (const row of merged) {
    const key = newsDedupKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(row);
    if (dedup.length >= MAX_FEED_ITEMS) break;
  }

  const maxAgeMs = 72 * 3600 * 1000;
  const recent = dedup.filter((row) => Number.isFinite(row.time) && row.time >= now - maxAgeMs && row.time <= now + 10 * 60 * 1000);
  const ranked = (recent.length ? recent : dedup)
    .map((row) => ({ ...row, preScore: computePreScore(row, now) }))
    .sort((a, b) => {
      if (Math.abs((b.preScore || 0) - (a.preScore || 0)) > 0.0001) return (b.preScore || 0) - (a.preScore || 0);
      return (b.time || 0) - (a.time || 0);
    });

  return ranked.slice(0, MAX_CANDIDATES).map((row, idx) => ({
    id: idx + 1,
    title: row.title,
    summary: row.summary || "",
    url: row.url,
    source: row.source,
    category: row.category,
    time: row.time,
    preScore: Number(row.preScore.toFixed(3))
  }));
}

function buildRawPool(rows, now = Date.now()) {
  const maxAgeMs = RAW_MAX_AGE_HOURS * 3600 * 1000;
  const filtered = rows
    .filter((row) => row && row.title && row.url)
    .filter((row) => Number.isFinite(Number(row.time)) && Number(row.time) >= now - maxAgeMs && Number(row.time) <= now + 10 * 60 * 1000)
    .sort((a, b) => (Number(b.time) || 0) - (Number(a.time) || 0));

  const dedup = [];
  const seen = new Set();
  for (const row of filtered) {
    const key = newsDedupKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push({
      title: String(row.title || "").trim(),
      summary: String(row.summary || "").trim(),
      url: String(row.url || "").trim(),
      source: String(row.source || "News").trim(),
      category: String(row.category || "Market").trim(),
      time: Number(row.time) || now,
      engagement: Number(row.engagement) || 0
    });
    if (dedup.length >= MAX_FEED_ITEMS) break;
  }
  return dedup;
}

function chunkArray(rows, size) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function chunkOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["chunkSummaryZh", "items"],
    properties: {
      chunkSummaryZh: { type: "string" },
      items: {
        type: "array",
        minItems: 1,
        maxItems: OPENAI_STAGE1_PICK_COUNT,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "url",
            "source",
            "category",
            "time",
            "headlineZh",
            "summaryZh",
            "agentReasonZh",
            "topicZh",
            "eventKey",
            "impactScore"
          ],
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            source: { type: "string" },
            category: { type: "string", enum: ["Policy", "Geo", "Macro", "Market", "Crypto", "Social"] },
            time: { type: "number" },
            headlineZh: { type: "string" },
            summaryZh: { type: "string" },
            agentReasonZh: { type: "string" },
            topicZh: { type: "string" },
            eventKey: { type: "string" },
            impactScore: { type: "number" }
          }
        }
      }
    }
  };
}

function finalOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["globalSummaryZh", "items"],
    properties: {
      globalSummaryZh: { type: "string" },
      items: {
        type: "array",
        minItems: TARGET_COUNT,
        maxItems: TARGET_COUNT,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "headlineZh",
            "summaryZh",
            "agentReasonZh",
            "url",
            "source",
            "category",
            "time",
            "priority",
            "pinnedUntil",
            "agentScore",
            "agentRank",
            "topicZh"
          ],
          properties: {
            title: { type: "string" },
            headlineZh: { type: "string" },
            summaryZh: { type: "string" },
            agentReasonZh: { type: "string" },
            url: { type: "string" },
            source: { type: "string" },
            category: { type: "string", enum: ["Policy", "Geo", "Macro", "Market", "Crypto", "Social"] },
            time: { type: "number" },
            priority: { type: "number" },
            pinnedUntil: { type: "number" },
            agentScore: { type: "number" },
            agentRank: { type: "number" },
            topicZh: { type: "string" }
          }
        }
      }
    }
  };
}

function createOpenAiChunkPayload(chunkRows, nowIso, chunkIndex, totalChunks) {
  const systemPrompt = [
    "\u4f60\u662f\u91d1\u878d\u603b\u7f16\u8f91\uff0c\u8bf7\u201c\u5168\u91cf\u9605\u8bfb\u5f53\u524d\u5206\u7247\u5019\u9009\u201d\u3002",
    "\u4efb\u52a1\uff1a\u4ece\u5f53\u524d\u5206\u7247\u4e2d\u9009\u51fa\u5bf9\u5168\u7403\u8d44\u4ea7\u5f71\u54cd\u6700\u5927\u7684\u82e5\u5e72\u6761\uff0c\u8f93\u51fa\u4e2d\u6587\u6807\u9898/\u6458\u8981/\u7406\u7531\u3002",
    "\u8981\u6c42\uff1a\u4e25\u683c\u8fd4\u56de JSON \u4e14\u7b26\u5408 schema\uff1beventKey \u7528\u4e8e\u8de8\u6e90\u53bb\u91cd\uff0c\u7b80\u77ed\u7a33\u5b9a\u3002",
    "\u91cd\u8981\u4e8b\u4ef6\u4f18\u5148\uff1a\u5b98\u65b9/\u76d1\u7ba1/\u592e\u884c > \u5730\u7f18\u6218\u4e89/\u5236\u88c1 > \u901a\u80c0\u5c31\u4e1a\u5229\u7387 > \u91d1\u878d\u5e02\u573a\u5927\u5e45\u6ce2\u52a8\u3002"
  ].join("\n");

  const userPrompt = JSON.stringify({
    now: nowIso,
    chunk: { index: chunkIndex + 1, total: totalChunks },
    requirements: {
      language: "zh-CN",
      pickTopN: OPENAI_STAGE1_PICK_COUNT,
      summaryStyle: "1~2\u53e5\uff0c\u4e2d\u6587\uff0c\u4e0d\u7a7a\u6d1e",
      categories: ["Policy", "Geo", "Macro", "Market", "Crypto", "Social"]
    },
    candidates: chunkRows
  });

  return {
    model: OPENAI_MODEL,
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "remote_news_chunk_payload",
        strict: true,
        schema: chunkOutputSchema()
      }
    }
  };
}

function createOpenAiFinalPayload(poolRows, nowIso) {
  const systemPrompt = [
    "\u4f60\u662f\u5168\u7403\u91d1\u878d\u65b0\u95fb\u603b\u7f16\u8f91\u3002",
    "\u8f93\u5165\u5df2\u662f\u201c\u7ecf\u8fc7\u5206\u7247\u9605\u8bfb\u548c\u63d0\u70bc\u201d\u7684\u9ad8\u4fe1\u53f7\u5019\u9009\u6c60\uff0c\u8bf7\u518d\u5168\u91cf\u5ba1\u9605\u5e76\u4ea7\u751f\u6700\u7ec8 Top12\u3002",
    "\u6392\u5e8f\u6807\u51c6\uff1a\u5f71\u54cd\u9762 + \u65f6\u6548\u6027 + \u6743\u5a01\u6027 + \u5e02\u573a\u5916\u6ea2\u6548\u5e94\u3002",
    "\u5927\u4e8b\u4ef6\u9700\u4fdd\u630124~36\u5c0f\u65f6\uff08pinnedUntil\uff09\uff0c\u4e0d\u8981\u88ab\u7ec6\u789e\u6d88\u606f\u6324\u6389\u3002"
  ].join("\n");

  const userPrompt = JSON.stringify({
    now: nowIso,
    requirements: {
      targetCount: TARGET_COUNT,
      language: "zh-CN",
      summaryStyle: "1~2\u53e5\uff0c\u7b80\u7ec3\u4e2d\u6587",
      categories: ["Policy", "Geo", "Macro", "Market", "Crypto", "Social"],
      notes: [
        "headlineZh \u5fc5\u987b\u4e2d\u6587",
        "summaryZh \u4e2d\u6587\u6982\u62ec",
        "agentScore 0~100",
        "agentRank 1~12",
        "time/pinnedUntil \u4f7f\u7528 Unix ms"
      ]
    },
    candidates: poolRows
  });

  return {
    model: OPENAI_MODEL,
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "remote_news_wall_payload",
        strict: true,
        schema: finalOutputSchema()
      }
    }
  };
}

function idSelectOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["ids"],
    properties: {
      ids: {
        type: "array",
        minItems: TARGET_COUNT,
        maxItems: TARGET_COUNT,
        items: { type: "integer", minimum: 1 }
      }
    }
  };
}

function createOpenAiIdSelectPayload(poolRows, nowIso) {
  const conciseRows = poolRows.map((row) => ({
    id: Number(row.id),
    title: String(row.title || ""),
    source: String(row.source || ""),
    category: String(row.category || "Market"),
    time: Number(row.time) || Date.now(),
    preScore: Number(row.preScore) || 0,
    url: String(row.url || "")
  }));

  const systemPrompt = [
    "\u4f60\u662f\u5168\u7403\u91d1\u878d\u65b0\u95fb\u603b\u7f16\u8f91\u3002",
    "\u53ea\u9700\u5728\u7ed9\u5b9a ID \u5019\u9009\u4e2d\u9009\u51fa Top12\uff0c\u8fd4\u56de ids \u6570\u7ec4\u5373\u53ef\u3002",
    "\u6392\u5e8f\u903b\u8f91\uff1a\u5f71\u54cd\u9762>\u65f6\u6548>\u6743\u5a01>\u5916\u6ea2\u6548\u5e94\u3002"
  ].join("\n");

  const userPrompt = JSON.stringify({
    now: nowIso,
    requirements: {
      targetCount: TARGET_COUNT,
      return: "ids_only",
      uniqueIds: true
    },
    candidates: conciseRows
  });

  return {
    model: OPENAI_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "remote_news_id_select_payload",
        strict: true,
        schema: idSelectOutputSchema()
      }
    }
  };
}

function zhPolishOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        minItems: 1,
        maxItems: TARGET_COUNT,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "headlineZh", "summaryZh", "agentReasonZh", "topicZh"],
          properties: {
            id: { type: "integer", minimum: 1 },
            headlineZh: { type: "string" },
            summaryZh: { type: "string" },
            agentReasonZh: { type: "string" },
            topicZh: { type: "string" }
          }
        }
      }
    }
  };
}

function createOpenAiZhPolishPayload(items, nowIso) {
  const rows = items.map((row) => ({
    id: Number(row.id),
    title: cleanOutputText(row.title || "", 160),
    source: cleanOutputText(row.source || "", 80),
    category: String(row.category || "Market"),
    headlineZh: cleanOutputText(row.headlineZh || "", 160),
    summaryZh: cleanOutputText(row.summaryZh || row.summary || "", 260),
    agentReasonZh: cleanOutputText(row.agentReasonZh || "", 120),
    topicZh: cleanOutputText(row.topicZh || "", 40)
  }));

  const systemPrompt = [
    "\u4f60\u662f\u91d1\u878d\u4e2d\u6587\u7f16\u8f91\u3002",
    "\u8bf7\u5bf9\u8f93\u5165\u7684 12 \u6761\u65b0\u95fb\u8fdb\u884c\u4ec5\u201c\u4e2d\u6587\u5316\u4fee\u8272\u201d\uff1a",
    "1) headlineZh \u5fc5\u987b\u4e3a\u7b80\u4f53\u4e2d\u6587\uff1b2) summaryZh \u5fc5\u987b\u4e3a 1~2 \u53e5\u4e2d\u6587\uff1b3) agentReasonZh \u4e3a\u4e2d\u6587\u7406\u7531\uff1b4) topicZh \u4e3a\u4e2d\u6587\u8bdd\u9898\u8bcd\u3002",
    "\u4e25\u7981\u8f93\u51fa &nbsp;/HTML \u5b9e\u4f53\uff0c\u4e25\u7981\u8f93\u51fa\u82f1\u6587\u53e5\u5b50\u3002",
    "\u4e0d\u8981\u589e\u52a0\u6216\u5220\u9664\u6761\u76ee\uff0c\u4ec5\u6839\u636e id \u8fd4\u56de\u4fee\u6b63\u540e\u5b57\u6bb5\u3002"
  ].join("\n");

  const userPrompt = JSON.stringify({
    now: nowIso,
    requirements: {
      language: "zh-CN",
      keepIds: true
    },
    items: rows
  });

  return {
    model: OPENAI_MODEL,
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "remote_news_zh_polish_payload",
        strict: true,
        schema: zhPolishOutputSchema()
      }
    }
  };
}

function cleanJsonText(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const m = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  const core = m ? m[1].trim() : raw;
  const jsonObj = extractFirstJsonObject(core);
  if (jsonObj) return jsonObj;
  const jsonArr = extractFirstJsonArray(core);
  if (jsonArr) return jsonArr;
  const l = core.indexOf("{");
  const r = core.lastIndexOf("}");
  if (l >= 0 && r > l) return core.slice(l, r + 1);
  return raw;
}

function extractFirstJsonObject(text) {
  const raw = String(text || "");
  const start = raw.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1).trim();
      continue;
    }
  }
  return "";
}

function extractFirstJsonArray(text) {
  const raw = String(text || "");
  const start = raw.indexOf("[");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "[") {
      depth += 1;
      continue;
    }
    if (ch === "]") {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1).trim();
      continue;
    }
  }
  return "";
}

function toChineseCategory(category) {
  const map = { Policy: "\u653f\u7b56", Geo: "\u5730\u7f18", Macro: "\u5b8f\u89c2", Market: "\u5e02\u573a", Crypto: "\u52a0\u5bc6", Social: "\u793e\u533a" };
  return map[String(category || "")] || "\u5e02\u573a";
}

function fallbackSummaryZh(item) {
  const cat = toChineseCategory(item.category);
  const src = String(item.source || "News").split("/")[0];
  const title = cleanOutputText(item.title || "", 56);
  if (hasChineseText(title)) {
    return `\u3010${cat}\u3011${title}\u3002\u6765\u6e90\uff1a${src}\u3002`;
  }
  return `\u3010${cat}\u3011\u91cd\u70b9\u4e8b\u4ef6\uff1a${src}\u76f8\u5173\u52a8\u6001\u3002\u8be6\u89c1\u539f\u6587\u94fe\u63a5\u3002`;
}

function fallbackReasonZh(item) {
  const src = String(item.source || "News").split("/")[0];
  if (SOURCE_WEIGHTS[src] >= 8.8) return "\u5b98\u65b9/\u673a\u6784\u4fe1\u6e90\u4f18\u5148";
  if (HIGH_IMPACT_PATTERNS.some((re) => re.test(item.title))) return "\u5173\u952e\u4e8b\u4ef6\u5bf9\u5e02\u573a\u6270\u52a8\u5927";
  return "\u9ad8\u65f6\u6548\u4e14\u76f8\u5173\u5ea6\u8f83\u9ad8";
}

function fallbackTopicZh(item) {
  const text = `${item.title} ${item.category}`.toLowerCase();
  if (/\b(iran|israel|ukraine|russia|war|conflict|sanction|oil|shipping)\b/.test(text)) return "\u5730\u7f18\u51b2\u7a81\u4e0e\u80fd\u6e90";
  if (/\b(fed|fomc|cpi|inflation|payroll|rate)\b/.test(text)) return "\u7f8e\u8054\u50a8\u4e0e\u5b8f\u89c2";
  if (/\b(bitcoin|btc|ethereum|etf|crypto|stablecoin)\b/.test(text)) return "\u52a0\u5bc6\u8d44\u4ea7\u4e0e\u76d1\u7ba1";
  if (/\b(nasdaq|s&p|dow|earnings|equity|stock)\b/.test(text)) return "\u80a1\u5e02\u4e0e\u4f01\u4e1a";
  return `${toChineseCategory(item.category)}\u9886\u57df`;
}

function fallbackBuild(candidates, now) {
  const sorted = [...candidates].sort((a, b) => {
    if (Math.abs((b.preScore || 0) - (a.preScore || 0)) > 0.0001) return (b.preScore || 0) - (a.preScore || 0);
    return (b.time || 0) - (a.time || 0);
  });

  const out = [];
  const sourceCount = Object.create(null);
  const categoryCount = Object.create(null);
  const maxPerSource = 3;
  const maxPerCategory = 4;

  for (const row of sorted) {
    if (out.length >= TARGET_COUNT) break;
    if ((sourceCount[row.source] || 0) >= maxPerSource) continue;
    if ((categoryCount[row.category] || 0) >= maxPerCategory) continue;
    sourceCount[row.source] = (sourceCount[row.source] || 0) + 1;
    categoryCount[row.category] = (categoryCount[row.category] || 0) + 1;
    out.push(row);
  }

  for (const row of sorted) {
    if (out.length >= TARGET_COUNT) break;
    if (out.some((x) => newsDedupKey(x) === newsDedupKey(row))) continue;
    out.push(row);
  }

  return out.slice(0, TARGET_COUNT).map((row, idx) => {
    const high = HIGH_IMPACT_PATTERNS.some((re) => re.test(row.title));
    const score = Number((Math.max(1, row.preScore) * 7.5).toFixed(2));
    return {
      title: row.title,
      headlineZh: row.title,
      summaryZh: fallbackSummaryZh(row),
      agentReasonZh: fallbackReasonZh(row),
      url: row.url,
      source: row.source,
      category: row.category,
      time: Number(row.time) || now,
      priority: Number((score * 0.62).toFixed(2)),
      pinnedUntil: high ? now + 24 * 3600 * 1000 : 0,
      agentScore: score,
      agentRank: idx + 1,
      topicZh: fallbackTopicZh(row)
    };
  });
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeItems(items, candidates, now) {
  const candidateByUrl = new Map(candidates.map((x) => [x.url, x]));
  const dedup = [];
  const seen = new Set();

  const sorted = [...items].sort((a, b) => safeNumber(a.agentRank, 999) - safeNumber(b.agentRank, 999));
  for (const raw of sorted) {
    const title = cleanOutputText(raw?.title || "", 180);
    const url = String(raw?.url || "").trim();
    const source = cleanOutputText(raw?.source || "", 80);
    const category = String(raw?.category || "Market").trim();
    if (!title || !url || !source) continue;
    const key = newsDedupKey({ title, source, url });
    if (seen.has(key)) continue;
    seen.add(key);

    const candidate = candidateByUrl.get(url);
    const baseTime = safeNumber(candidate?.time, now);
    const score = safeNumber(raw?.agentScore, 35);
    const highImpact = score >= 72 || HIGH_IMPACT_PATTERNS.some((re) => re.test(title));
    const pinnedDefault = highImpact ? now + 24 * 3600 * 1000 : 0;
    const headlineRaw = cleanOutputText(raw?.headlineZh || title, 120);
    const summaryRaw = cleanOutputText(raw?.summaryZh || fallbackSummaryZh({ title, source, category }), 240);
    const reasonRaw = cleanOutputText(raw?.agentReasonZh || fallbackReasonZh({ title, source }), 120);
    const topicRaw = cleanOutputText(raw?.topicZh || fallbackTopicZh({ title, category }), 40);

    const headlineZh = (hasChineseText(headlineRaw) && latinRatio(headlineRaw) <= 0.65)
      ? headlineRaw
      : (() => {
        const cat = toChineseCategory(category);
        const src = source.split("/")[0] || "来源";
        const short = hasChineseText(title) ? cleanOutputText(title, 72) : `${src}发布重要${cat}动态`;
        return `\u3010${cat}\u3011${short}`;
      })();
    const summaryZh = (hasChineseText(summaryRaw) && latinRatio(summaryRaw) <= 0.72)
      ? summaryRaw
      : fallbackSummaryZh({ title, source, category });
    const agentReasonZh = (hasChineseText(reasonRaw) && latinRatio(reasonRaw) <= 0.8)
      ? reasonRaw
      : fallbackReasonZh({ title, source });
    const topicZh = (hasChineseText(topicRaw) && latinRatio(topicRaw) <= 0.8)
      ? topicRaw
      : fallbackTopicZh({ title, category });

    dedup.push({
      title,
      headlineZh,
      summaryZh,
      agentReasonZh,
      url,
      source,
      category,
      time: safeNumber(raw?.time, baseTime),
      priority: safeNumber(raw?.priority, Number((score * 0.62).toFixed(2))),
      pinnedUntil: safeNumber(raw?.pinnedUntil, pinnedDefault),
      agentScore: score,
      agentRank: safeNumber(raw?.agentRank, dedup.length + 1),
      topicZh
    });
  }

  for (const row of dedup) {
    if (row.pinnedUntil > now + 72 * 3600 * 1000) row.pinnedUntil = now + 48 * 3600 * 1000;
    if (row.pinnedUntil < now && row.agentScore >= 75) row.pinnedUntil = now + 24 * 3600 * 1000;
  }

  dedup.sort((a, b) => safeNumber(a.agentRank, 999) - safeNumber(b.agentRank, 999));
  while (dedup.length < TARGET_COUNT && candidates.length) {
    const fill = candidates.find((x) => !dedup.some((y) => newsDedupKey(y) === newsDedupKey(x)));
    if (!fill) break;
    dedup.push(...fallbackBuild([fill], now).map((x) => ({ ...x, agentRank: dedup.length + 1 })));
  }

  const finalRows = dedup.slice(0, TARGET_COUNT).map((row, idx) => ({ ...row, agentRank: idx + 1 }));
  return finalRows;
}

function buildSourceStats(items) {
  const out = {};
  for (const row of items) {
    out[row.source] = (out[row.source] || 0) + 1;
  }
  return out;
}

function findRefRowByTitle(title, refRows) {
  const key = normalizeDedupTitle(title);
  if (!key || !refRows.length) return null;
  let best = null;
  let bestScore = 0;
  for (const row of refRows) {
    const rowKey = normalizeDedupTitle(row?.title || "");
    if (!rowKey) continue;
    if (rowKey === key) return row;
    let score = 0;
    if (rowKey.includes(key) || key.includes(rowKey)) score = Math.min(rowKey.length, key.length);
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return best;
}

function normalizeModelItem(raw, fallbackTime = Date.now(), refRows = []) {
  if (!raw || typeof raw !== "object") return null;
  const id = safeNumber(raw.id, 0);
  const byId = id > 0 ? refRows.find((row) => safeNumber(row?.id, 0) === id) : null;
  const titleRaw = cleanOutputText(raw.title || raw.headline || raw.headlineZh || "", 180);
  const byTitle = titleRaw ? findRefRowByTitle(titleRaw, refRows) : null;
  const match = byId || byTitle || null;

  const title = cleanOutputText(titleRaw || match?.title || "", 180);
  const url = String(raw.url || raw.link || raw.href || match?.url || "").trim();
  if (!title || !url) return null;
  const source = cleanOutputText(raw.source || raw.media || match?.source || "Remote", 80);
  const category = String(raw.category || raw.cat || match?.category || "Market").trim();
  const score = safeNumber(raw.agentScore, safeNumber(match?.preScore, 0) * 7.2);

  return {
    title,
    headlineZh: cleanOutputText(raw.headlineZh || raw.headline || title, 120),
    summaryZh: cleanOutputText(raw.summaryZh || raw.summary || match?.summary || "", 240),
    agentReasonZh: cleanOutputText(raw.agentReasonZh || raw.reasonZh || raw.reason || match?.reasonZh || "", 120),
    url,
    source,
    category,
    time: safeNumber(raw.time, safeNumber(match?.time, fallbackTime)),
    priority: safeNumber(raw.priority, Number((score * 0.62).toFixed(2))),
    pinnedUntil: safeNumber(raw.pinnedUntil, 0),
    agentScore: score,
    agentRank: safeNumber(raw.agentRank, 0),
    topicZh: cleanOutputText(raw.topicZh || raw.topic || match?.topicZh || "", 40)
  };
}

function isLikelyModelItem(raw) {
  if (!raw || typeof raw !== "object") return false;
  const title = raw.title || raw.headline || raw.headlineZh;
  const url = raw.url || raw.link || raw.href;
  const id = Number(raw.id);
  return (typeof title === "string" && title.trim())
    || (typeof url === "string" && url.trim())
    || Number.isFinite(id);
}

function extractModelItemsFromPayload(payload, refRows = []) {
  if (!payload || typeof payload !== "object") return [];
  const direct = Array.isArray(payload.items) ? payload.items : null;
  if (direct && direct.length) {
    return direct.map((x) => normalizeModelItem(x, Date.now(), refRows)).filter(Boolean);
  }

  const queue = [payload];
  const visited = new Set();
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== "object") continue;
    if (visited.has(node)) continue;
    visited.add(node);

    if (Array.isArray(node)) {
      if (node.length && node.some((x) => isLikelyModelItem(x))) {
        const mapped = node.map((x) => normalizeModelItem(x, Date.now(), refRows)).filter(Boolean);
        if (mapped.length) return mapped;
      }
      for (const item of node) {
        if (item && typeof item === "object") queue.push(item);
      }
      continue;
    }

    for (const value of Object.values(node)) {
      if (!value || typeof value !== "object") continue;
      queue.push(value);
    }
  }
  return [];
}

function extractIdsFromPayload(payload, validIdSet) {
  const ids = [];
  const pushId = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const id = Math.round(n);
    if (id <= 0) return;
    if (validIdSet && !validIdSet.has(id)) return;
    if (!ids.includes(id)) ids.push(id);
  };

  const scan = (node) => {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        if (typeof item === "number" || typeof item === "string") pushId(item);
        else scan(item);
      }
      return;
    }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (k.toLowerCase() === "id") {
          pushId(v);
          continue;
        }
        scan(v);
      }
      return;
    }
    if (typeof node === "string") {
      const arr = node.match(/\b\d+\b/g) || [];
      for (const token of arr) pushId(token);
    }
  };

  scan(payload);
  return ids.slice(0, TARGET_COUNT);
}

function buildItemsFromSelectedIds(ids, refRows, now) {
  const rowsById = new Map(refRows.map((row) => [safeNumber(row?.id, -1), row]));
  const selected = [];
  const seen = new Set();
  for (const id of ids) {
    const row = rowsById.get(id);
    if (!row) continue;
    const key = newsDedupKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(row);
    if (selected.length >= TARGET_COUNT) break;
  }

  if (selected.length < TARGET_COUNT) {
    const fill = [...refRows].sort((a, b) => {
      if (Math.abs((safeNumber(b.preScore, 0) - safeNumber(a.preScore, 0))) > 0.001) return safeNumber(b.preScore, 0) - safeNumber(a.preScore, 0);
      return safeNumber(b.time, 0) - safeNumber(a.time, 0);
    });
    for (const row of fill) {
      const key = newsDedupKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(row);
      if (selected.length >= TARGET_COUNT) break;
    }
  }

  return selected.slice(0, TARGET_COUNT).map((row, idx) => {
    const score = Number(clamp(safeNumber(row.preScore, 4) * 7.8, 15, 96).toFixed(2));
    const highImpact = score >= 72 || HIGH_IMPACT_PATTERNS.some((re) => re.test(String(row.title || "")));
    return {
      title: cleanOutputText(row.title || "", 180),
      headlineZh: cleanOutputText(row.headlineZh || row.title || "", 120),
      summaryZh: cleanOutputText(row.summary || row.summaryZh || fallbackSummaryZh(row), 240),
      agentReasonZh: cleanOutputText(row.reasonZh || row.agentReasonZh || "\u6a21\u578b\u5224\u5b9a\u4e3a\u9ad8\u5f71\u54cd\u6761\u76ee", 120),
      url: String(row.url || "").trim(),
      source: cleanOutputText(row.source || "Remote", 80),
      category: String(row.category || "Market").trim(),
      time: safeNumber(row.time, now),
      priority: Number((score * 0.62).toFixed(2)),
      pinnedUntil: highImpact ? now + 24 * 3600 * 1000 : 0,
      agentScore: score,
      agentRank: idx + 1,
      topicZh: cleanOutputText(row.topicZh || fallbackTopicZh(row), 40)
    };
  });
}

function needsZhPolish(items) {
  return items.some((row) => {
    const headline = String(row?.headlineZh || "");
    const summary = String(row?.summaryZh || "");
    const reason = String(row?.agentReasonZh || "");
    const topic = String(row?.topicZh || "");
    const merged = `${headline} ${summary} ${reason} ${topic}`;
    if (/&nbsp;|&#160;|\u00a0/i.test(merged)) return true;
    if (!hasChineseText(headline) || latinRatio(headline) > 0.65) return true;
    if (!hasChineseText(summary) || latinRatio(summary) > 0.75) return true;
    if (!hasChineseText(reason) || latinRatio(reason) > 0.85) return true;
    return false;
  });
}

function applyZhPolish(baseItems, patchItems) {
  const byId = new Map();
  for (const raw of patchItems || []) {
    const id = safeNumber(raw?.id, 0);
    if (id > 0) byId.set(id, raw);
  }
  return baseItems.map((row) => {
    const id = safeNumber(row?.id, 0);
    const patch = byId.get(id);
    if (!patch) return row;
    return {
      ...row,
      headlineZh: cleanOutputText(patch.headlineZh || row.headlineZh || row.title, 120),
      summaryZh: cleanOutputText(patch.summaryZh || row.summaryZh || row.summary || "", 240),
      agentReasonZh: cleanOutputText(patch.agentReasonZh || row.agentReasonZh || "", 120),
      topicZh: cleanOutputText(patch.topicZh || row.topicZh || "", 40)
    };
  });
}

async function runOpenAi(candidates, nowIso) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set in remote mode.");
  }

  const callOpenAiRaw = async (body) => {
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    };
    if (OPENAI_SITE_URL) headers["HTTP-Referer"] = OPENAI_SITE_URL;
    if (OPENAI_APP_NAME) headers["X-Title"] = OPENAI_APP_NAME;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`OpenAI timeout after ${OPENAI_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 400)}`);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    const text = cleanJsonText(content);
    if (!text) throw new Error("OpenAI empty response");
    try {
      return JSON.parse(text);
    } catch (error) {
      const repaired = extractFirstJsonObject(text);
      if (repaired && repaired !== text) return JSON.parse(repaired);
      const repairedArr = extractFirstJsonArray(text);
      if (repairedArr && repairedArr !== text) return JSON.parse(repairedArr);
      throw new Error(`OpenAI JSON parse failed: ${error.message}`);
    }
  };

  const isRetryableOpenAiError = (error) => {
    const msg = String(error?.message || "").toLowerCase();
    if (msg.includes("http 429")) return true;
    if (msg.includes("http 408") || msg.includes("http 409")) return true;
    if (msg.includes("http 500") || msg.includes("http 502") || msg.includes("http 503") || msg.includes("http 504")) return true;
    if (msg.includes("temporarily rate-limited") || msg.includes("provider returned error")) return true;
    if (msg.includes("fetch failed") || msg.includes("timeout")) return true;
    if (msg.includes("openai json parse failed")) return true;
    return false;
  };

  const retryDelayMs = (attempt) => {
    const expo = OPENAI_RETRY_BASE_MS * (2 ** Math.max(0, attempt - 1));
    const jitter = Math.floor(Math.random() * Math.max(80, Math.floor(OPENAI_RETRY_BASE_MS * 0.3)));
    return Math.min(OPENAI_RETRY_MAX_MS, expo + jitter);
  };

  const callOpenAiRawWithRetry = async (body) => {
    let lastError = null;
    for (let attempt = 0; attempt <= OPENAI_MAX_RETRIES; attempt += 1) {
      try {
        console.log(`[remote] openai request attempt ${attempt + 1}/${OPENAI_MAX_RETRIES + 1}`);
        return await callOpenAiRaw(body);
      } catch (error) {
        lastError = error;
        if (!isRetryableOpenAiError(error) || attempt >= OPENAI_MAX_RETRIES) break;
        const waitMs = retryDelayMs(attempt + 1);
        console.error(`[remote] openai transient error, retry ${attempt + 1}/${OPENAI_MAX_RETRIES} in ${waitMs}ms -> ${error.message}`);
        await sleep(waitMs);
      }
    }
    throw lastError || new Error("OpenAI call failed");
  };

  const shouldRetryWithoutSchema = (error) => {
    const msg = String(error?.message || "").toLowerCase();
    if (!msg.includes("http 400") && !msg.includes("http 422")) return false;
    return msg.includes("response_format")
      || msg.includes("json_schema")
      || msg.includes("schema")
      || msg.includes("strict")
      || msg.includes("unsupported")
      || msg.includes("not support");
  };

  const shouldRetryWithJsonObject = (error) => {
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("openai json parse failed")
      || msg.includes("unexpected token")
      || msg.includes("not valid json");
  };

  const callOpenAi = async (body) => {
    try {
      return await callOpenAiRawWithRetry(body);
    } catch (error) {
      if (shouldRetryWithJsonObject(error)) {
        console.error("[remote] model output is not valid JSON, retrying with response_format=json_object.");
        const retryBody = { ...body, response_format: { type: "json_object" } };
        const baseMessages = Array.isArray(body.messages) ? body.messages : [];
        retryBody.messages = [
          ...baseMessages,
          { role: "system", content: "Return valid JSON object only. No markdown, no prose." }
        ];
        return await callOpenAiRawWithRetry(retryBody);
      }
      if (!body?.response_format || !shouldRetryWithoutSchema(error)) {
        throw error;
      }
      console.error("[remote] provider does not support response_format json_schema, retrying without schema.");
      const retryBody = { ...body };
      delete retryBody.response_format;
      const baseMessages = Array.isArray(body.messages) ? body.messages : [];
      retryBody.messages = [
        ...baseMessages,
        { role: "system", content: "Return valid JSON only. No markdown fences, no commentary." }
      ];
      return await callOpenAiRawWithRetry(retryBody);
    }
  };

  const nowMs = Date.parse(nowIso) || Date.now();
  const normalizeEventKey = (item) => normalizeDedupTitle(item?.eventKey || item?.title || "").slice(0, 90);
  const chunkFallback = (chunkRows) => chunkRows
    .slice(0, Math.min(OPENAI_STAGE1_PICK_COUNT, chunkRows.length))
    .map((row) => ({
      title: row.title,
      url: row.url,
      source: row.source,
      category: row.category,
      time: row.time,
      headlineZh: row.title,
      summaryZh: fallbackSummaryZh(row),
      agentReasonZh: fallbackReasonZh(row),
      topicZh: fallbackTopicZh(row),
      eventKey: normalizeEventKey(row),
      impactScore: Number((Math.max(1, row.preScore || 1) * 8.2).toFixed(2))
    }));

  const ensureFinalItems = async (parsed, poolRows) => {
    if (!parsed || typeof parsed !== "object") return parsed;
    let items = extractModelItemsFromPayload(parsed, poolRows);
    if (items.length) {
      return { ...parsed, items };
    }

    const validIdSet = new Set(poolRows.map((row) => safeNumber(row?.id, -1)).filter((x) => x > 0));
    try {
      const idRescue = await callOpenAi(createOpenAiIdSelectPayload(poolRows, nowIso));
      const pickedIds = extractIdsFromPayload(idRescue, validIdSet);
      if (pickedIds.length) {
        const rescued = buildItemsFromSelectedIds(pickedIds, poolRows, nowMs);
        if (rescued.length) return { ...parsed, items: rescued };
      } else {
        console.error("[remote] id-rescue returned no valid ids.");
      }
    } catch (error) {
      console.error(`[remote] id-rescue failed -> ${error.message}`);
    }

    // Some free models return incomplete shape; do one compact rescue call.
    const compactPool = poolRows.slice(0, Math.min(48, poolRows.length));
    if (!compactPool.length) return parsed;
    try {
      console.error("[remote] openai final returned no items, retrying compact final prompt.");
      const retry = await callOpenAi(createOpenAiFinalPayload(compactPool, nowIso));
      items = extractModelItemsFromPayload(retry, compactPool);
      if (items.length) return { ...(retry || {}), items };
      const rescue2 = await callOpenAi(createOpenAiIdSelectPayload(compactPool, nowIso));
      const ids2 = extractIdsFromPayload(rescue2, new Set(compactPool.map((row) => safeNumber(row?.id, -1)).filter((x) => x > 0)));
      if (ids2.length) {
        const rescued2 = buildItemsFromSelectedIds(ids2, compactPool, nowMs);
        if (rescued2.length) return { ...(retry || {}), items: rescued2 };
      } else {
        console.error("[remote] compact id-rescue returned no valid ids.");
      }
    } catch (error) {
      console.error(`[remote] compact final retry failed -> ${error.message}`);
    }
    return parsed;
  };

  if (candidates.length <= OPENAI_STAGE1_CHUNK_SIZE) {
    const direct = await callOpenAi(createOpenAiFinalPayload(candidates, nowIso));
    return await ensureFinalItems(direct, candidates);
  }

  const chunks = chunkArray(candidates, OPENAI_STAGE1_CHUNK_SIZE);
  const stage1Rows = [];
  const chunkSummaries = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunkRows = chunks[i];
    console.log(`[remote] openai chunk start ${i + 1}/${chunks.length} (rows=${chunkRows.length})`);
    try {
      const parsed = await callOpenAi(createOpenAiChunkPayload(chunkRows, nowIso, i, chunks.length));
      const picked = Array.isArray(parsed?.items) ? parsed.items : [];
      if (String(parsed?.chunkSummaryZh || "").trim()) {
        chunkSummaries.push(String(parsed.chunkSummaryZh).trim());
      }
      if (!picked.length) {
        stage1Rows.push(...chunkFallback(chunkRows));
        continue;
      }
      for (const raw of picked) {
        const title = String(raw?.title || "").trim();
        const url = String(raw?.url || "").trim();
        const source = String(raw?.source || "").trim();
        const category = String(raw?.category || "Market").trim();
        if (!title || !url || !source) continue;
        stage1Rows.push({
          title,
          url,
          source,
          category,
          time: Number(raw?.time) || nowMs,
          headlineZh: String(raw?.headlineZh || title).trim(),
          summaryZh: String(raw?.summaryZh || fallbackSummaryZh({ title, source, category })).trim(),
          agentReasonZh: String(raw?.agentReasonZh || fallbackReasonZh({ title, source })).trim(),
          topicZh: String(raw?.topicZh || fallbackTopicZh({ title, category })).trim(),
          eventKey: normalizeEventKey(raw),
          impactScore: Number(raw?.impactScore) || Number((Math.max(1, chunkRows.find((x) => x.url === url)?.preScore || 1) * 8.2).toFixed(2))
        });
      }
      console.log(`[remote] openai chunk done ${i + 1}/${chunks.length} (picked=${picked.length})`);
    } catch (error) {
      console.error(`[remote] openai chunk failed (${i + 1}/${chunks.length}) -> ${error.message}`);
      stage1Rows.push(...chunkFallback(chunkRows));
    }
    if (OPENAI_REQUEST_GAP_MS > 0) {
      await sleep(OPENAI_REQUEST_GAP_MS);
    }
  }

  const dedupMap = new Map();
  for (const row of stage1Rows) {
    const key = row.eventKey || normalizeEventKey(row);
    const prev = dedupMap.get(key);
    if (!prev) {
      dedupMap.set(key, row);
      continue;
    }
    const scorePrev = Number(prev.impactScore || 0);
    const scoreNext = Number(row.impactScore || 0);
    if (scoreNext > scorePrev + 0.1 || (Math.abs(scoreNext - scorePrev) <= 0.1 && Number(row.time || 0) > Number(prev.time || 0))) {
      dedupMap.set(key, row);
    }
  }

  const stage2Pool = [...dedupMap.values()]
    .sort((a, b) => {
      if (Math.abs((b.impactScore || 0) - (a.impactScore || 0)) > 0.001) return (b.impactScore || 0) - (a.impactScore || 0);
      return (b.time || 0) - (a.time || 0);
    })
    .slice(0, OPENAI_STAGE2_POOL_LIMIT)
    .map((row, idx) => ({
      id: idx + 1,
      title: row.title,
      summary: row.summaryZh,
      url: row.url,
      source: row.source,
      category: row.category,
      time: row.time,
      preScore: Number(row.impactScore || 0),
      eventKey: row.eventKey,
      topicZh: row.topicZh,
      reasonZh: row.agentReasonZh
    }));

  if (!stage2Pool.length) throw new Error("OpenAI stage1 produced empty pool.");

  console.log(`[remote] openai final start (pool=${stage2Pool.length})`);
  let finalParsed = await callOpenAi(createOpenAiFinalPayload(stage2Pool, nowIso));
  finalParsed = await ensureFinalItems(finalParsed, stage2Pool);
  console.log("[remote] openai final done");
  if (typeof finalParsed !== "object" || !finalParsed) throw new Error("OpenAI final parsed payload invalid.");
  if (!finalParsed.globalSummaryZh && chunkSummaries.length) {
    finalParsed.globalSummaryZh = chunkSummaries.slice(0, 3).join("；");
  }

  if (Array.isArray(finalParsed.items) && finalParsed.items.length) {
    const baseItems = finalParsed.items.map((row, idx) => ({ ...row, id: idx + 1 }));
    if (needsZhPolish(baseItems)) {
      try {
        console.log("[remote] openai zh-polish start");
        const polished = await callOpenAi(createOpenAiZhPolishPayload(baseItems, nowIso));
        const patches = Array.isArray(polished?.items) ? polished.items : [];
        if (patches.length) {
          finalParsed.items = applyZhPolish(baseItems, patches).map((row) => {
            const out = { ...row };
            delete out.id;
            return out;
          });
        } else {
          finalParsed.items = baseItems.map((row) => {
            const out = { ...row };
            delete out.id;
            return out;
          });
        }
        console.log("[remote] openai zh-polish done");
      } catch (error) {
        console.error(`[remote] zh-polish failed -> ${error.message}`);
        finalParsed.items = baseItems.map((row) => {
          const out = { ...row };
          delete out.id;
          return out;
        });
      }
    }
  }
  return finalParsed;
}

async function ensureOutputDir(filePath) {
  const dir = path.dirname(filePath);
  if (!dir || dir === ".") return;
  await mkdir(dir, { recursive: true });
}

async function runSourceJob(name, runner) {
  try {
    const rows = await runner();
    return { name, ok: true, rows };
  } catch (error) {
    console.error(`[remote] source failed: ${name} -> ${error.message}`);
    return { name, ok: false, rows: [], error: error.message };
  }
}

async function main() {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  console.log(`[remote] model=${OPENAI_MODEL} free=${IS_FREE_MODEL} maxCandidates=${MAX_CANDIDATES} chunk=${OPENAI_STAGE1_CHUNK_SIZE} pick=${OPENAI_STAGE1_PICK_COUNT} stage2=${OPENAI_STAGE2_POOL_LIMIT} retries=${OPENAI_MAX_RETRIES}`);

  const jobs = [];
  for (const feed of BASE_RSS_FEEDS) {
    jobs.push({
      name: `RSS ${feed.source} ${feed.url}`,
      run: () => loadFeed(feed)
    });
  }
  for (const feed of EXTRA_RSS_FEEDS) {
    jobs.push({
      name: `RSS ${feed.source} ${feed.url}`,
      run: () => loadFeed(feed)
    });
  }
  for (const cfg of GOOGLE_NEWS_QUERIES) {
    jobs.push({
      name: `GoogleNews ${cfg.hl} ${cfg.category} ${cfg.query}`,
      run: () => loadGoogleNewsRss(cfg)
    });
  }
  for (const cfg of BING_NEWS_QUERIES) {
    jobs.push({
      name: `BingNews ${cfg.category} ${cfg.query}`,
      run: () => loadBingNewsRss(cfg)
    });
  }
  for (const cfg of REDDIT_HOT_FEEDS) {
    jobs.push({
      name: `Reddit hot r/${cfg.subreddit}`,
      run: () => loadRedditHot(cfg)
    });
  }
  for (const cfg of REDDIT_SEARCH_QUERIES) {
    jobs.push({
      name: `Reddit search ${cfg.query}`,
      run: () => loadRedditSearch(cfg)
    });
  }
  for (const cfg of GDELT_FEEDS) {
    jobs.push({
      name: `GDELT ${cfg.category}`,
      run: () => loadGdelt(cfg)
    });
  }

  const results = await Promise.all(jobs.map((job) => runSourceJob(job.name, job.run)));
  const rows = results.flatMap((row) => row.rows);
  const failedFeeds = results.filter((row) => !row.ok).length;
  const failedSources = results.filter((row) => !row.ok).map((row) => row.name);

  const rawPool = buildRawPool(rows, now);
  if (!rawPool.length) throw new Error("No remote raw rows available from feeds.");

  if (REMOTE_CRAWL_ONLY) {
    const payload = {
      crawledAt: nowIso,
      version: "remote-crawler.v1",
      crawlOnly: true,
      model: "",
      failedFeeds,
      failedSources,
      totalFeeds: jobs.length,
      collectedCount: rows.length,
      rawCount: rawPool.length,
      items: rawPool
    };

    const outputJs = [
      "// Auto-generated by tools/remote-news-openai-agent.mjs (crawler mode)",
      `window.__REMOTE_NEWS_AT__ = ${JSON.stringify(payload.crawledAt)};`,
      `window.__REMOTE_NEWS_META__ = ${JSON.stringify({
        version: payload.version,
        crawlOnly: payload.crawlOnly,
        rawCount: payload.rawCount,
        failedFeeds: payload.failedFeeds,
        failedSources: payload.failedSources,
        totalFeeds: payload.totalFeeds
      }, null, 2)};`,
      `window.__REMOTE_NEWS__ = ${JSON.stringify(payload.items, null, 2)};`,
      ""
    ].join("\n");

    await ensureOutputDir(OUTPUT_JSON_FILE);
    await ensureOutputDir(OUTPUT_JS_FILE);
    await writeFile(OUTPUT_JSON_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await writeFile(OUTPUT_JS_FILE, outputJs, "utf8");
    console.log(`[remote] wrote ${OUTPUT_JSON_FILE} and ${OUTPUT_JS_FILE} with ${payload.items.length} raw items`);
    return;
  }

  const candidates = pickCandidates(rows, now);
  if (!candidates.length) throw new Error("No remote candidates available from feeds.");

  let modelPayload = null;
  try {
    modelPayload = await runOpenAi(candidates, nowIso);
  } catch (error) {
    if (!REMOTE_ALLOW_RULE_FALLBACK) {
      throw error;
    }
    console.error(`[remote] OpenAI call failed -> ${error.message}, fallback to rules enabled.`);
  }

  const fallbackItems = fallbackBuild(candidates, now);
  const rawItems = Array.isArray(modelPayload?.items)
    ? modelPayload.items
    : (REMOTE_ALLOW_RULE_FALLBACK ? fallbackItems : []);

  if (!rawItems.length) {
    throw new Error("Remote OpenAI returned no items and rule fallback is disabled.");
  }

  const items = sanitizeItems(rawItems, candidates, now);
  const globalSummaryZh = String(modelPayload?.globalSummaryZh || "").trim();

  const payload = {
    agentAt: nowIso,
    version: "remote-openai-agent.v1",
    model: OPENAI_MODEL,
    failedFeeds,
    failedSources,
    totalFeeds: jobs.length,
    collectedCount: rows.length,
    candidateCount: candidates.length,
    globalSummaryZh,
    sourceStats: buildSourceStats(items),
    items
  };

  const outputJs = [
    "// Auto-generated by tools/remote-news-openai-agent.mjs",
    `window.__REMOTE_NEWS_AT__ = ${JSON.stringify(payload.agentAt)};`,
    `window.__REMOTE_NEWS_META__ = ${JSON.stringify({
      version: payload.version,
      model: payload.model,
      candidateCount: payload.candidateCount,
      failedFeeds: payload.failedFeeds,
      failedSources: payload.failedSources,
      totalFeeds: payload.totalFeeds
    }, null, 2)};`,
    `window.__REMOTE_NEWS__ = ${JSON.stringify(payload.items, null, 2)};`,
    ""
  ].join("\n");

  await ensureOutputDir(OUTPUT_JSON_FILE);
  await ensureOutputDir(OUTPUT_JS_FILE);
  await writeFile(OUTPUT_JSON_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(OUTPUT_JS_FILE, outputJs, "utf8");

  console.log(`[remote] wrote ${OUTPUT_JSON_FILE} and ${OUTPUT_JS_FILE} with ${items.length} items`);
}

main().catch((error) => {
  console.error(`[remote] failed: ${error.stack || error.message}`);
  process.exit(1);
});
