import { readFile, writeFile } from "node:fs/promises";

const INPUT_JSON_FILE = "news.snapshot.json";
const OUTPUT_JSON_FILE = "news.agent.json";
const OUTPUT_JS_FILE = "news.agent.js";
const STATE_JSON_FILE = "news.agent.state.json";

const AGENT_VERSION = "news-impact-agent.v1";
const TARGET_COUNT = 12;
const MAX_AGE_HOURS = 72;
const MAJOR_HOLD_HOURS = 24;
const SUPER_MAJOR_HOLD_HOURS = 36;
const SCORE_ROUND_DIGITS = 3;

const SOURCE_WEIGHTS = {
  Fed: 10.8,
  SEC: 10.4,
  ECB: 9.8,
  BoE: 9.5,
  Nasdaq: 8.2,
  Reuters: 8.0,
  CNBC: 7.8,
  FXStreet: 7.0,
  Cointelegraph: 6.4,
  CointelegraphCN: 6.4,
  PANews: 6.2,
  Coindar: 5.8,
  WeiboHot: 4.8,
  X: 4.6,
  "X/Trends24": 4.6
};

const CATEGORY_WEIGHTS = {
  Policy: 4.8,
  Geo: 4.6,
  Macro: 4.3,
  Market: 3.9,
  Crypto: 3.6,
  Social: 2.0
};

const SOURCE_ZH = {
  Fed: "\u7f8e\u8054\u50a8",
  SEC: "\u7f8e\u56fd\u8bc1\u76d1\u4f1a",
  ECB: "\u6b27\u6d32\u592e\u884c",
  BoE: "\u82f1\u56fd\u592e\u884c",
  Nasdaq: "Nasdaq",
  Reuters: "Reuters",
  CNBC: "CNBC",
  FXStreet: "FXStreet",
  Cointelegraph: "Cointelegraph",
  CointelegraphCN: "Cointelegraph\u4e2d\u6587",
  PANews: "PANews",
  Coindar: "Coindar",
  WeiboHot: "\u5fae\u535a\u70ed\u641c",
  X: "X\u70ed\u699c",
  "X/Trends24": "X\u70ed\u699c"
};

const CATEGORY_ZH = {
  Policy: "\u653f\u7b56",
  Geo: "\u5730\u7f18",
  Macro: "\u5b8f\u89c2",
  Market: "\u5e02\u573a",
  Crypto: "\u52a0\u5bc6",
  Social: "\u793e\u533a"
};

const MAJOR_PATTERNS = [
  /\b(war|attack|invasion|strike|missile|bombing|sanction|embargo|ceasefire|martial|coup|state of emergency|default|bankruptcy)\b/i,
  /\b(rate hike|rate cut|emergency meeting|executive order|federal reserve|fomc|cpi|pce)\b/i,
  /(\u6218\u4e89|\u51b2\u7a81|\u88ad\u51fb|\u5bfc\u5f39|\u5236\u88c1|\u7981\u8fd0|\u505c\u706b|\u7d27\u6025\u72b6\u6001|\u7d27\u6025\u4f1a\u8bae|\u884c\u653f\u4ee4|\u8fdd\u7ea6|\u7834\u4ea7|\u52a0\u606f|\u964d\u606f|\u901a\u80c0|\u975e\u519c|\u7f8e\u8054\u50a8)/
];

const EXTREME_PATTERNS = [
  /\b(declare war|major offensive|missile strike|nuclear|global supply shock|black swan)\b/i,
  /(\u5ba3\u6218|\u5168\u9762\u5f00\u6218|\u5927\u89c4\u6a21\u6253\u51fb|\u6838\u98ce\u9669|\u5168\u7403\u4f9b\u5e94\u51b2\u51fb|\u9ed1\u5929\u9e45)/
];

