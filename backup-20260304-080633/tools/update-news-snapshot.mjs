import { writeFile } from "node:fs/promises";

const OUTPUT_JS_FILE = "news.snapshot.js";
const OUTPUT_JSON_FILE = "news.snapshot.json";
const MAX_ITEMS = 120;

const FEEDS = [
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", category: "Market", source: "CNBC" },
  { url: "https://www.cnbc.com/id/100727362/device/rss/rss.html", category: "Geo", source: "CNBC" },
  { url: "https://cointelegraph.com/rss", category: "Crypto", source: "Cointelegraph" },
  { url: "https://cn.cointelegraph.com/rss", category: "Crypto", source: "CointelegraphCN" },
  { url: "https://www.panewslab.com/rss.xml", category: "Crypto", source: "PANews" },
  { url: "https://www.coindar.org/en/rss", category: "Crypto", source: "Coindar" },
  { url: "https://www.fxstreet.com/rss/news", category: "Macro", source: "FXStreet" },
  { url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets", category: "Market", source: "Nasdaq" }
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
          "User-Agent": "Mozilla/5.0 (news-snapshot-builder)"
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (error) {
      lastError = error;
      if (i < retries) await new Promise((resolve) => setTimeout(resolve, 320 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("fetch failed");
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

async function main() {
  const rssRows = (await Promise.all(FEEDS.map(loadFeed))).flat();
  const rows = [...rssRows];
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

  const snapshotAt = new Date().toISOString();
  const payload = {
    snapshotAt,
    items: dedup
  };

  const outputJs = [
    "// Auto-generated by tools/update-news-snapshot.mjs",
    `window.__NEWS_SNAPSHOT_AT__ = ${JSON.stringify(snapshotAt)};`,
    `window.__NEWS_SNAPSHOT__ = ${JSON.stringify(dedup, null, 2)};`,
    ""
  ].join("\n");

  await writeFile(OUTPUT_JS_FILE, outputJs, "utf8");
  await writeFile(OUTPUT_JSON_FILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[snapshot] wrote ${OUTPUT_JS_FILE} and ${OUTPUT_JSON_FILE} with ${dedup.length} items`);
}

main().catch((error) => {
  console.error(`[snapshot] failed: ${error.stack || error.message}`);
  process.exit(1);
});
