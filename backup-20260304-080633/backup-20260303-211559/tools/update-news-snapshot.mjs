import { writeFile } from "node:fs/promises";

const OUTPUT_FILE = "news.snapshot.js";
const MAX_ITEMS = 120;

const FEEDS = [
  { url: "https://feeds.reuters.com/reuters/businessNews", category: "Market", source: "Reuters" },
  { url: "https://feeds.reuters.com/reuters/worldNews", category: "Geo", source: "Reuters" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", category: "Market", source: "CNBC" },
  { url: "https://finance.yahoo.com/news/rssindex", category: "Market", source: "YahooFinance" },
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", category: "Crypto", source: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", category: "Crypto", source: "Cointelegraph" },
  { url: buildGoogleNews("bitcoin OR ethereum OR crypto etf", "en-US", "US", "US:en"), category: "Crypto", source: "GoogleNews" },
  { url: buildGoogleNews("federal reserve OR cpi OR inflation OR treasury yield", "en-US", "US", "US:en"), category: "Macro", source: "GoogleNews" },
  { url: buildGoogleNews("stock market OR nasdaq OR s&p 500 OR dollar index OR oil OR gold", "en-US", "US", "US:en"), category: "Market", source: "GoogleNews" },
  { url: buildGoogleNews("geopolitics OR sanctions OR conflict OR middle east", "en-US", "US", "US:en"), category: "Geo", source: "GoogleNews" },
  { url: buildGoogleNews("美联储 OR CPI OR 通胀 OR 非农 OR 美债收益率", "zh-CN", "CN", "CN:zh-Hans"), category: "Macro", source: "GoogleNews" },
  { url: buildGoogleNews("股市 OR 纳斯达克 OR 标普 OR 美元指数 OR 黄金 OR 原油", "zh-CN", "CN", "CN:zh-Hans"), category: "Market", source: "GoogleNews" }
];

const GDELT_QUERIES = [
  { category: "Geo", query: "(geopolitics OR war OR sanctions OR tariff OR oil supply OR conflict OR central bank)" },
  { category: "Crypto", query: "(bitcoin OR crypto OR ethereum OR stablecoin OR ETF OR exchange) AND (market OR regulation OR inflow OR volatility)" },
  { category: "Macro", query: "(fed OR cpi OR inflation OR treasury yield OR interest rate OR dollar index) AND (bitcoin OR crypto OR risk assets)" },
  { category: "Policy", query: "(SEC OR regulation OR policy OR lawsuit OR approval OR ban) AND (bitcoin OR crypto OR ETF)" },
  { category: "Market", query: "(stock market OR equities OR treasury yield OR bond market OR dollar index OR oil OR gold) AND (volatility OR risk assets OR recession OR earnings)" }
];

const REDDIT_SUBS = [
  { subreddit: "worldnews", category: "Geo" },
  { subreddit: "economics", category: "Macro" },
  { subreddit: "investing", category: "Market" },
  { subreddit: "stocks", category: "Market" },
  { subreddit: "CryptoCurrency", category: "Crypto" }
];

const REDDIT_SEARCH = [
  { query: "federal reserve OR CPI OR treasury yield OR stock market OR oil", category: "Macro" },
  { query: "bitcoin OR ethereum OR crypto ETF OR SEC", category: "Crypto" },
  { query: "geopolitics OR sanctions OR conflict OR middle east", category: "Geo" }
];

function buildGoogleNews(query, hl, gl, ceid) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
}