const MEDIUM_PATTERNS = [
  /\b(regulation|lawsuit|approval|ban|tariff|inflation|payroll|unemployment|gdp|pmi|yield|earnings|guidance|downgrade|upgrade|hack|exploit)\b/i,
  /(\u76d1\u7ba1|\u8bc9\u8bbc|\u83b7\u6279|\u7981\u4ee4|\u5173\u7a0e|\u901a\u80c0|\u975e\u519c|\u5931\u4e1a|GDP|PMI|\u6536\u76ca\u7387|\u8d22\u62a5|\u9ed1\u5ba2|\u6f0f\u6d1e)/
];

const LOW_SIGNAL_PATTERNS = [
  /\b(earnings transcript|q[1-4]\s+\d{4}\s+earnings|statistical notice|interview)\b/i,
  /(\u7535\u8bdd\u4f1a\u7eaa\u8981|\u7edf\u8ba1\u901a\u544a|\u8bbf\u8c08)/
];

const GOVERNANCE_PATTERNS = [
  /\b(federal reserve|sec|ecb|boe|treasury|white house|government|parliament|ministry|policy)\b/i,
  /(\u56fd\u52a1\u9662|\u653f\u5e9c|\u76d1\u7ba1|\u5b98\u65b9|\u90e8\u59d4|\u592e\u884c|\u7f8e\u8054\u50a8|\u8bc1\u76d1)/
];

const TOPIC_MAP = [
  { re: /\b(iran|israel|middle east|ukraine|russia|war|conflict|sanction|shipping)\b/i, zh: "\u5730\u7f18\u51b2\u7a81\u4e0e\u80fd\u6e90\u822a\u8fd0" },
  { re: /\b(federal reserve|fed|fomc|rate hike|rate cut|interest rate)\b/i, zh: "\u7f8e\u8054\u50a8\u4e0e\u5229\u7387\u653f\u7b56" },
  { re: /\b(cpi|pce|inflation|payroll|unemployment|gdp|pmi)\b/i, zh: "\u901a\u80c0\u4e0e\u5b8f\u89c2\u6570\u636e" },
  { re: /\b(treasury|yield|bond|dxy|dollar|fx)\b/i, zh: "\u7f8e\u503a\u5229\u7387\u4e0e\u6c47\u7387" },
  { re: /\b(bitcoin|btc|etf)\b/i, zh: "\u6bd4\u7279\u5e01\u4e0eETF\u8d44\u91d1\u9762" },
  { re: /\b(ethereum|eth|solana|xrp|stablecoin|defi)\b/i, zh: "\u4e3b\u6d41\u52a0\u5bc6\u8d44\u4ea7\u751f\u6001" },
  { re: /\b(sec|regulation|lawsuit|approval|ban|compliance|policy)\b/i, zh: "\u76d1\u7ba1\u4e0e\u5408\u89c4\u52a8\u4f5c" },
  { re: /\b(stock|equit|nasdaq|s&p|dow|earnings|guidance)\b/i, zh: "\u5168\u7403\u80a1\u5e02\u4e0e\u4f01\u4e1a\u8d22\u62a5" },
  { re: /\b(oil|brent|wti|gas|gold|commodity)\b/i, zh: "\u5927\u5b97\u5546\u54c1\u4ef7\u683c\u53d8\u5316" },
  { re: /(\u6218\u4e89|\u51b2\u7a81|\u4e2d\u4e1c|\u5236\u88c1|\u822a\u8fd0)/, zh: "\u5730\u7f18\u51b2\u7a81\u4e0e\u80fd\u6e90\u822a\u8fd0" },
  { re: /(\u7f8e\u8054\u50a8|\u5229\u7387|\u964d\u606f|\u52a0\u606f|\u901a\u80c0|\u975e\u519c)/, zh: "\u7f8e\u8054\u50a8\u4e0e\u5b8f\u89c2\u6570\u636e" },
  { re: /(\u6bd4\u7279\u5e01|BTC|ETF|\u4ee5\u592a\u574a|\u7a33\u5b9a\u5e01|\u76d1\u7ba1)/i, zh: "\u52a0\u5bc6\u8d44\u4ea7\u4e0e\u76d1\u7ba1\u6f14\u8fdb" }
];

