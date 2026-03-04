import { readFile, writeFile } from "node:fs/promises";

const INPUT_FILE = "news.remote.json";
const OUTPUT_JSON_FILE = "news.agent.json";
const OUTPUT_JS_FILE = "news.agent.js";
const TARGET_COUNT = 12;
const STRICT = String(process.env.REMOTE_AGENT_STRICT || "1") === "1";

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

function normalizeCategory(raw) {
  const categories = new Set(["Policy", "Geo", "Macro", "Market", "Crypto", "Social"]);
  const c = String(raw || "").trim();
  return categories.has(c) ? c : "Market";
}

function normalizeTitleForDedup(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\([^)]*\)$/g, " ")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function dedupKey(item) {
  const title = normalizeTitleForDedup(item?.title || "");
  if (title) return title;
  return `${String(item?.source || "news").toLowerCase()}|${String(item?.url || "")}`;
}

async function readJson(path) {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

function normalizeItem(raw) {
  const title = cleanText(raw?.title || "", 180);
  const url = String(raw?.url || "").trim();
  const source = cleanText(raw?.source || "Remote", 80);
  if (!title || !url) return null;
  const category = normalizeCategory(raw?.category);
  const headlineRaw = cleanText(raw?.headlineZh || "", 120);
  const summaryRaw = cleanText(raw?.summaryZh || raw?.summary || "", 240);
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
  const summaryZh = (hasChineseText(summaryRaw) && latinRatio(summaryRaw) <= 0.75)
    ? summaryRaw
    : `【${toChineseCategory(category)}】来自${source.split("/")[0]}的重点动态，详见原文链接。`;
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

function buildSourceStats(items) {
  const out = {};
  for (const row of items) out[row.source] = (out[row.source] || 0) + 1;
  return out;
}

async function main() {
  let payload;
  try {
    payload = await readJson(INPUT_FILE);
  } catch (error) {
    const msg = `[remote-publish] failed to read ${INPUT_FILE}: ${error.message}`;
    if (STRICT) throw new Error(msg);
    console.error(msg);
    return;
  }

  const remoteRows = Array.isArray(payload?.items) ? payload.items : [];
  const rows = remoteRows.map((row) => normalizeItem(row)).filter(Boolean);
  if (!rows.length) {
    const msg = `[remote-publish] no rows in ${INPUT_FILE}`;
    if (STRICT) throw new Error(msg);
    console.error(msg);
    return;
  }

  const curatedCount = rows.filter((x) => x.summaryZh && x.agentRank > 0 && x.agentScore > 0).length;
  if (curatedCount < Math.min(TARGET_COUNT, 8)) {
    const msg = `[remote-publish] remote payload does not look like OpenAI curated output (curated=${curatedCount})`;
    if (STRICT) throw new Error(msg);
    console.error(msg);
  }

  const dedup = [];
  const seen = new Set();
  const sorted = [...rows].sort((a, b) => {
    if (a.agentRank > 0 && b.agentRank > 0 && a.agentRank !== b.agentRank) return a.agentRank - b.agentRank;
    if (Math.abs((b.agentScore || 0) - (a.agentScore || 0)) > 0.0001) return (b.agentScore || 0) - (a.agentScore || 0);
    return (b.time || 0) - (a.time || 0);
  });

  for (const row of sorted) {
    const key = dedupKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(row);
    if (dedup.length >= TARGET_COUNT) break;
  }

  if (dedup.length < TARGET_COUNT) {
    const msg = `[remote-publish] not enough curated rows after dedup: ${dedup.length}`;
    if (STRICT) throw new Error(msg);
    console.error(msg);
  }

  const items = dedup.slice(0, TARGET_COUNT).map((row, idx) => ({ ...row, agentRank: idx + 1 }));
  const agentPayload = {
    agentAt: new Date().toISOString(),
    snapshotAt: "",
    remoteAgentAt: String(payload?.agentAt || payload?.crawledAt || ""),
    inputSource: "remote-openai",
    version: "remote-openai-pass.v1",
    targetCount: TARGET_COUNT,
    totalCandidates: rows.length,
    globalSummaryZh: String(payload?.globalSummaryZh || "").trim(),
    sourceStats: buildSourceStats(items),
    items
  };

  const jsOut = [
    "// Auto-generated by tools/publish-remote-agent.mjs",
    `window.__NEWS_AGENT_AT__ = ${JSON.stringify(agentPayload.agentAt)};`,
    `window.__NEWS_AGENT_META__ = ${JSON.stringify({
      version: agentPayload.version,
      targetCount: agentPayload.targetCount,
      inputSource: agentPayload.inputSource,
      remoteAgentAt: agentPayload.remoteAgentAt,
      totalCandidates: agentPayload.totalCandidates,
      sourceStats: agentPayload.sourceStats
    }, null, 2)};`,
    `window.__NEWS_AGENT__ = ${JSON.stringify(agentPayload.items, null, 2)};`,
    ""
  ].join("\n");

  await writeFile(OUTPUT_JSON_FILE, `${JSON.stringify(agentPayload, null, 2)}\n`, "utf8");
  await writeFile(OUTPUT_JS_FILE, jsOut, "utf8");
  console.log(`[remote-publish] wrote ${OUTPUT_JSON_FILE} and ${OUTPUT_JS_FILE} with ${items.length} items`);
}

main().catch((error) => {
  console.error(`[remote-publish] fatal: ${error.stack || error.message}`);
  if (STRICT) process.exit(1);
});