function decodeEntities(input) {
  return String(input || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function stripHtml(input) {
  return String(input || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanTitle(raw) {
  const text = stripHtml(decodeEntities(raw)).replace(/\s+/g, " ").trim();
  if (!text) return "";
  const parts = text.split(" - ");
  if (parts.length >= 2) {
    const tail = parts[parts.length - 1];
    if (tail.length <= 42) return parts.slice(0, -1).join(" - ").trim() || text;
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

function normalizeTitleForDedup(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\([^)]*\)$/g, " ")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\b(reuters|cnbc|yahoo finance|cointelegraph|coindesk|the block|decrypt)\b/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function parseRss(xmlText, category, sourcePrefix) {
  const xml = String(xmlText || "");
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const chunks = isAtom ? xml.match(/<entry[\s\S]*?<\/entry>/gi) || [] : xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const out = [];
  for (const chunk of chunks) {
    const titleRaw = extractTag(chunk, "title");
    const linkRaw = isAtom ? extractAtomLink(chunk) : extractTag(chunk, "link");
    const pubDateRaw = isAtom ? extractTag(chunk, "updated") || extractTag(chunk, "published") : extractTag(chunk, "pubDate");
    const sourceRaw = extractTag(chunk, "source");
    const title = cleanTitle(titleRaw);
    const url = decodeEntities(linkRaw);
    const source = cleanTitle(sourceRaw) || sourcePrefix;
    const ts = Date.parse(stripHtml(decodeEntities(pubDateRaw)));
    if (!title || !url) continue;
    out.push({
      title,
      url,
      source: `${sourcePrefix}/${source}`,
      category,
      time: Number.isFinite(ts) ? ts : Date.now(),
      engagement: 0
    });
  }
  return out;
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (news-snapshot-builder)"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeoutMs = 15000) {
  const text = await fetchText(url, timeoutMs);
  return JSON.parse(text);
}

function sourceNameFromUrl(url) {
  try {
    const host = new URL(String(url || "")).hostname.replace(/^www\./i, "");
    if (!host) return "News";
    const base = host.split(".").slice(0, -1).join(".");
    return base || host;
  } catch {
    return "News";
  }
}

async function loadFeed(feed) {
  try {
    const xml = await fetchText(feed.url);
    return parseRss(xml, feed.category, feed.source);
  } catch (error) {
    console.error(`[snapshot] feed failed: ${feed.source} ${feed.url} -> ${error.message}`);
    return [];
  }
}

async function loadGdelt(job) {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(job.query)}&mode=ArtList&maxrecords=16&format=json&sort=DateDesc`;
  try {
    const data = await fetchJson(url, 16000);
    const rows = Array.isArray(data?.articles) ? data.articles : [];
    return rows
      .map((a) => ({
        title: cleanTitle(a?.title),
        url: String(a?.url || "").trim(),
        source: `GDELT/${cleanTitle(a?.sourcecommonname || a?.domain || sourceNameFromUrl(a?.url)) || "News"}`,
        category: job.category,
        time: Date.parse(String(a?.seendate || "")) || Date.now(),
        engagement: 0
      }))
      .filter((r) => r.title && r.url);
  } catch (error) {
    console.error(`[snapshot] gdelt failed: ${job.category} -> ${error.message}`);
    return [];
  }
}

async function loadRedditSub(job) {
  const url = `https://www.reddit.com/r/${job.subreddit}/hot.json?limit=10`;
  try {
    const data = await fetchJson(url, 14000);
    const rows = Array.isArray(data?.data?.children) ? data.data.children : [];
    return rows
      .map((item) => item?.data)
      .filter(Boolean)
      .map((post) => ({
        title: cleanTitle(post.title),
        url: String(post.url || "").trim(),
        source: `Reddit/${job.subreddit}`,
        category: job.category,
        time: Number(post.created_utc) * 1000 || Date.now(),
        engagement: Number(post.score || 0) + Number(post.num_comments || 0)
      }))
      .filter((r) => r.title && r.url);
  } catch (error) {
    console.error(`[snapshot] reddit failed: r/${job.subreddit} -> ${error.message}`);
    return [];
  }
}

async function loadRedditSearch(job) {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(job.query)}&sort=new&t=day&limit=12`;
  try {
    const data = await fetchJson(url, 14000);
    const rows = Array.isArray(data?.data?.children) ? data.data.children : [];
    return rows
      .map((item) => item?.data)
      .filter(Boolean)
      .map((post) => ({
        title: cleanTitle(post.title),
        url: String(post.url || "").trim(),
        source: `Reddit/Search/${post.subreddit || "all"}`,
        category: job.category,
        time: Number(post.created_utc) * 1000 || Date.now(),
        engagement: Number(post.score || 0) + Number(post.num_comments || 0)
      }))
      .filter((r) => r.title && r.url);
  } catch (error) {
    console.error(`[snapshot] reddit search failed: ${job.query} -> ${error.message}`);
    return [];
  }
}

async function main() {
  const rssRows = (await Promise.all(FEEDS.map(loadFeed))).flat();
  const gdeltRows = (await Promise.all(GDELT_QUERIES.map(loadGdelt))).flat();
  const redditRows = (await Promise.all(REDDIT_SUBS.map(loadRedditSub))).flat();
  const redditSearchRows = (await Promise.all(REDDIT_SEARCH.map(loadRedditSearch))).flat();
  const rows = [...rssRows, ...gdeltRows, ...redditRows, ...redditSearchRows];
  rows.sort((a, b) => (b.time || 0) - (a.time || 0));

  const dedup = [];
  const seen = new Set();
  for (const row of rows) {
    const key = normalizeTitleForDedup(row.title) || `${row.source}|${row.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(row);
    if (dedup.length >= MAX_ITEMS) break;
  }

  const output = [
    "// Auto-generated by tools/update-news-snapshot.mjs",
    `window.__NEWS_SNAPSHOT_AT__ = ${JSON.stringify(new Date().toISOString())};`,
    `window.__NEWS_SNAPSHOT__ = ${JSON.stringify(dedup, null, 2)};`,
    ""
  ].join("\n");

  await writeFile(OUTPUT_FILE, output, "utf8");
  console.log(`[snapshot] wrote ${OUTPUT_FILE} with ${dedup.length} items`);
}

main().catch((error) => {
  console.error(`[snapshot] failed: ${error.stack || error.message}`);
  process.exit(1);
});