const ACTION_MAP = [
  { re: /\b(attack|strike|invasion|bombing|missile|war)\b/i, zh: "\u51b2\u7a81\u660e\u663e\u5347\u7ea7" },
  { re: /\b(sanction|embargo|tariff|ban)\b/i, zh: "\u653f\u7b56\u7ea6\u675f\u529b\u5ea6\u589e\u5f3a" },
  { re: /\b(rate hike|rate cut|hold rates|policy decision)\b/i, zh: "\u5229\u7387\u653f\u7b56\u4fe1\u53f7\u53d8\u5316" },
  { re: /\b(approval|approved|launch|announce|issues|enforcement)\b/i, zh: "\u5b98\u65b9\u516c\u544a\u6216\u76d1\u7ba1\u52a8\u4f5c\u843d\u5730" },
  { re: /\b(plunge|selloff|drops|falls|slides|panic)\b/i, zh: "\u98ce\u9669\u8d44\u4ea7\u6ce2\u52a8\u52a0\u5267" },
  { re: /\b(surge|soar|rally|rise|jumps)\b/i, zh: "\u5e02\u573a\u4ef7\u683c\u5feb\u901f\u4e0a\u884c" },
  { re: /\b(hack|exploit|breach)\b/i, zh: "\u5b89\u5168\u98ce\u9669\u4e8b\u4ef6\u66b4\u9732" },
  { re: /(\u5236\u88c1|\u7981\u4ee4|\u884c\u653f\u4ee4|\u65b0\u653f)/, zh: "\u76d1\u7ba1\u6216\u653f\u7b56\u52a8\u4f5c\u660e\u786e" },
  { re: /(\u52a0\u606f|\u964d\u606f|\u5229\u7387|\u901a\u80c0|\u975e\u519c)/, zh: "\u5b8f\u89c2\u9884\u671f\u53d1\u751f\u53d8\u5316" },
  { re: /(\u66b4\u8dcc|\u5927\u8dcc|\u4e0b\u8dcc|\u6050\u614c)/, zh: "\u5e02\u573a\u98ce\u9669\u504f\u597d\u8d70\u5f31" },
  { re: /(\u5927\u6da8|\u4e0a\u6da8|\u53cd\u5f39)/, zh: "\u5e02\u573a\u98ce\u9669\u504f\u597d\u56de\u5347" }
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = SCORE_ROUND_DIGITS) {
  const v = Number(value);
  if (!Number.isFinite(v)) return 0;
  const base = 10 ** digits;
  return Math.round(v * base) / base;
}

function toLower(text) {
  return String(text || "").toLowerCase();
}

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ""));
}

function isLikelyMojibake(text) {
  const body = String(text || "");
  if (!body) return false;
  if (/[\uFFFD]/.test(body)) return true;
  if (/[鈥銆锛閬鍙颁粠鏉]/.test(body)) {
    const marks = (body.match(/[鈥銆锛閬鍙颁粠鏉]/g) || []).length;
    if (marks >= 2) return true;
  }
  return false;
}

function shortSource(source) {
  const head = String(source || "News").split("/")[0].trim();
  return head || "News";
}

function sourceDisplayZh(source) {
  const key = shortSource(source);
  return SOURCE_ZH[key] || key;
}

function categoryZh(category) {
  return CATEGORY_ZH[String(category || "Market")] || "\u5e02\u573a";
}

