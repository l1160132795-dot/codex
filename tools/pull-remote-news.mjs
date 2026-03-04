import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const REMOTE_NEWS_URL = String(process.env.REMOTE_NEWS_URL || "").trim();
const REMOTE_NEWS_AUTH_TOKEN = String(process.env.REMOTE_NEWS_AUTH_TOKEN || "").trim();
const REMOTE_NEWS_TIMEOUT_MS = Math.max(4000, Number(process.env.REMOTE_NEWS_TIMEOUT_MS || 12000));
const REMOTE_NEWS_STRICT = String(process.env.REMOTE_NEWS_STRICT || "0") === "1";

const OUTPUT_JSON_FILE = "news.remote.json";
const OUTPUT_JS_FILE = "news.remote.js";
const MIN_ITEMS = 6;

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function decodeEntities(input) {
  return String(input || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function cleanText(input, maxLen = 240) {
  const raw = decodeEntities(input)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|\u00a0/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function toChineseCategory(category) {
  const map = { Policy: "政策", Geo: "地缘", Macro: "宏观", Market: "市场", Crypto: "加密", Social: "社区" };
  return map[String(category || "")] || "市场";
}

function normalizeItem(raw) {
  const title = cleanText(raw?.title || "", 180);
  const url = String(raw?.url || "").trim();
  const source = cleanText(raw?.source || "Remote", 80);
  const category = String(raw?.category || "Market").trim();
  if (!title || !url) return null;
  const summaryRaw = cleanText(raw?.summary || raw?.summaryZh || "", 240);
  const headlineRaw = cleanText(raw?.headlineZh || "", 120);
  const reasonRaw = cleanText(raw?.agentReasonZh || "", 120);
  const topicRaw = cleanText(raw?.topicZh || "", 40);

  const headlineZh = (hasChineseText(headlineRaw) && latinRatio(headlineRaw) <= 0.65)
    ? headlineRaw
    : (() => {
      const cat = toChineseCategory(category);
      const src = source.split("/")[0] || "来源";
      const short = hasChineseText(title) ? cleanText(title, 72) : `${src}发布重要${cat}动态`;
      return `【${cat}】${short}`;
    })();
  const summaryZh = (hasChineseText(cleanText(raw?.summaryZh || "", 240)) && latinRatio(raw?.summaryZh || "") <= 0.75)
    ? cleanText(raw?.summaryZh || "", 240)
    : (hasChineseText(summaryRaw) ? summaryRaw : `【${toChineseCategory(category)}】来自${source.split("/")[0]}的重点动态，详见原文链接。`);
  const agentReasonZh = (hasChineseText(reasonRaw) && latinRatio(reasonRaw) <= 0.85)
    ? reasonRaw
    : "来源权威性与市场影响较高";
  const topicZh = (hasChineseText(topicRaw) && latinRatio(topicRaw) <= 0.8)
    ? topicRaw
    : `${toChineseCategory(category)}领域`;

  return {
    title,
    headlineZh,
    summaryZh,
    agentReasonZh,
    summary: summaryRaw,
    url,
    source,
    category,
    time: safeNumber(raw?.time, Date.now()),
    engagement: safeNumber(raw?.engagement, 0),
    priority: safeNumber(raw?.priority, 0),
    pinnedUntil: safeNumber(raw?.pinnedUntil, 0),
    agentScore: safeNumber(raw?.agentScore, 0),
    agentRank: safeNumber(raw?.agentRank, 0),
    topicZh
  };
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { "Accept": "application/json,text/plain;q=0.9,*/*;q=0.8" };
    if (REMOTE_NEWS_AUTH_TOKEN) headers.Authorization = `Bearer ${REMOTE_NEWS_AUTH_TOKEN}`;
    const stamp = Date.now();
    const reqUrl = `${url}${url.includes("?") ? "&" : "?"}_=${stamp}`;
    const res = await fetch(reqUrl, { method: "GET", headers, cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!dir || dir === ".") return;
  await mkdir(dir, { recursive: true });
}

async function main() {
  if (!REMOTE_NEWS_URL) {
    console.log("[remote-pull] REMOTE_NEWS_URL not set, skip remote pull.");
    return;
  }

  try {
    const remotePayload = await fetchJsonWithTimeout(REMOTE_NEWS_URL, REMOTE_NEWS_TIMEOUT_MS);
    const rows = Array.isArray(remotePayload?.items) ? remotePayload.items : [];
    const items = rows.map((row) => normalizeItem(row)).filter(Boolean);
    if (items.length < MIN_ITEMS) throw new Error(`remote rows too few: ${items.length}`);

    items.sort((a, b) => {
      if (a.agentRank > 0 && b.agentRank > 0 && a.agentRank !== b.agentRank) return a.agentRank - b.agentRank;
      if (Math.abs((b.agentScore || 0) - (a.agentScore || 0)) > 0.0001) return (b.agentScore || 0) - (a.agentScore || 0);
      return (b.time || 0) - (a.time || 0);
    });

    const payload = {
      pulledAt: new Date().toISOString(),
      remoteAgentAt: String(remotePayload?.agentAt || remotePayload?.crawledAt || ""),
      remoteVersion: String(remotePayload?.version || ""),
      remoteModel: String(remotePayload?.model || ""),
      remoteCrawlOnly: Boolean(remotePayload?.crawlOnly),
      remoteFailedFeeds: safeNumber(remotePayload?.failedFeeds, 0),
      remoteFailedSources: Array.isArray(remotePayload?.failedSources) ? remotePayload.failedSources.slice(0, 80) : [],
      remoteTotalFeeds: safeNumber(remotePayload?.totalFeeds, 0),
      remoteCollectedCount: safeNumber(remotePayload?.collectedCount, 0),
      remoteRawCount: safeNumber(remotePayload?.rawCount, items.length),
      sourceUrl: REMOTE_NEWS_URL,
      globalSummaryZh: cleanText(remotePayload?.globalSummaryZh || "", 500),
      items
    };

    const jsOut = [
      "// Auto-generated by tools/pull-remote-news.mjs",
      `window.__REMOTE_NEWS_PULL_AT__ = ${JSON.stringify(payload.pulledAt)};`,
      `window.__REMOTE_NEWS__ = ${JSON.stringify(payload.items, null, 2)};`,
      ""
    ].join("\n");

    await ensureDir(OUTPUT_JSON_FILE);
    await ensureDir(OUTPUT_JS_FILE);
    await writeFile(OUTPUT_JSON_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await writeFile(OUTPUT_JS_FILE, jsOut, "utf8");
    console.log(`[remote-pull] wrote ${OUTPUT_JSON_FILE} and ${OUTPUT_JS_FILE} with ${items.length} items`);
  } catch (error) {
    console.error(`[remote-pull] failed: ${error.message}`);
    if (REMOTE_NEWS_STRICT) {
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(`[remote-pull] fatal: ${error.stack || error.message}`);
  if (REMOTE_NEWS_STRICT) process.exit(1);
});
