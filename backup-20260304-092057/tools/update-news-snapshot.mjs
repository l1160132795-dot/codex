import { readFile, writeFile } from "node:fs/promises";

const OUTPUT_JS_FILE = "news.snapshot.js";
const OUTPUT_JSON_FILE = "news.snapshot.json";
const MAX_ITEMS = 120;
const HIGH_PRIORITY_THRESHOLD = 20;
const PIN_HOURS = 24;
const PIN_MS = PIN_HOURS * 60 * 60 * 1000;
const MAX_X_ITEMS = 40;
const MAX_WEIBO_ITEMS = 40;

const FEEDS = [
  { url: "https://www.federalreserve.gov/feeds/press_all.xml", category: "Policy", source: "Fed" },
  { url: "https://www.sec.gov/news/pressreleases.rss", category: "Policy", source: "SEC" },
  { url: "https://www.ecb.europa.eu/rss/press.html", category: "Macro", source: "ECB" },
  { url: "https://www.bankofengland.co.uk/rss/news", category: "Macro", source: "BoE" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", category: "Market", source: "CNBC" },
  { url: "https://www.cnbc.com/id/100727362/device/rss/rss.html", category: "Geo", source: "CNBC" },
  { url: "https://cointelegraph.com/rss", category: "Crypto", source: "Cointelegraph" },
  { url: "https://cn.cointelegraph.com/rss", category: "Crypto", source: "CointelegraphCN" },
  { url: "https://www.panewslab.com/rss.xml", category: "Crypto", source: "PANews" },
  { url: "https://www.coindar.org/en/rss", category: "Crypto", source: "Coindar" },
  { url: "https://www.fxstreet.com/rss/news", category: "Macro", source: "FXStreet" },
  { url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets", category: "Market", source: "Nasdaq" }
];

const X_TRENDS_URL = "https://trends24.in/united-states/";
const WEIBO_HOT_URL = "https://api.weibo.cn/2/guest/search/hot/word?c=android&s=7ece665d";

const SOURCE_WEIGHTS = {
  Fed: 9.6,
  SEC: 9.4,
  ECB: 9.0,
  BoE: 8.8,
  CNBC: 7.2,
  Nasdaq: 6.9,
  FXStreet: 6.4,
  PANews: 6.0,
  Cointelegraph: 5.8,
  CointelegraphCN: 5.8,
  Coindar: 5.2,
  "X/Trends24": 4.2,
  WeiboHot: 4.0
};

const CATEGORY_WEIGHTS = {
  Policy: 4.2,
  Geo: 4.0,
  Macro: 3.7,
  Market: 3.2,
  Crypto: 3.0,
  Social: 1.5
};

const FINANCE_PATTERNS = [
  /\b(bitcoin|btc|ethereum|eth|xrp|solana|sol|doge|ada|defi|stablecoin|token|crypto|exchange|etf|sec|fed|fomc|inflation|cpi|pce|yield|treasury|dollar|dxy|nasdaq|dow|s&p|oil|gold|bank|rate|earnings)\b/i,
  /(比特币|以太坊|稳定币|加密|监管|美联储|通胀|非农|利率|收益率|美元|纳指|标普|原油|黄金|财报|银行|政策)/
];

const HIGH_IMPACT_PATTERNS = [
  /\b(attack|war|invasion|missile|bombing|assault|sanction|embargo|ceasefire|martial|coup|state\s+of\s+emergency|executive\s+order|default|bankruptcy|emergency\s+meeting|rate\s+hike|rate\s+cut)\b/i,
  /(战争|冲突|袭击|导弹|制裁|禁运|停火|紧急状态|行政令|违约|破产|紧急会议|加息|降息|重大公告)/
];

const MEDIUM_IMPACT_PATTERNS = [
  /\b(regulation|lawsuit|approval|ban|tariff|inflation|cpi|pce|payroll|unemployment|gdp|pmi|treasury|yield|earnings|guidance|downgrade|upgrade|hack|exploit)\b/i,
  /(监管|诉讼|获批|禁令|关税|通胀|就业|GDP|PMI|美债|收益率|财报|黑客|漏洞)/
];

const LOW_SIGNAL_PATTERNS = [
  /\bearnings\s+(call\s+)?transcript\b/i,
  /\bq[1-4]\s+\d{4}\s+earnings\b/i,
  /(财报电话会纪要|电话会纪要|会议纪要)/
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
    .replace(/\b(reuters|cnbc|cointelegraph|coindesk|the block|decrypt|fed|sec|ecb|boe)\b/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function newsDedupKey(row) {
  const titleKey = normalizeTitleForDedup(row?.title || "");
  if (titleKey) return titleKey;
  return `${String(row?.source || "News").toLowerCase()}|${String(row?.url || "")}`;
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
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (error) {
      lastError = error;
      if (i < retries) await new Promise((resolve) => setTimeout(resolve, 360 * (i + 1)));
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

function classifyCategoryByKeyword(text) {
  const body = String(text || "").toLowerCase();
  if (/(战争|冲突|袭击|中东|制裁|外交|乌克兰|俄|伊朗|以色列|\bwar\b|\bconflict\b|\biran\b|\bisrael\b|\bukraine\b|\brussia\b|\bsanction\b|\bmiddle east\b)/i.test(body)) return "Geo";
  if (/(美联储|央行|通胀|非农|失业|GDP|利率|收益率|\bfed\b|\becb\b|\bboe\b|\bcpi\b|\bpce\b|\binflation\b|\bpayroll\b|\bunemployment\b|\bgdp\b|\brate\b|\byield\b)/i.test(body)) return "Macro";
  if (/(监管|法案|行政令|诉讼|获批|禁令|SEC|政策|\bregulation\b|\blawsuit\b|\bapproval\b|\bban\b|\bpolicy\b|\bsec\b)/i.test(body)) return "Policy";
  if (/(比特币|以太坊|稳定币|交易所|加密|链上|\bbitcoin\b|\bethereum\b|\bstablecoin\b|\bcrypto\b|\btoken\b|\bblockchain\b|\bexchange\b)/i.test(body)) return "Crypto";
  if (/(美股|纳指|标普|道指|原油|黄金|财报|债券|美元|\bstock\b|\bnasdaq\b|\bs&p\b|\bdow\b|\boil\b|\bgold\b|\bearnings\b|\bbond\b|\bdollar\b)/i.test(body)) return "Market";
  return "Social";
}

function isFinanceTopic(text) {
  return FINANCE_PATTERNS.some((re) => re.test(String(text || "")));
}

function sourceWeight(source) {
  const key = String(source || "").split("/")[0];
  return SOURCE_WEIGHTS[key] || 3.2;
}

function keywordImpactScore(text) {
  const body = String(text || "");
  let score = 0;
  for (const re of HIGH_IMPACT_PATTERNS) {
    if (re.test(body)) score += 5.2;
  }
  for (const re of MEDIUM_IMPACT_PATTERNS) {
    if (re.test(body)) score += 2.1;
  }
  return score;
}

function computePriority(item, now = Date.now()) {
  const sourceScore = sourceWeight(item.source);
  const categoryScore = CATEGORY_WEIGHTS[item.category] || 2.4;
  const keywordScore = keywordImpactScore(item.title);
  const financeBoost = isFinanceTopic(item.title) ? 1.3 : -0.6;
  const lowSignalPenalty = LOW_SIGNAL_PATTERNS.some((re) => re.test(String(item.title || ""))) ? 4.2 : 0;
  const engagement = Number(item.engagement);
  const engagementScore = Number.isFinite(engagement) ? Math.min(4, Math.log10(Math.max(10, engagement)) - 1) : 0;
  const ageHours = Math.max(0, (now - Number(item.time || now)) / 3600000);
  const recencyScore = Math.max(0, 4.2 - ageHours * 0.12);
  return sourceScore + categoryScore + keywordScore + financeBoost + engagementScore + recencyScore - lowSignalPenalty;
}

function shouldPin(item) {
  const priority = Number(item?.priority || 0);
  const keywordScore = keywordImpactScore(item?.title || "");
  const authority = sourceWeight(item?.source || "");
  const category = String(item?.category || "");
  if (priority < HIGH_PRIORITY_THRESHOLD) return false;
  if (keywordScore >= 5) return true;
  if (authority >= 8.8 && (category === "Policy" || category === "Macro" || category === "Geo")) return true;
  return false;
}

function toChineseCategory(category) {
  const map = { Policy: "政策", Geo: "地缘", Macro: "宏观", Crypto: "加密", Social: "社区", Market: "市场" };
  return map[String(category || "")] || "市场";
}

function buildSummaryZh(item) {
  const cat = toChineseCategory(item.category);
  const source = String(item.source || "News").split("/")[0];
  const raw = String(item.title || "").replace(/\s+/g, " ").trim();
  const short = raw.length > 48 ? `${raw.slice(0, 48)}...` : raw;
  const impact = Number(item.priority) >= HIGH_PRIORITY_THRESHOLD ? "该事件影响面较大，建议持续跟踪。" : "建议关注后续进展。";
  if (/[\u4e00-\u9fff]/.test(short)) return `${cat}概括：${short}。来源：${source}。${impact}`;
  return `${cat}概括：${short}。来源：${source}。${impact}`;
}

function normalizeItem(row, now = Date.now()) {
  const title = cleanTitle(row?.title || "");
  const url = String(row?.url || "").trim();
  if (!title || !url) return null;
  const timeVal = Number(row?.time);
  const item = {
    title,
    url,
    source: String(row?.source || "News").trim(),
    category: String(row?.category || classifyCategoryByKeyword(title)).trim(),
    time: Number.isFinite(timeVal) ? timeVal : now,
    engagement: Number.isFinite(Number(row?.engagement)) ? Number(row?.engagement) : 0,
    priority: Number.isFinite(Number(row?.priority)) ? Number(row?.priority) : 0,
    pinnedUntil: Number.isFinite(Number(row?.pinnedUntil)) ? Number(row?.pinnedUntil) : 0,
    summaryZh: String(row?.summaryZh || "").trim()
  };
  if (!item.priority) {
    item.priority = computePriority(item, now);
  }
  if (!item.pinnedUntil && shouldPin(item)) {
    item.pinnedUntil = now + PIN_MS;
  }
  if (!item.summaryZh) {
    item.summaryZh = buildSummaryZh(item);
  }
  return item;
}

async function readPreviousItems() {
  try {
    const raw = await readFile(OUTPUT_JSON_FILE, "utf8");
    const payload = JSON.parse(raw);
    return Array.isArray(payload?.items) ? payload.items : [];
  } catch {
    return [];
  }
}

function mergeRows(currentRows, previousRows, now = Date.now()) {
  const map = new Map();

  const upsert = (row) => {
    const key = newsDedupKey(row);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
      return;
    }
    const prevRank = (prev.priority || 0) + ((prev.pinnedUntil || 0) > now ? 2.8 : 0);
    const nextRank = (row.priority || 0) + ((row.pinnedUntil || 0) > now ? 2.8 : 0);
    if (nextRank > prevRank + 0.15 || ((Math.abs(nextRank - prevRank) <= 0.15) && (row.time || 0) > (prev.time || 0))) {
      row.pinnedUntil = Math.max(Number(row.pinnedUntil) || 0, Number(prev.pinnedUntil) || 0);
      map.set(key, row);
      return;
    }
    prev.pinnedUntil = Math.max(Number(prev.pinnedUntil) || 0, Number(row.pinnedUntil) || 0);
    if (!prev.summaryZh && row.summaryZh) prev.summaryZh = row.summaryZh;
    map.set(key, prev);
  };

  for (const row of currentRows) {
    const normalized = normalizeItem(row, now);
    if (!normalized) continue;
    upsert(normalized);
  }

  for (const row of previousRows) {
    const normalized = normalizeItem(row, now);
    if (!normalized) continue;
    if ((normalized.pinnedUntil || 0) <= now) continue;
    if (!shouldPin(normalized)) continue;
    const ageHours = (now - normalized.time) / 3600000;
    if (ageHours > PIN_HOURS + 12) continue;
    normalized.priority = Math.max(normalized.priority || 0, HIGH_PRIORITY_THRESHOLD - 0.6);
    upsert(normalized);
  }

  const ranked = [...map.values()].sort((a, b) => {
    const pinA = (a.pinnedUntil || 0) > now ? 2.8 : 0;
    const pinB = (b.pinnedUntil || 0) > now ? 2.8 : 0;
    const scoreA = (a.priority || 0) + pinA;
    const scoreB = (b.priority || 0) + pinB;
    if (Math.abs(scoreB - scoreA) > 0.001) return scoreB - scoreA;
    return (b.time || 0) - (a.time || 0);
  });

  return ranked.slice(0, MAX_ITEMS);
}

async function loadFeed(feed) {
  try {
    const xml = await fetchText(feed.url, 16000, 1);
    return parseRss(xml, feed.category, feed.source);
  } catch (error) {
    console.error(`[snapshot] feed failed: ${feed.source} ${feed.url} -> ${error.message}`);
    return [];
  }
}

function normalizeXTrendLabel(raw) {
  const label = decodeURIComponent(String(raw || "")).replace(/\+/g, " ").replace(/\s+/g, " ").trim();
  if (!label) return "";
  return label.startsWith("#") ? label : `#${label}`;
}

async function loadXHotTopics() {
  try {
    const html = await fetchText(X_TRENDS_URL, 16000, 1);
    const re = /https:\/\/twitter\.com\/search\?q=([^"&]+)[^"<]*/g;
    const labels = [];
    const seen = new Set();
    let match;
    while ((match = re.exec(html)) !== null) {
      const label = normalizeXTrendLabel(match[1]);
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(label);
      if (labels.length >= 120) break;
    }

    const finance = labels.filter((x) => isFinanceTopic(x));
    if (finance.length < 12) {
      const fallback = [
        "#Bitcoin", "#Ethereum", "#FederalReserve", "#Inflation", "#CPI",
        "#Nasdaq", "#SP500", "#TreasuryYield", "#Gold", "#Oil", "#USD", "#CryptoETF"
      ];
      for (const tag of fallback) {
        if (finance.length >= 20) break;
        if (!finance.some((x) => x.toLowerCase() === tag.toLowerCase())) finance.push(tag);
      }
    }

    return finance.slice(0, MAX_X_ITEMS).map((label, idx) => ({
      title: `X 财经热点：${label}`,
      url: `https://x.com/search?q=${encodeURIComponent(label)}`,
      source: "X/Trends24",
      category: classifyCategoryByKeyword(label),
      time: Date.now() - idx * 3000,
      engagement: Math.max(10, 1500 - idx * 12)
    }));
  } catch (error) {
    console.error(`[snapshot] x hot failed: ${error.message}`);
    return [];
  }
}

async function loadWeiboHotTopics() {
  try {
    const json = await fetchJson(WEIBO_HOT_URL, 16000, 1);
    const rows = Array.isArray(json?.data) ? json.data : [];
    const now = Date.now();
    return rows
      .map((row, idx) => {
        const word = String(row?.word || "").replace(/\s+/g, " ").trim();
        if (!word) return null;
        const hot = Number(row?.num);
        return {
          title: `微博热搜：${word}`,
          url: `https://s.weibo.com/weibo?q=${encodeURIComponent(word)}`,
          source: "WeiboHot",
          category: classifyCategoryByKeyword(word),
          time: now - idx * 4000,
          engagement: Number.isFinite(hot) ? hot : Math.max(20, 900000 - idx * 5000)
        };
      })
      .filter(Boolean)
      .slice(0, MAX_WEIBO_ITEMS);
  } catch (error) {
    console.error(`[snapshot] weibo hot failed: ${error.message}`);
    return [];
  }
}

async function main() {
  const previousRows = await readPreviousItems();
  const rssRows = (await Promise.all(FEEDS.map(loadFeed))).flat();
  const [xRows, weiboRows] = await Promise.all([loadXHotTopics(), loadWeiboHotTopics()]);
  const merged = mergeRows([...rssRows, ...xRows, ...weiboRows], previousRows, Date.now());

  const payload = {
    snapshotAt: new Date().toISOString(),
    items: merged
  };

  const outputJs = [
    "// Auto-generated by tools/update-news-snapshot.mjs",
    `window.__NEWS_SNAPSHOT_AT__ = ${JSON.stringify(payload.snapshotAt)};`,
    `window.__NEWS_SNAPSHOT__ = ${JSON.stringify(payload.items, null, 2)};`,
    ""
  ].join("\n");

  await writeFile(OUTPUT_JS_FILE, outputJs, "utf8");
  await writeFile(OUTPUT_JSON_FILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[snapshot] wrote ${OUTPUT_JS_FILE} and ${OUTPUT_JSON_FILE} with ${payload.items.length} items`);
}

main().catch((error) => {
  console.error(`[snapshot] failed: ${error.stack || error.message}`);
  process.exit(1);
});
