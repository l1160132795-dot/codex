import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_JSON_FILE = process.env.REMOTE_OUTPUT_JSON || "remote/news.remote.json";
const OUTPUT_JS_FILE = process.env.REMOTE_OUTPUT_JS || "remote/news.remote.js";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const TARGET_COUNT = 12;
const MAX_CANDIDATES = 72;
const MAX_FEED_ITEMS = 220;

const FEEDS = [
  { url: "https://www.federalreserve.gov/feeds/press_all.xml", source: "Fed", category: "Policy" },
  { url: "https://www.sec.gov/news/pressreleases.rss", source: "SEC", category: "Policy" },
  { url: "https://www.ecb.europa.eu/rss/press.html", source: "ECB", category: "Macro" },
  { url: "https://www.bankofengland.co.uk/rss/news", source: "BoE", category: "Macro" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", source: "CNBC", category: "Market" },
  { url: "https://www.cnbc.com/id/100727362/device/rss/rss.html", source: "CNBC", category: "Geo" },
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph", category: "Crypto" },
  { url: "https://cn.cointelegraph.com/rss", source: "CointelegraphCN", category: "Crypto" },
  { url: "https://www.panewslab.com/rss.xml", source: "PANews", category: "Crypto" },
  { url: "https://www.fxstreet.com/rss/news", source: "FXStreet", category: "Macro" },
  { url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets", source: "Nasdaq", category: "Market" }
];

const SOURCE_WEIGHTS = {
  Fed: 9.6,
  SEC: 9.4,
  ECB: 9.0,
  BoE: 8.8,
  Nasdaq: 7.3,
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

async function loadFeed(feed) {
  try {
    const xml = await fetchText(feed.url, 16000, 1);
    return parseRss(xml, feed.source, feed.category);
  } catch (error) {
    console.error(`[remote] feed failed: ${feed.source} ${feed.url} -> ${error.message}`);
    return [];
  }
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

function createOpenAiPayload(candidates, nowIso) {
  const systemPrompt = [
    "\u4f60\u662f\u91d1\u878d\u65b0\u95fb\u603b\u7f16\u8f91\u3002",
    "\u76ee\u6807\u662f\u4ece\u5019\u9009\u65b0\u95fb\u4e2d\u9009\u51fa\u5bf9\u5168\u7403\u91d1\u878d\u5e02\u573a\u5f71\u54cd\u6700\u5927\u768412\u6761\uff0c\u5e76\u751f\u6210\u4e2d\u6587\u6458\u8981\u3002",
    "\u6392\u5e8f\u4f18\u5148\u7ea7\uff1a\u653f\u5e9c/\u76d1\u7ba1/\u592e\u884c\u5b98\u65b9\u52a8\u4f5c > \u5730\u7f18\u51b2\u7a81\u548c\u80fd\u6e90 > \u5b8f\u89c2\u6570\u636e > \u6838\u5fc3\u8d44\u4ea7\u4ef7\u683c\u51b2\u51fb > \u4e00\u822c\u884c\u4e1a\u8d44\u8baf\u3002",
    "\u5982\u679c\u67d0\u4e8b\u4ef6\u5728\u4e00\u5929\u5185\u4ecd\u6709\u5168\u5c40\u5f71\u54cd\uff0c`pinnedUntil`\u8bf7\u7ed9\u5230\u73b0\u5728+24\u5c0f\u65f6\u4ee5\u4e0a\uff08\u53ef\u81f3+36\u5c0f\u65f6\uff09\u3002",
    "\u8f93\u51fa\u5fc5\u987b\u662fJSON\uff0c\u4e14\u4e25\u683c\u7b26\u5408schema\u3002"
  ].join("\n");

  const userPrompt = JSON.stringify({
    now: nowIso,
    requirements: {
      targetCount: 12,
      language: "zh-CN",
      summaryStyle: "1~2\u53e5\uff0c\u51c6\u786e\u3001\u7b80\u77ed\uff0c\u4e0d\u8981\u7a7a\u8bdd",
      categories: ["Policy", "Geo", "Macro", "Market", "Crypto", "Social"],
      notes: [
        "\u6807\u9898headlineZh\u9700\u4e3a\u4e2d\u6587",
        "summaryZh\u4e3a\u4e2d\u6587\u6982\u62ec",
        "agentReasonZh\u8bf4\u660e\u5165\u9009\u539f\u56e0",
        "agentScore\u7528 0~100 \u6d6e\u70b9\u6570",
        "agentRank \u4ece 1 \u5230 12",
        "time/pinnedUntil \u4f7f\u7528 Unix ms"
      ]
    },
    candidates
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
        schema: {
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
        }
      }
    }
  };
}

function cleanJsonText(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (raw.startsWith("{")) return raw;
  const m = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  if (m) return m[1].trim();
  const l = raw.indexOf("{");
  const r = raw.lastIndexOf("}");
  if (l >= 0 && r > l) return raw.slice(l, r + 1);
  return raw;
}

function toChineseCategory(category) {
  const map = { Policy: "\u653f\u7b56", Geo: "\u5730\u7f18", Macro: "\u5b8f\u89c2", Market: "\u5e02\u573a", Crypto: "\u52a0\u5bc6", Social: "\u793e\u533a" };
  return map[String(category || "")] || "\u5e02\u573a";
}

function fallbackSummaryZh(item) {
  const cat = toChineseCategory(item.category);
  const src = String(item.source || "News").split("/")[0];
  const title = String(item.title || "").trim();
  const short = title.length > 50 ? `${title.slice(0, 50)}...` : title;
  return `\u3010${cat}\u3011${short}\u3002\u6765\u6e90\uff1a${src}\u3002`;
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
    const title = String(raw?.title || "").trim();
    const url = String(raw?.url || "").trim();
    const source = String(raw?.source || "").trim();
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

    dedup.push({
      title,
      headlineZh: String(raw?.headlineZh || title).trim(),
      summaryZh: String(raw?.summaryZh || fallbackSummaryZh({ title, source, category })).trim(),
      agentReasonZh: String(raw?.agentReasonZh || fallbackReasonZh({ title, source })).trim(),
      url,
      source,
      category,
      time: safeNumber(raw?.time, baseTime),
      priority: safeNumber(raw?.priority, Number((score * 0.62).toFixed(2))),
      pinnedUntil: safeNumber(raw?.pinnedUntil, pinnedDefault),
      agentScore: score,
      agentRank: safeNumber(raw?.agentRank, dedup.length + 1),
      topicZh: String(raw?.topicZh || fallbackTopicZh({ title, category })).trim()
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

async function runOpenAi(candidates, nowIso) {
  if (!OPENAI_API_KEY) {
    console.error("[remote] OPENAI_API_KEY not set, fallback to rule-based ranking.");
    return null;
  }

  const body = createOpenAiPayload(candidates, nowIso);
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 240)}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  const text = cleanJsonText(content);
  if (!text) throw new Error("OpenAI empty response");

  return JSON.parse(text);
}

async function ensureOutputDir(filePath) {
  const dir = path.dirname(filePath);
  if (!dir || dir === ".") return;
  await mkdir(dir, { recursive: true });
}

async function main() {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const settled = await Promise.allSettled(FEEDS.map((feed) => loadFeed(feed)));
  const rows = [];
  let failedFeeds = 0;
  for (const row of settled) {
    if (row.status === "fulfilled") rows.push(...row.value);
    else failedFeeds += 1;
  }

  const candidates = pickCandidates(rows, now);
  if (!candidates.length) throw new Error("No remote candidates available from feeds.");

  let modelPayload = null;
  try {
    modelPayload = await runOpenAi(candidates, nowIso);
  } catch (error) {
    console.error(`[remote] OpenAI call failed -> ${error.message}`);
  }

  const fallbackItems = fallbackBuild(candidates, now);
  const rawItems = Array.isArray(modelPayload?.items) ? modelPayload.items : fallbackItems;
  const items = sanitizeItems(rawItems, candidates, now);
  const globalSummaryZh = String(modelPayload?.globalSummaryZh || "\u5df2\u57fa\u4e8e\u5168\u7403\u6e90\u62bd\u53d6\u9ad8\u5f71\u54cd\u65b0\u95fb\uff0c\u5e76\u6309\u5e02\u573a\u5916\u6ea2\u6548\u5e94\u5b8c\u6210Top12\u6392\u5e8f\u3002").trim();

  const payload = {
    agentAt: nowIso,
    version: "remote-openai-agent.v1",
    model: OPENAI_MODEL,
    failedFeeds,
    totalFeeds: FEEDS.length,
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