function normalizeTitleForDedup(title) {
  return toLower(title)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\([^)]*\)$/g, " ")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\b(reuters|cnbc|cointelegraph|coindesk|the block|decrypt|fed|sec|ecb|boe)\b/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function dedupKey(item) {
  const titleKey = normalizeTitleForDedup(item?.title || "");
  if (titleKey) return titleKey;
  return `${toLower(item?.source || "news")}|${String(item?.url || "")}`;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeItem(raw, now = Date.now()) {
  const title = String(raw?.title || "").replace(/\s+/g, " ").trim();
  const url = String(raw?.url || "").trim();
  if (!title || !url) return null;

  const time = safeNumber(raw?.time, now);
  const source = String(raw?.source || "News").trim() || "News";
  const category = String(raw?.category || "Market").trim() || "Market";

  return {
    title,
    url,
    source,
    sourceKey: shortSource(source),
    category,
    time,
    engagement: safeNumber(raw?.engagement, 0),
    priority: safeNumber(raw?.priority, 0),
    pinnedUntil: safeNumber(raw?.pinnedUntil, 0),
    summaryZh: String(raw?.summaryZh || "").trim(),
    headlineZh: String(raw?.headlineZh || "").trim(),
    inputRank: safeNumber(raw?.agentRank, 0)
  };
}

function keywordScore(title) {
  const body = String(title || "");
  let score = 0;
  for (const re of MAJOR_PATTERNS) {
    if (re.test(body)) score += 4.2;
  }
  for (const re of EXTREME_PATTERNS) {
    if (re.test(body)) score += 5.2;
  }
  for (const re of MEDIUM_PATTERNS) {
    if (re.test(body)) score += 1.8;
  }
  return score;
}

function majorLevel(item, score) {
  let level = 0;
  const body = String(item?.title || "");
  if (MAJOR_PATTERNS.some((re) => re.test(body))) level += 1;
  if (EXTREME_PATTERNS.some((re) => re.test(body))) level += 2;
  if (score >= 30) level += 1;
  if (score >= 36) level += 1;
  if (GOVERNANCE_PATTERNS.some((re) => re.test(body))) level += 1;
  if (["Policy", "Geo", "Macro"].includes(String(item?.category || "")) && (SOURCE_WEIGHTS[item?.sourceKey] || 0) >= 9.0) {
    level += 1;
  }
  return level;
}

function isSocialSource(sourceKey) {
  return sourceKey === "WeiboHot" || sourceKey === "X";
}

function computeImpactScore(item, now = Date.now()) {
  const sourceScore = SOURCE_WEIGHTS[item.sourceKey] || 5.2;
  const catScore = CATEGORY_WEIGHTS[item.category] || 3.2;
  const keyword = keywordScore(item.title);
  const priorityScore = clamp(item.priority, 0, 42) * 0.9;
  const engagementScore = clamp(Math.log10(Math.max(12, item.engagement + 10)) - 0.8, 0, 4.8);
  const ageHours = Math.max(0, (now - item.time) / 3600000);
  const recencyScore = clamp(7.2 - ageHours * 0.2, -4.0, 7.2);
  const lowSignalPenalty = LOW_SIGNAL_PATTERNS.some((re) => re.test(item.title)) ? 3.5 : 0;
  const socialPenalty = item.sourceKey === "WeiboHot" || item.sourceKey === "X" ? 2.2 : 0;
  const pinnedBoost = item.pinnedUntil > now ? 2.8 : 0;
  const oldPenalty = ageHours > MAX_AGE_HOURS ? (ageHours - MAX_AGE_HOURS) * 0.25 : 0;
  return sourceScore + catScore + keyword + priorityScore + engagementScore + recencyScore + pinnedBoost - lowSignalPenalty - socialPenalty - oldPenalty;
}

function inferTopicZh(item) {
  const text = `${item.title} ${item.category}`;
  for (const row of TOPIC_MAP) {
    if (row.re.test(text)) return row.zh;
  }
  return `${categoryZh(item.category)}\u9886\u57df`;
}

function inferActionZh(item) {
  const text = item.title;
  for (const row of ACTION_MAP) {
    if (row.re.test(text)) return row.zh;
  }
  return "\u51fa\u73b0\u65b0\u8fdb\u5c55";
}

function impactHintZh(score, holdUntil, now) {
  if (holdUntil > now + 6 * 3600000 || score >= 34) {
    return "\u5f71\u54cd\u9762\u8986\u76d6\u5168\u5c40\uff0c\u5efa\u8bae24\u5c0f\u65f6\u5185\u6301\u7eed\u8ddf\u8e2a\u3002";
  }
  if (score >= 28) {
    return "\u5bf9\u98ce\u9669\u504f\u597d\u548c\u4ef7\u683c\u6709\u660e\u663e\u6270\u52a8\uff0c\u5efa\u8bae\u9ad8\u9891\u5173\u6ce8\u3002";
  }
  if (score >= 22) {
    return "\u5c5e\u4e8e\u91cd\u8981\u589e\u91cf\u4fe1\u606f\uff0c\u5efa\u8bae\u6301\u7eed\u89c2\u5bdf\u540e\u7eed\u3002";
  }
  return "\u77ed\u7ebf\u53c2\u8003\u4e3a\u4e3b\uff0c\u7b49\u5f85\u66f4\u591a\u5b98\u65b9\u4fe1\u53f7\u786e\u8ba4\u3002";
}

function truncate(text, maxLength) {
  const raw = String(text || "").trim();
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function buildHeadlineZh(item, topic, action) {
  if (hasChinese(item.title) && !isLikelyMojibake(item.title)) {
    return truncate(item.title, 30);
  }
  return truncate(`${topic}\uff1a${action}`, 30);
}

function buildSummaryZh(item, score, holdUntil, topic, action, now) {
  const cat = categoryZh(item.category);
  const source = sourceDisplayZh(item.source);
  const hint = impactHintZh(score, holdUntil, now);
  return `\u3010${cat}\u3011${topic}\uff0c${action}\u3002\u6765\u6e90\uff1a${source}\u3002${hint}`;
}

function buildReasonZh(item, score, holdUntil, major, now) {
  const reasons = [];
  if (holdUntil > now) reasons.push("\u91cd\u5927\u4e8b\u4ef6\u6301\u7eed\u5c55\u793a");
  if (major >= 2) reasons.push("\u4e8b\u4ef6\u7ea7\u522b\u9ad8");
  if ((SOURCE_WEIGHTS[item.sourceKey] || 0) >= 9.5) reasons.push("\u5b98\u65b9/\u673a\u6784\u4fe1\u6e90");
  if (item.priority >= 20) reasons.push("\u539f\u59cb\u4f18\u5148\u7ea7\u9ad8");
  if (item.engagement >= 80000) reasons.push("\u793e\u4ea4\u70ed\u5ea6\u9ad8");
  reasons.push(`\u5f71\u54cd\u5206 ${round(score, 1)}`);
  return reasons.slice(0, 3).join("\uff0c");
}

function isMajorEvent(item, score, major, now) {
  if (major >= 3) return true;
  if (score >= 31) return true;
  if (item.pinnedUntil > now && item.priority >= 19) return true;
  if (["Policy", "Geo", "Macro"].includes(item.category) && score >= 27) return true;
  return false;
}

async function readJson(path, fallbackValue) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function pickBetterRow(a, b) {
  const scoreA = safeNumber(a.score, 0);
  const scoreB = safeNumber(b.score, 0);
  if (Math.abs(scoreB - scoreA) > 0.0001) return scoreB > scoreA ? b : a;
  const timeA = safeNumber(a.time, 0);
  const timeB = safeNumber(b.time, 0);
  if (timeB !== timeA) return timeB > timeA ? b : a;
  return a;
}

function chooseTopRows(scoredRows, now) {
  const sorted = [...scoredRows].sort((a, b) => {
    if ((b.holdUntil || 0) !== (a.holdUntil || 0)) return (b.holdUntil || 0) - (a.holdUntil || 0);
    if (Math.abs((b.score || 0) - (a.score || 0)) > 0.0001) return (b.score || 0) - (a.score || 0);
    if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
    return (b.time || 0) - (a.time || 0);
  });

  const out = [];
  const used = new Set();
  const sourceCount = Object.create(null);
  const categoryCount = Object.create(null);
  const topicCount = Object.create(null);

  const maxPerCategory = 4;
  const maxPerTopic = 3;

  const sourceCap = (row) => {
    if (row.sourceKey === "WeiboHot") return 1;
    if (row.sourceKey === "X") return 1;
    return 3;
  };

  const topicKey = (row) => String(row.topicZh || "generic").trim() || "generic";

  const canTake = (row, relax = 0) => {
    const sourceLimit = sourceCap(row) + relax;
    const cLimit = maxPerCategory + relax;
    const tLimit = maxPerTopic + relax;
    return (sourceCount[row.source] || 0) < sourceLimit
      && (categoryCount[row.category] || 0) < cLimit
      && (topicCount[topicKey(row)] || 0) < tLimit;
  };

  const take = (row) => {
    const key = dedupKey(row);
    if (used.has(key)) return false;
    used.add(key);
    out.push(row);
    sourceCount[row.source] = (sourceCount[row.source] || 0) + 1;
    categoryCount[row.category] = (categoryCount[row.category] || 0) + 1;
    const tk = topicKey(row);
    topicCount[tk] = (topicCount[tk] || 0) + 1;
    return true;
  };

  const hardPriority = sorted
    .filter((row) => (row.holdUntil || 0) > now || row.majorLevel >= 3 || row.score >= 34)
    .slice(0, 5);
  for (const row of hardPriority) {
    if (out.length >= TARGET_COUNT) return out.slice(0, TARGET_COUNT);
    if (!canTake(row, 0)) continue;
    take(row);
  }

  const preferredCategories = ["Policy", "Geo", "Macro", "Market", "Crypto"];
  for (const cat of preferredCategories) {
    if (out.length >= TARGET_COUNT) return out.slice(0, TARGET_COUNT);
    const candidate = sorted.find((row) => row.category === cat && canTake(row, 0));
    if (candidate) take(candidate);
  }

  for (const row of sorted) {
    if (out.length >= TARGET_COUNT) return out.slice(0, TARGET_COUNT);
    if (!canTake(row, 0)) continue;
    take(row);
  }

  for (const row of sorted) {
    if (out.length >= TARGET_COUNT) return out.slice(0, TARGET_COUNT);
    if (!canTake(row, 1)) continue;
    take(row);
  }

  for (const row of sorted) {
    if (out.length >= TARGET_COUNT) return out.slice(0, TARGET_COUNT);
    take(row);
  }

  return out.slice(0, TARGET_COUNT);
}

function mergeWithCarry(currentRows, carryRows, now) {
  const map = new Map();
  const upsert = (row) => {
    const key = dedupKey(row);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
      return;
    }
    map.set(key, pickBetterRow(prev, row));
  };

  for (const row of currentRows) upsert(row);

  for (const carry of carryRows) {
    if (safeNumber(carry?.holdUntil, 0) <= now) continue;
    const normalized = normalizeItem(carry?.item, now);
    if (!normalized) continue;
    const scored = scoreRow(normalized, now);
    scored.holdUntil = Math.max(scored.holdUntil || 0, safeNumber(carry?.holdUntil, 0));
    scored.majorLevel = Math.max(scored.majorLevel || 0, safeNumber(carry?.majorLevel, 0));
    scored.score += 2.4;
    scored.fromCarry = true;
    upsert(scored);
  }

  return [...map.values()];
}

function scoreRow(item, now) {
  const score = computeImpactScore(item, now);
  const major = majorLevel(item, score);
  const topic = inferTopicZh(item);
  const action = inferActionZh(item);
  return {
    ...item,
    score,
    majorLevel: major,
    topicZh: topic,
    actionZh: action,
    holdUntil: safeNumber(item.pinnedUntil, 0)
  };
}

function collectSourceStats(items) {
  const out = {};
  for (const row of items) {
    out[row.source] = (out[row.source] || 0) + 1;
  }
  return out;
}

async function main() {
  const now = Date.now();
  const snapshotPayload = await readJson(INPUT_JSON_FILE, null);
  if (!snapshotPayload || !Array.isArray(snapshotPayload.items)) {
    throw new Error(`${INPUT_JSON_FILE} invalid or missing`);
  }

  const statePayload = await readJson(STATE_JSON_FILE, { carry: [] });
  const prevCarry = Array.isArray(statePayload?.carry) ? statePayload.carry : [];

  const rawRows = snapshotPayload.items
    .map((row) => normalizeItem(row, now))
    .filter(Boolean);

  const freshRows = rawRows.filter((row) => {
    const ageHours = Math.max(0, (now - row.time) / 3600000);
    if (row.pinnedUntil > now) return true;
    return ageHours <= MAX_AGE_HOURS;
  });

  const scoredFresh = freshRows.map((row) => scoreRow(row, now));
  const mergedRows = mergeWithCarry(scoredFresh, prevCarry, now);

  for (const row of mergedRows) {
    if (isMajorEvent(row, row.score, row.majorLevel, now)) {
      const holdHours = row.majorLevel >= 4 ? SUPER_MAJOR_HOLD_HOURS : MAJOR_HOLD_HOURS;
      row.holdUntil = Math.max(row.holdUntil || 0, now + holdHours * 3600000);
      row.score += row.majorLevel >= 4 ? 3.6 : 2.4;
    }
    if ((row.holdUntil || 0) > now) row.score += 1.2;
  }

  const topRows = chooseTopRows(mergedRows, now).slice(0, TARGET_COUNT);
  const finalItems = topRows.map((row, idx) => {
    const score = round(row.score);
    const holdUntil = Math.max(safeNumber(row.holdUntil, 0), safeNumber(row.pinnedUntil, 0));
    const topic = row.topicZh || inferTopicZh(row);
    const action = row.actionZh || inferActionZh(row);
    const headlineZh = row.headlineZh || buildHeadlineZh(row, topic, action);
    const summaryZh = buildSummaryZh(row, score, holdUntil, topic, action, now);
    const reasonZh = buildReasonZh(row, score, holdUntil, row.majorLevel || 0, now);
    return {
      title: row.title,
      headlineZh,
      summaryZh,
      agentReasonZh: reasonZh,
      url: row.url,
      source: row.source,
      category: row.category,
      time: row.time,
      engagement: row.engagement,
      priority: round(Math.max(row.priority, score * 0.6)),
      pinnedUntil: holdUntil,
      agentScore: score,
      agentRank: idx + 1,
      topicZh: topic
    };
  });

  const carryItems = mergedRows
    .filter((row) => (row.holdUntil || 0) > now || isMajorEvent(row, row.score, row.majorLevel, now))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 36)
    .map((row) => ({
      key: dedupKey(row),
      holdUntil: Math.max(row.holdUntil || 0, now + MAJOR_HOLD_HOURS * 3600000),
      majorLevel: row.majorLevel || 0,
      score: round(row.score),
      item: {
        title: row.title,
        url: row.url,
        source: row.source,
        category: row.category,
        time: row.time,
        engagement: row.engagement,
        priority: row.priority,
        pinnedUntil: Math.max(row.holdUntil || 0, row.pinnedUntil || 0),
        summaryZh: row.summaryZh
      }
    }));

  const payload = {
    agentAt: new Date().toISOString(),
    snapshotAt: String(snapshotPayload.snapshotAt || ""),
    version: AGENT_VERSION,
    targetCount: TARGET_COUNT,
    totalCandidates: mergedRows.length,
    sourceStats: collectSourceStats(finalItems),
    items: finalItems
  };

  const jsLines = [
    "// Auto-generated by tools/news-impact-agent.mjs",
    `window.__NEWS_AGENT_AT__ = ${JSON.stringify(payload.agentAt)};`,
    `window.__NEWS_AGENT_META__ = ${JSON.stringify({
      version: payload.version,
      targetCount: payload.targetCount,
      snapshotAt: payload.snapshotAt,
      totalCandidates: payload.totalCandidates,
      sourceStats: payload.sourceStats
    }, null, 2)};`,
    `window.__NEWS_AGENT__ = ${JSON.stringify(payload.items, null, 2)};`,
    ""
  ].join("\n");

  await writeFile(OUTPUT_JSON_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(OUTPUT_JS_FILE, jsLines, "utf8");
  await writeFile(STATE_JSON_FILE, `${JSON.stringify({
    version: AGENT_VERSION,
    updatedAt: payload.agentAt,
    carry: carryItems
  }, null, 2)}\n`, "utf8");

  console.log(`[agent] wrote ${OUTPUT_JS_FILE} and ${OUTPUT_JSON_FILE} with ${finalItems.length} items (candidates=${mergedRows.length})`);
}

main().catch((error) => {
  console.error(`[agent] failed: ${error.stack || error.message}`);
  process.exit(1);
});
