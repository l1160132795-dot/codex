const REFRESH_MS = 60 * 1000;
const OFFICIAL_CACHE_MS = 15 * 60 * 1000;
const NEWS_CACHE_MAX_AGE_MS = 20 * 60 * 1000;
const NEWS_TARGET_COUNT = 12;
const NEWS_POOL_SIZE = 36;
const NEWS_MIN_COUNT = 8;
const NEWS_MAX_AGE_HOURS = 72;
const MARKET_SOURCE_MODE = "snapshot";
const NEWS_SOURCE_MODE = "snapshot";
const NEWS_REMOTE_AGENT_ONLY = true;
const LOCAL_SNAPSHOT_TIMEOUT_MS = 5000;
const NEWS_HOVER_SCALE = 1.35;
const NEWS_DIM_SCALE = 0.70;
const numberFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

const ALT_CONFIG = [
  { id: "ethereum", symbol: "ETH", name: "Ethereum", pair: "ETHUSDT", repo: "ethereum/go-ethereum", aliases: ["eth", "ethereum"] },
  { id: "solana", symbol: "SOL", name: "Solana", pair: "SOLUSDT", repo: "solana-labs/solana", aliases: ["sol", "solana"] },
  { id: "ripple", symbol: "XRP", name: "Ripple", pair: "XRPUSDT", repo: "XRPLF/rippled", aliases: ["xrp", "ripple", "xrpl"] },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin", pair: "DOGEUSDT", repo: "dogecoin/dogecoin", aliases: ["doge", "dogecoin"] },
  { id: "cardano", symbol: "ADA", name: "Cardano", pair: "ADAUSDT", repo: "IntersectMBO/cardano-node", aliases: ["ada", "cardano"] },
  { id: "sui", symbol: "SUI", name: "Sui", pair: "SUIUSDT", repo: "MystenLabs/sui", aliases: ["sui"] },
  { id: "chainlink", symbol: "LINK", name: "Chainlink", pair: "LINKUSDT", repo: "smartcontractkit/chainlink", aliases: ["link", "chainlink"] },
  { id: "avalanche-2", symbol: "AVAX", name: "Avalanche", pair: "AVAXUSDT", repo: "ava-labs/avalanchego", aliases: ["avax", "avalanche"] },
  { id: "tron", symbol: "TRX", name: "Tron", pair: "TRXUSDT", repo: "tronprotocol/java-tron", aliases: ["trx", "tron"] },
  { id: "toncoin", symbol: "TON", name: "Toncoin", pair: "TONUSDT", repo: "ton-blockchain/ton", aliases: ["ton", "toncoin"] },
  { id: "polkadot", symbol: "DOT", name: "Polkadot", pair: "DOTUSDT", repo: "paritytech/polkadot-sdk", aliases: ["dot", "polkadot"] },
  { id: "litecoin", symbol: "LTC", name: "Litecoin", pair: "LTCUSDT", repo: "litecoin-project/litecoin", aliases: ["ltc", "litecoin"] },
  { id: "bitcoin-cash", symbol: "BCH", name: "Bitcoin Cash", pair: "BCHUSDT", repo: "bitcoin-cash-node/bitcoin-cash-node", aliases: ["bch", "bitcoin cash"] },
  { id: "aptos", symbol: "APT", name: "Aptos", pair: "APTUSDT", repo: "aptos-labs/aptos-core", aliases: ["apt", "aptos"] },
  { id: "arbitrum", symbol: "ARB", name: "Arbitrum", pair: "ARBUSDT", repo: "OffchainLabs/nitro", aliases: ["arb", "arbitrum"] },
  { id: "optimism", symbol: "OP", name: "Optimism", pair: "OPUSDT", repo: "ethereum-optimism/optimism", aliases: ["op", "optimism"] },
  { id: "near", symbol: "NEAR", name: "Near", pair: "NEARUSDT", repo: "near/nearcore", aliases: ["near"] },
  { id: "cosmos", symbol: "ATOM", name: "Cosmos", pair: "ATOMUSDT", repo: "cosmos/cosmos-sdk", aliases: ["atom", "cosmos"] },
  { id: "filecoin", symbol: "FIL", name: "Filecoin", pair: "FILUSDT", repo: "filecoin-project/lotus", aliases: ["fil", "filecoin"] },
  { id: "stellar", symbol: "XLM", name: "Stellar", pair: "XLMUSDT", repo: "stellar/stellar-core", aliases: ["xlm", "stellar"] },
  { id: "uniswap", symbol: "UNI", name: "Uniswap", pair: "UNIUSDT", repo: "Uniswap/v3-core", aliases: ["uni", "uniswap"] }
];

const FALLBACK_EVENTS = [
  { coin: "ETH", source: "Official", title: "Ethereum 官方渠道持续跟踪客户端升级进展", url: "https://github.com/ethereum/go-ethereum/events", time: Date.now() - 3600000 },
  { coin: "SOL", source: "Official", title: "Solana 官方仓库持续有代码提交与 Issue 更新", url: "https://github.com/solana-labs/solana/events", time: Date.now() - 5400000 },
  { coin: "XRP", source: "Official", title: "XRPL 官方仓库保持协议讨论与维护节奏", url: "https://github.com/XRPLF/rippled/events", time: Date.now() - 7200000 }
];

const POSITIVE_WORDS = [
  "rally", "surge", "soar", "gain", "bull", "breakout", "inflow", "approval", "deal", "rebound", "recover",
  "easing", "ceasefire", "optimism", "upgrade", "adoption", "all-time", "ath", "看涨", "反弹", "上涨", "利好", "回暖", "突破"
];
const NEGATIVE_WORDS = [
  "crash", "drop", "selloff", "panic", "fear", "liquidation", "hack", "ban", "lawsuit", "outflow", "recession", "war",
  "attack", "conflict", "sanction", "tariff", "crisis", "uncertainty", "bear", "看跌", "恐慌", "暴跌", "爆仓", "利空", "冲突", "风险"
];
const MAJOR_WORDS = [
  "etf", "fed", "sec", "cpi", "interest rate", "approval", "ban", "war", "tariff", "hack", "liquidation", "lawsuit",
  "监管", "政策", "爆仓", "战争", "制裁", "降息", "加息", "黑客", "地缘"
];

const els = {
  body: document.body,
  price: document.getElementById("price"),
  change24h: document.getElementById("change24h"),
  updatedAt: document.getElementById("updatedAt"),
  dataSource: document.getElementById("dataSource"),
  moodLine: document.getElementById("moodLine"),
  badge: document.getElementById("sentimentBadge"),
  reportContent: document.getElementById("reportContent"),
  reportHeadlines: document.getElementById("reportHeadlines"),
  briefZone: document.getElementById("briefZone"),
  briefTrigger: document.getElementById("briefTrigger"),
  geoDot: document.getElementById("geoDot"),
  fearGreedValue: document.getElementById("fearGreedValue"),
  fearGreedSub: document.getElementById("fearGreedSub"),
  dominanceValue: document.getElementById("dominanceValue"),
  dominanceSub: document.getElementById("dominanceSub"),
  volumeValue: document.getElementById("volumeValue"),
  volumeSub: document.getElementById("volumeSub"),
  geoRiskValue: document.getElementById("geoRiskValue"),
  geoRiskSub: document.getElementById("geoRiskSub"),
  newsWall: document.getElementById("newsWall"),
  newsMeta: document.getElementById("newsMeta"),
  sourceStrip: document.getElementById("sourceStrip"),
  marketCapLine: document.getElementById("marketCapLine"),
  altCluster: document.getElementById("altCluster"),
  cellStage: document.getElementById("cellStage"),
  cellInsight: document.getElementById("cellInsight"),
  hero: document.getElementById("hero"),
  newsSection: document.getElementById("newsSection"),
  fxCanvas: document.getElementById("fxCanvas"),
  coinLayer: document.getElementById("coinLayer")
};

const sceneState = {
  changePct: 0,
  mood: "bull",
  geoRisk: 0
};

const cache = {
  official: {
    at: 0,
    items: []
  },
  news: {
    at: 0,
    items: [],
    sourceStats: {},
    agentMode: false
  }
};

const localSnapshot = {
  marketPayload: null,
  marketSnapshotAtRaw: "",
  newsAgentRows: null,
  newsAgentSnapshotAtRaw: "",
  newsAgentMeta: null,
  newsRows: null,
  newsSnapshotAtRaw: ""
};

const mouse = {
  x: window.innerWidth * 0.5,
  y: window.innerHeight * 0.5,
  active: false
};

const latest = {
  altBoard: [],
  contexts: new Map()
};

const newsLayoutState = {
  tree: null,
  hoverIndex: -1
};

function toLocalTime(ts) {
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
}

function toShortTime(ts) {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toLowerSafe(text) {
  return String(text || "").toLowerCase();
}

function summarizeHeadline(title) {
  const raw = String(title || "").replace(/\s+/g, " ").trim();
  const part = raw.split(/[。？！!?;|]/)[0].trim();
  if (part.length <= 72) return part;
  return `${part.slice(0, 71)}...`;
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
  const raw = String(category || "Market").trim();
  const map = { Geo: "地缘", Macro: "宏观", Policy: "政策", Crypto: "加密", Social: "社区", Market: "市场" };
  return map[raw] || (hasChineseText(raw) ? raw : "市场");
}

function localizeHeadlinePhrases(raw) {
  let out = String(raw || "");
  const rules = [
    [/\bbitcoin\b|\bbtc\b/ig, "比特币"],
    [/\bethereum\b|\beth\b/ig, "以太坊"],
    [/\bxrp\b|ripple/ig, "XRP"],
    [/\bsolana\b|\bsol\b/ig, "Solana"],
    [/\bdogecoin\b|\bdoge\b/ig, "狗狗币"],
    [/\bshiba inu\b|\bshib\b/ig, "SHIB"],
    [/\bpepe\b/ig, "PEPE"],
    [/\betf\b/ig, "ETF"],
    [/\bcbdc\b/ig, "CBDC"],
    [/\bsec\b/ig, "SEC"],
    [/\bfed\b/ig, "美联储"],
    [/\bcpi\b/ig, "CPI"],
    [/\bapproval\b|\bapproved\b/ig, "获批"],
    [/\bban\b|\bbanned\b/ig, "禁令"],
    [/\blawsuit\b/ig, "诉讼"],
    [/\bhack\b|\bhacked\b/ig, "黑客事件"],
    [/\bliquidation\b/ig, "爆仓"],
    [/\bvolatility\b/ig, "波动率"],
    [/\bfear\b|\bpanic\b/ig, "恐慌"],
    [/\bsurge\b|\bsoar\b|\brally\b|\bgain\b/ig, "走强"],
    [/\bdrop\b|\bcrash\b|\bplunge\b|\bsell[- ]?off\b/ig, "走弱"],
    [/\bwar\b|\bconflict\b/ig, "冲突"],
    [/\bgeopolitical\b/ig, "地缘政治"],
    [/\bmiddle east\b|\biran\b|\bhormuz\b/ig, "中东局势"],
    [/\bmarket\b/ig, "市场"],
    [/\bcrypto\b|\bcryptocurrency\b/ig, "加密市场"],
    [/\bprice\b/ig, "价格"],
    [/\bholders?\b/ig, "持币者"],
    [/\bwhales?\b/ig, "鲸鱼地址"],
    [/\bexchange\b/ig, "交易所"],
    [/\bstablecoin\b/ig, "稳定币"],
    [/\bregulation\b|\bregulatory\b/ig, "监管"],
    [/\bpolicy\b/ig, "政策"],
    [/\byield\b/ig, "收益率"],
    [/\binflation\b/ig, "通胀"],
    [/\brate\b/ig, "利率"],
    [/\bfomc\b/ig, "FOMC"],
    [/\btreasury\b|\bbond\b/ig, "美债"],
    [/\bdollar index\b|\bdxy\b/ig, "美元指数"],
    [/\busd\b/ig, "美元"],
    [/\beuro\b/ig, "欧元"],
    [/\byen\b/ig, "日元"],
    [/\boil\b|\bcrude\b|\bbrent\b|\bwti\b/ig, "原油"],
    [/\bgold\b/ig, "黄金"],
    [/\bearnings?\b|\bguidance\b/ig, "财报指引"],
    [/\bnonfarm\b|\bpayrolls?\b|\bunemployment\b|\bjobs?\b/ig, "就业数据"],
    [/\brecession\b/ig, "衰退预期"],
    [/\bstocks?\b|\bequities\b|\bnasdaq\b|\bs&p\b|\bdow\b/ig, "股市"],
    [/\bvolatility\b|\bvix\b/ig, "波动率"],
    [/\blong\b/ig, "多头"],
    [/\bshort\b/ig, "空头"]
  ];
  for (const [pattern, replacement] of rules) {
    out = out.replace(pattern, replacement);
  }
  return out
    .replace(/\s*[-|]\s*/g, "，")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHeadlineHints(text) {
  const hints = [];
  const dict = [
    [/\bfed|fomc|powell/, "美联储"],
    [/\bcpi|pce|inflation/, "通胀"],
    [/\bnonfarm|payroll|unemployment|jobs/, "就业"],
    [/\btreasury|yield|bond/, "美债"],
    [/\bdxy|dollar|usd/, "美元"],
    [/\boil|brent|wti|opec|energy/, "原油"],
    [/\bgold/, "黄金"],
    [/\bnasdaq|s&p|dow|stocks?|equities/, "股市"],
    [/\betf|sec|regulation|policy|lawsuit|ban/, "监管"],
    [/\bwar|conflict|missile|sanction|tariff|middle east|iran|israel|ukraine|russia/, "地缘"],
    [/\bbitcoin|btc/, "比特币"],
    [/\bethereum|eth/, "以太坊"]
  ];
  for (const [pattern, label] of dict) {
    if (pattern.test(text) && !hints.includes(label)) hints.push(label);
    if (hints.length >= 2) break;
  }
  return hints;
}

function buildChineseHeadlineFallback(raw, category = "Market") {
  const text = toLowerSafe(raw);
  let subject = category === "Geo" ? "地缘与大宗市场" : category === "Macro" ? "宏观市场" : category === "Policy" ? "政策与监管线" : category === "Crypto" ? "加密市场" : "全球市场";
  if (/\bbitcoin|\bbtc/.test(text)) subject = "比特币";
  else if (/\bethereum|\beth/.test(text)) subject = "以太坊";
  else if (/\bnasdaq|s&p|dow|stocks?|equities/.test(text)) subject = "股市";
  else if (/\boil|brent|wti|opec|energy/.test(text)) subject = "原油市场";
  else if (/\bgold/.test(text)) subject = "黄金市场";
  else if (/\btreasury|bond|yield/.test(text)) subject = "债券市场";
  else if (/\bdxy|dollar|usd|euro|yen|fx/.test(text)) subject = "汇率市场";

  let event = "";
  if (/(cpi|pce|inflation)/.test(text)) event = "通胀信号扰动";
  else if (/(fed|fomc|rate cut|rate hike|interest rate|powell)/.test(text)) event = "利率预期变化";
  else if (/(nonfarm|payroll|unemployment|jobs)/.test(text)) event = "就业数据引发重估";
  else if (/(earnings|guidance|profit warning)/.test(text)) event = "财报与指引分化";
  else if (/(tariff|sanction|war|conflict|missile|strike|middle east|iran|israel|ukraine|russia)/.test(text)) event = "地缘风险升温";
  else if (/(etf|sec|regulation|policy|lawsuit|ban|approval)/.test(text)) event = "监管进展驱动";
  else if (/(oil|brent|wti|opec|energy|gas)/.test(text)) event = "大宗价格波动传导";
  else if (/(treasury|bond|yield|dollar|dxy|fx|currency)/.test(text)) event = "利率与汇率联动";
  else if (/(liquidation|leverage|volatility|vix)/.test(text)) event = "杠杆与波动率抬升";

  let tone = "中性";
  if (/(surge|soar|rally|gain|jump|breakout|inflow|rebound|beat)/.test(text)) tone = "偏强";
  else if (/(drop|crash|plunge|selloff|decline|slump|outflow|miss|downgrade)/.test(text)) tone = "偏弱";
  else if (/(fear|panic|uncertainty|risk-off)/.test(text)) tone = "偏谨慎";

  const hints = extractHeadlineHints(text);
  if (event) return `${subject}${event}，情绪${tone}${hints.length ? `（${hints.join("、")}）` : ""}`;
  if (hints.length) return `${subject}出现新变量，关注${hints.join("、")}`;
  return "";
}

function toChineseHeadline(raw, category = "Market") {
  const clean = String(raw || "").replace(/\s+/g, " ").trim();
  if (!clean) return "市场快讯";
  if (hasChineseText(clean)) return summarizeHeadline(clean);
  const localized = localizeHeadlinePhrases(clean);
  const fallback = buildChineseHeadlineFallback(localized, category);

  // Prefer Chinese output in UI; if translated text still contains too much Latin,
  // collapse to a concise Chinese fallback sentence by category/topic.
  const localizedLatinRatio = latinRatio(localized);
  if (localizedLatinRatio <= 0.4) return summarizeHeadline(localized);
  if (fallback) return summarizeHeadline(fallback);

  const categoryZh = toChineseCategory(category);
  return `${categoryZh}快讯：出现新的市场变量，建议关注后续演化。`;
}

function toChineseBrief(raw, category = "Market") {
  const text = toChineseHeadline(raw, category);
  return text.length <= 34 ? text : `${text.slice(0, 33)}...`;
}

function toChineseSummary(raw, category = "Market", source = "News", priority = 0, pinned = false) {
  const headline = toChineseHeadline(raw, category);
  const categoryZh = toChineseCategory(category);
  const sourceText = String(source || "News").split("/")[0];
  const focus = category === "Policy"
    ? "建议关注后续官方口径与执行细则。"
    : category === "Geo"
      ? "建议关注地缘事件是否继续升级。"
      : category === "Macro"
        ? "建议关注宏观数据与政策预期变化。"
        : category === "Crypto"
          ? "建议关注链上资金与监管消息反馈。"
          : "建议关注市场情绪与价格联动。";
  const importanceTail = pinned || Number(priority) >= 10 ? "该事件影响面较大，优先跟踪。" : focus;
  const text = `${categoryZh}概括：${headline}。来源：${sourceText}。${importanceTail}`;
  return text.length <= 120 ? text : `${text.slice(0, 119)}…`;
}

function scoreHeadlineSentiment(title) {
  const text = toLowerSafe(title);
  let score = 0;
  for (const w of POSITIVE_WORDS) {
    if (text.includes(w)) score += 1;
  }
  for (const w of NEGATIVE_WORDS) {
    if (text.includes(w)) score -= 1;
  }
  return clamp(score, -4, 4);
}

function hasMajorKeyword(title) {
  const text = toLowerSafe(title);
  return MAJOR_WORDS.some((w) => text.includes(w));
}

function tileSizeFromImpact(impact, idx) {
  if (idx === 0 || impact >= 10.5) return "xl";
  if (idx <= 2 || impact >= 8) return "lg";
  if (impact >= 6) return "md";
  return "sm";
}

function toImpactWeight(item) {
  const override = Number(item?.__weight);
  if (Number.isFinite(override)) return Math.max(0.4, override);
  const impact = Number(item?.impact);
  if (!Number.isFinite(impact)) return 1;
  return Math.max(1, impact);
}

function splitByBalancedWeight(items, weights) {
  if (items.length <= 1) return [items, []];
  const total = items.reduce((sum, idx) => sum + (weights[idx] || 1), 0);
  let acc = 0;
  let bestIdx = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < items.length; i += 1) {
    acc += weights[items[i - 1]] || 1;
    const diff = Math.abs(total * 0.5 - acc);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return [items.slice(0, bestIdx), items.slice(bestIdx)];
}

function buildNewsTree(indices, weights, w = 100, h = 100) {
  if (indices.length === 1) {
    return { leaf: indices[0], dir: null, left: null, right: null };
  }
  const [a, b] = splitByBalancedWeight(indices, weights);
  const wa = a.reduce((sum, idx) => sum + (weights[idx] || 1), 0);
  const wb = b.reduce((sum, idx) => sum + (weights[idx] || 1), 0);
  const total = wa + wb || 1;
  const ratio = wa / total;
  const dir = w >= h ? "v" : "h";
  let leftW = w;
  let leftH = h;
  let rightW = w;
  let rightH = h;
  if (dir === "v") {
    leftW = w * ratio;
    rightW = w - leftW;
  } else {
    leftH = h * ratio;
    rightH = h - leftH;
  }
  return {
    leaf: null,
    dir,
    left: buildNewsTree(a, weights, leftW, leftH),
    right: buildNewsTree(b, weights, rightW, rightH),
    leftIndices: a,
    rightIndices: b
  };
}

function computeRectsFromTree(node, x, y, w, h, weights, out) {
  if (!node) return;
  if (Number.isFinite(node.leaf)) {
    out[node.leaf] = { x, y, w, h };
    return;
  }
  const wa = node.leftIndices.reduce((sum, idx) => sum + (weights[idx] || 1), 0);
  const wb = node.rightIndices.reduce((sum, idx) => sum + (weights[idx] || 1), 0);
  const total = wa + wb || 1;
  const ratio = wa / total;
  if (node.dir === "v") {
    const leftW = w * ratio;
    computeRectsFromTree(node.left, x, y, leftW, h, weights, out);
    computeRectsFromTree(node.right, x + leftW, y, w - leftW, h, weights, out);
  } else {
    const topH = h * ratio;
    computeRectsFromTree(node.left, x, y, w, topH, weights, out);
    computeRectsFromTree(node.right, x, y + topH, w, h - topH, weights, out);
  }
}

function tileSizeFromArea(area) {
  if (area >= 1800) return "xl";
  if (area >= 1100) return "lg";
  if (area >= 700) return "md";
  return "sm";
}

async function fetchJson(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTickerCoinLore() {
  const rows = await fetchJson("https://api.coinlore.net/api/ticker/?id=90", 12000);
  const btc = Array.isArray(rows) ? rows[0] : null;
  if (!btc) throw new Error("CoinLore ticker payload invalid");
  const price = Number(btc.price_usd);
  const changePct = Number(btc.percent_change_24h);
  const volumeUsd = Number(btc.volume24);
  if (!Number.isFinite(price) || !Number.isFinite(changePct)) throw new Error("CoinLore ticker fields invalid");
  return { price, changePct, volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : NaN, source: "CoinLore" };
}

async function fetchTickerAlternative() {
  const root = await fetchJson("https://api.alternative.me/v2/ticker/bitcoin/?convert=USD", 12000);
  const dataRoot = root?.data && typeof root.data === "object" ? Object.values(root.data)[0] : null;
  const quote = dataRoot?.quotes?.USD;
  const price = Number(quote?.price);
  const changePct = Number(quote?.percentage_change_24h);
  const volumeUsd = Number(quote?.volume_24h);
  if (!Number.isFinite(price) || !Number.isFinite(changePct)) throw new Error("Alternative ticker fields invalid");
  return { price, changePct, volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : NaN, source: "Alternative.me" };
}

async function fetchTickerGate() {
  const rows = await fetchJson("https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT", 12000);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error("Gate ticker payload invalid");
  const price = Number(row.last);
  const changePct = Number(row.change_percentage);
  const volumeUsd = Number(row.quote_volume);
  if (!Number.isFinite(price) || !Number.isFinite(changePct)) throw new Error("Gate ticker fields invalid");
  return { price, changePct, volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : NaN, source: "Gate" };
}

async function fetchTickerBinance() {
  const data = await fetchJson("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT", 12000);
  const price = Number(data.lastPrice);
  const changePct = Number(data.priceChangePercent);
  const volumeUsd = Number(data.quoteVolume);
  if (!Number.isFinite(price) || !Number.isFinite(changePct)) throw new Error("Binance payload invalid");
  return { price, changePct, volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : NaN, source: "Binance" };
}

async function fetchTickerCoinGecko() {
  const list = await fetchJson("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin&price_change_percentage=24h", 12000);
  const btc = Array.isArray(list) ? list[0] : null;
  if (!btc) throw new Error("CoinGecko payload invalid");
  const price = Number(btc.current_price);
  const changePct = Number(btc.price_change_percentage_24h);
  const volumeUsd = Number(btc.total_volume);
  if (!Number.isFinite(price) || !Number.isFinite(changePct)) throw new Error("CoinGecko fields invalid");
  return { price, changePct, volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : NaN, source: "CoinGecko" };
}

async function fetchTicker() {
  const runners = [fetchTickerCoinLore, fetchTickerAlternative, fetchTickerGate, fetchTickerBinance, fetchTickerCoinGecko];
  const errors = [];
  for (const run of runners) {
    try {
      return await run();
    } catch (error) {
      errors.push(error?.message || "Unknown error");
    }
  }
  throw new Error(errors.join("; "));
}

async function fetchFearGreed() {
  const data = await fetchJson("https://api.alternative.me/fng/?limit=1&format=json", 12000);
  const item = data?.data?.[0];
  if (!item) throw new Error("FearGreed payload invalid");
  const value = Number(item.value);
  if (!Number.isFinite(value)) throw new Error("FearGreed value invalid");
  return { value, classification: item.value_classification || "Unknown" };
}

function normalizeDominance(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return NaN;
  if (value > 0 && value <= 1.5) return value * 100;
  return value;
}

async function fetchGlobalDataAlternative() {
  const data = await fetchJson("https://api.alternative.me/v2/global/", 12000);
  const root = data?.data;
  const btcDominance = normalizeDominance(root?.bitcoin_percentage_of_market_cap);
  const totalMarketCapUsd = Number(root?.quotes?.USD?.total_market_cap);
  if (!Number.isFinite(btcDominance) && !Number.isFinite(totalMarketCapUsd)) throw new Error("Alternative global fields invalid");
  return {
    btcDominance: Number.isFinite(btcDominance) ? btcDominance : NaN,
    totalMarketCapUsd: Number.isFinite(totalMarketCapUsd) ? totalMarketCapUsd : NaN
  };
}

async function fetchGlobalDataCoinLore() {
  const rows = await fetchJson("https://api.coinlore.net/api/global/", 12000);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error("CoinLore global payload invalid");
  const btcDominance = normalizeDominance(row?.btc_d);
  const totalMarketCapUsd = Number(row?.total_mcap);
  return {
    btcDominance: Number.isFinite(btcDominance) ? btcDominance : NaN,
    totalMarketCapUsd: Number.isFinite(totalMarketCapUsd) ? totalMarketCapUsd : NaN
  };
}

async function fetchGlobalDataCoinGecko() {
  const data = await fetchJson("https://api.coingecko.com/api/v3/global", 12000);
  const d = data?.data;
  if (!d) throw new Error("CoinGecko global payload invalid");
  const btcDominance = normalizeDominance(d?.market_cap_percentage?.btc);
  const totalMarketCapUsd = Number(d?.total_market_cap?.usd);
  return {
    btcDominance: Number.isFinite(btcDominance) ? btcDominance : NaN,
    totalMarketCapUsd: Number.isFinite(totalMarketCapUsd) ? totalMarketCapUsd : NaN
  };
}

async function fetchGlobalData() {
  const runners = [fetchGlobalDataAlternative, fetchGlobalDataCoinLore, fetchGlobalDataCoinGecko];
  const errors = [];
  for (const run of runners) {
    try {
      return await run();
    } catch (error) {
      errors.push(error?.message || "Unknown error");
    }
  }
  throw new Error(errors.join("; "));
}

function normalizeSnapshotTicker(raw) {
  if (!raw || typeof raw !== "object") return null;
  const price = Number(raw.price);
  const changePct = Number(raw.changePct);
  if (!Number.isFinite(price) || !Number.isFinite(changePct)) return null;
  const volumeUsd = Number(raw.volumeUsd);
  const source = String(raw.source || "Snapshot");
  return {
    price,
    changePct,
    volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : NaN,
    source: source.startsWith("LocalSnapshot/") ? source : `LocalSnapshot/${source}`
  };
}

function normalizeSnapshotFearGreed(raw) {
  if (!raw || typeof raw !== "object") return null;
  const value = Number(raw.value);
  if (!Number.isFinite(value)) return null;
  return {
    value,
    classification: String(raw.classification || "Unknown")
  };
}

function normalizeSnapshotGlobal(raw) {
  if (!raw || typeof raw !== "object") return null;
  const btcDominance = Number(raw.btcDominance);
  const totalMarketCapUsd = Number(raw.totalMarketCapUsd);
  return {
    btcDominance: Number.isFinite(btcDominance) ? btcDominance : NaN,
    totalMarketCapUsd: Number.isFinite(totalMarketCapUsd) ? totalMarketCapUsd : NaN
  };
}

function normalizeSnapshotAltBoard(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const price = Number(row?.price);
      const changePct = Number(row?.changePct);
      if (!Number.isFinite(price) || !Number.isFinite(changePct)) return null;
      const volumeUsd = Number(row?.volumeUsd);
      const rank = Number(row?.rank);
      const aliases = Array.isArray(row?.aliases) ? row.aliases.map((x) => String(x || "").trim()).filter(Boolean) : [];
      return {
        id: String(row?.id || ""),
        symbol: String(row?.symbol || "").trim().toUpperCase(),
        name: String(row?.name || "").trim(),
        aliases,
        price,
        changePct,
        volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : NaN,
        rank: Number.isFinite(rank) ? rank : NaN,
        source: String(row?.source || "Snapshot")
      };
    })
    .filter((row) => row && row.symbol);
}

function normalizeSnapshotOfficialEvents(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const coin = String(row?.coin || "").trim().toUpperCase();
      const title = String(row?.title || "").trim();
      const url = String(row?.url || "").trim();
      const source = String(row?.source || "Official").trim();
      const time = Number(row?.time);
      if (!coin || !title || !url) return null;
      return {
        coin,
        source,
        title,
        url,
        time: Number.isFinite(time) ? time : Date.now()
      };
    })
    .filter(Boolean);
}

function readMarketSnapshotPayload() {
  if (localSnapshot.marketPayload && typeof localSnapshot.marketPayload === "object") {
    return {
      payload: localSnapshot.marketPayload,
      snapshotAtRaw: localSnapshot.marketSnapshotAtRaw || String(localSnapshot.marketPayload.snapshotAt || "")
    };
  }

  const root = typeof globalThis === "object" && globalThis ? globalThis : {};
  const payload = root.__MARKET_SNAPSHOT__ && typeof root.__MARKET_SNAPSHOT__ === "object" ? root.__MARKET_SNAPSHOT__ : null;
  const snapshotAtRaw = String(root.__MARKET_SNAPSHOT_AT__ || payload?.snapshotAt || "");
  return { payload, snapshotAtRaw };
}

function buildMarketFromSnapshot() {
  const { payload, snapshotAtRaw } = readMarketSnapshotPayload();
  if (!payload || typeof payload !== "object") return null;

  const ticker = normalizeSnapshotTicker(payload.ticker);
  if (!ticker) return null;

  const fearGreed = normalizeSnapshotFearGreed(payload.fearGreed);
  const globalData = normalizeSnapshotGlobal(payload.globalData);
  const altBoard = normalizeSnapshotAltBoard(payload.altBoard);
  const officialEvents = normalizeSnapshotOfficialEvents(payload.officialEvents);
  const snapshotAtMs = Date.parse(String(payload.snapshotAt || snapshotAtRaw || ""));
  const snapshotMinutes = Number.isFinite(snapshotAtMs)
    ? Math.max(1, Math.round((Date.now() - snapshotAtMs) / 60000))
    : null;

  return {
    ticker,
    fearGreed,
    globalData,
    altBoard,
    officialEvents,
    snapshotMinutes
  };
}

async function fetchLocalSnapshotJson(fileName, timeoutMs = LOCAL_SNAPSHOT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const stamp = Date.now();
    const url = `${fileName}${fileName.includes("?") ? "&" : "?"}_=${stamp}`;
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeNewsSnapshotPayload(raw, mode = "snapshot") {
  if (Array.isArray(raw)) {
    return {
      snapshotAtRaw: "",
      rows: raw,
      mode,
      meta: {}
    };
  }

  if (raw && typeof raw === "object") {
    const rows = Array.isArray(raw.items) ? raw.items : [];
    const sourceStats = raw.sourceStats && typeof raw.sourceStats === "object" ? raw.sourceStats : {};
    return {
      snapshotAtRaw: String(raw.agentAt || raw.snapshotAt || ""),
      rows,
      mode,
      meta: {
        version: String(raw.version || ""),
        sourceStats,
        totalCandidates: Number(raw.totalCandidates),
        targetCount: Number(raw.targetCount)
      }
    };
  }

  return {
    snapshotAtRaw: "",
    rows: [],
    mode,
    meta: {}
  };
}

async function syncLocalSnapshotFiles() {
  const jobs = [
    fetchLocalSnapshotJson("market.snapshot.json"),
    fetchLocalSnapshotJson("news.agent.json")
  ];
  if (!NEWS_REMOTE_AGENT_ONLY) jobs.push(fetchLocalSnapshotJson("news.snapshot.json"));
  const settled = await Promise.allSettled(jobs);

  if (settled[0].status === "fulfilled" && settled[0].value && typeof settled[0].value === "object") {
    const payload = settled[0].value;
    localSnapshot.marketPayload = payload;
    localSnapshot.marketSnapshotAtRaw = String(payload.snapshotAt || "");
  }

  if (settled[1].status === "fulfilled") {
    const payload = normalizeNewsSnapshotPayload(settled[1].value, "agent");
    if (payload.rows.length) {
      localSnapshot.newsAgentRows = payload.rows;
      localSnapshot.newsAgentSnapshotAtRaw = payload.snapshotAtRaw;
      localSnapshot.newsAgentMeta = payload.meta;
    }
  }

  if (!NEWS_REMOTE_AGENT_ONLY && settled[2]?.status === "fulfilled") {
    const payload = normalizeNewsSnapshotPayload(settled[2].value, "snapshot");
    if (payload.rows.length) {
      localSnapshot.newsRows = payload.rows;
      localSnapshot.newsSnapshotAtRaw = payload.snapshotAtRaw;
    }
  }
}

function normalizeNewsItem(item) {
  const priority = Number(item.priority);
  const pinnedUntil = Number(item.pinnedUntil);
  const agentRank = Number(item.agentRank);
  const agentScore = Number(item.agentScore);
  return {
    title: (item.title || "").trim(),
    headlineZh: String(item.headlineZh || "").trim(),
    url: (item.url || "").trim(),
    source: (item.source || "News").trim(),
    category: (item.category || "Market").trim(),
    time: Number.isFinite(item.time) ? item.time : Date.now(),
    engagement: Number.isFinite(item.engagement) ? item.engagement : 0,
    priority: Number.isFinite(priority) ? priority : 0,
    pinnedUntil: Number.isFinite(pinnedUntil) ? pinnedUntil : 0,
    summaryZh: String(item.summaryZh || "").trim(),
    agentReasonZh: String(item.agentReasonZh || "").trim(),
    topicZh: String(item.topicZh || "").trim(),
    agentRank: Number.isFinite(agentRank) ? agentRank : 0,
    agentScore: Number.isFinite(agentScore) ? agentScore : 0
  };
}

function readSnapshotNewsPayload() {
  if (Array.isArray(localSnapshot.newsAgentRows) && localSnapshot.newsAgentRows.length) {
    return {
      rows: localSnapshot.newsAgentRows,
      snapshotAtRaw: localSnapshot.newsAgentSnapshotAtRaw || "",
      mode: "agent",
      meta: localSnapshot.newsAgentMeta || {}
    };
  }

  if (!NEWS_REMOTE_AGENT_ONLY && Array.isArray(localSnapshot.newsRows) && localSnapshot.newsRows.length) {
    return {
      rows: localSnapshot.newsRows,
      snapshotAtRaw: localSnapshot.newsSnapshotAtRaw || "",
      mode: "snapshot",
      meta: {}
    };
  }

  const root = typeof globalThis === "object" && globalThis ? globalThis : {};
  const agentRows = Array.isArray(root.__NEWS_AGENT__) ? root.__NEWS_AGENT__ : [];
  if (agentRows.length) {
    return {
      rows: agentRows,
      snapshotAtRaw: String(root.__NEWS_AGENT_AT__ || ""),
      mode: "agent",
      meta: root.__NEWS_AGENT_META__ && typeof root.__NEWS_AGENT_META__ === "object" ? root.__NEWS_AGENT_META__ : {}
    };
  }

  if (NEWS_REMOTE_AGENT_ONLY) {
    return { rows: [], snapshotAtRaw: "", mode: "agent", meta: {} };
  }

  const rows = Array.isArray(root.__NEWS_SNAPSHOT__) ? root.__NEWS_SNAPSHOT__ : [];
  const snapshotAtRaw = String(root.__NEWS_SNAPSHOT_AT__ || "");
  return { rows, snapshotAtRaw, mode: "snapshot", meta: {} };
}

function buildNewsFromSnapshot() {
  const { rows, snapshotAtRaw, mode, meta } = readSnapshotNewsPayload();
  const snapshotMode = mode || "snapshot";
  const normalized = rows
    .map((row) => normalizeNewsItem({
      title: row?.title,
      headlineZh: row?.headlineZh,
      url: row?.url,
      source: row?.source || "Snapshot",
      category: row?.category || "Market",
      time: Number(row?.time),
      engagement: Number(row?.engagement),
      priority: Number(row?.priority),
      pinnedUntil: Number(row?.pinnedUntil),
      summaryZh: row?.summaryZh,
      agentReasonZh: row?.agentReasonZh,
      topicZh: row?.topicZh,
      agentRank: Number(row?.agentRank),
      agentScore: Number(row?.agentScore)
    }))
    .filter((item) => item.title && item.url);

  if (!normalized.length) return null;

  const now = Date.now();

  if (snapshotMode === "agent") {
    const dedup = [];
    const seen = new Set();
    const ordered = [...normalized].sort((a, b) => {
      if (a.agentRank > 0 && b.agentRank > 0 && a.agentRank !== b.agentRank) return a.agentRank - b.agentRank;
      if (Math.abs((b.agentScore || 0) - (a.agentScore || 0)) > 0.0001) return (b.agentScore || 0) - (a.agentScore || 0);
      const priorityDelta = Number(b.priority || 0) - Number(a.priority || 0);
      if (Math.abs(priorityDelta) > 0.001) return priorityDelta;
      return (b.time || 0) - (a.time || 0);
    });

    for (const row of ordered) {
      const key = newsDedupKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      dedup.push(row);
      if (dedup.length >= NEWS_TARGET_COUNT) break;
    }

    const enriched = enrichNewsItems(dedup).slice(0, NEWS_TARGET_COUNT);
    const items = enriched.map((x, idx) => ({ ...x, size: tileSizeFromImpact(x.impact, idx) }));
    const sourceStats = (meta && typeof meta.sourceStats === "object" && Object.keys(meta.sourceStats).length)
      ? meta.sourceStats
      : items.reduce((acc, row) => {
        acc[row.source] = (acc[row.source] || 0) + 1;
        return acc;
      }, {});

    const snapshotAtMs = Date.parse(snapshotAtRaw);
    const snapshotMinutes = Number.isFinite(snapshotAtMs)
      ? Math.max(1, Math.round((Date.now() - snapshotAtMs) / 60000))
      : null;
    return {
      items,
      sourceStats,
      failed: 0,
      totalSources: Math.max(1, Object.keys(sourceStats || {}).length),
      stale: false,
      staleMinutes: 0,
      snapshot: true,
      snapshotMinutes,
      agentMode: true
    };
  }

  const maxAgeMs = NEWS_MAX_AGE_HOURS * 3600 * 1000;
  const recent = normalized.filter((row) => {
    const isPinned = Number.isFinite(row.pinnedUntil) && row.pinnedUntil > now;
    if (isPinned) return true;
    return Number.isFinite(row.time) && row.time >= now - maxAgeMs && row.time <= now + 10 * 60 * 1000;
  });
  const pool = (recent.length ? recent : normalized)
    .sort((a, b) => {
      const pinDelta = (Number(b.pinnedUntil) > now ? 1 : 0) - (Number(a.pinnedUntil) > now ? 1 : 0);
      if (pinDelta !== 0) return pinDelta;
      const priorityDelta = Number(b.priority || 0) - Number(a.priority || 0);
      if (Math.abs(priorityDelta) > 0.001) return priorityDelta;
      const t = (b.time || 0) - (a.time || 0);
      if (Math.abs(t) > 0) return t;
      return (b.engagement || 0) - (a.engagement || 0);
    })
    .slice(0, NEWS_POOL_SIZE);

  const dedup = [];
  const seen = new Set();
  for (const row of pool) {
    const key = newsDedupKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(row);
  }

  const enriched = enrichNewsItems(dedup);
  const picked = pickBalancedNews(enriched, NEWS_TARGET_COUNT);
  const items = picked.map((x, idx) => ({ ...x, size: tileSizeFromImpact(x.impact, idx) }));
  const sourceStats = {};
  for (const row of items) {
    sourceStats[row.source] = (sourceStats[row.source] || 0) + 1;
  }

  const snapshotAtMs = Date.parse(snapshotAtRaw);
  const snapshotMinutes = Number.isFinite(snapshotAtMs)
    ? Math.max(1, Math.round((Date.now() - snapshotAtMs) / 60000))
    : null;
  return {
    items,
    sourceStats,
    failed: 0,
    totalSources: 1,
    stale: false,
    staleMinutes: 0,
    snapshot: true,
    snapshotMinutes,
    agentMode: false
  };
}

function normalizeTitleForDedup(title) {
  return toLowerSafe(title)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\([^)]*\)$/g, " ")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\b(reuters|cnbc|yahoo finance|cointelegraph|coindesk|the block|decrypt)\b/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function newsDedupKey(item) {
  const titleKey = normalizeTitleForDedup(item?.title || "");
  if (titleKey) return titleKey;
  const src = sourceNameFromUrl(item?.url || "");
  const path = String(item?.url || "").split("?")[0].slice(-96);
  return `${src}|${path}`;
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

function extractGoogleTitle(raw) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const parts = text.split(" - ");
  if (parts.length >= 2) {
    const tail = parts[parts.length - 1];
    if (tail.length <= 42) return parts.slice(0, -1).join(" - ").trim() || text;
  }
  return text;
}

async function fetchRssViaProxy(rssUrl, timeoutMs = 12000) {
  const normalized = String(rssUrl || "").trim();
  const attempts = [
    () => fetchText(normalized, timeoutMs),
    () => fetchText(`https://corsproxy.io/?${encodeURIComponent(normalized)}`, timeoutMs),
    () => fetchText(`https://api.allorigins.win/raw?url=${encodeURIComponent(normalized)}`, timeoutMs),
    async () => {
      const wrapped = await fetchJson(`https://api.allorigins.win/get?url=${encodeURIComponent(normalized)}`, timeoutMs);
      const contents = String(wrapped?.contents || "");
      if (!contents.trim()) throw new Error("AllOrigins RSS empty");
      return contents;
    },
    () => fetchText(`https://r.jina.ai/http://${normalized.replace(/^https?:\/\//i, "")}`, timeoutMs)
  ];
  let lastError = null;
  for (const run of attempts) {
    try {
      const raw = String(await run() || "").trim();
      const xmlStart = [raw.indexOf("<?xml"), raw.indexOf("<rss"), raw.indexOf("<feed"), raw.indexOf("<rdf:RDF")]
        .filter((x) => x >= 0)
        .sort((a, b) => a - b)[0];
      const xmlText = Number.isFinite(xmlStart) ? raw.slice(xmlStart) : raw;
      if (/<\?xml|<rss|<feed|<rdf:RDF/i.test(xmlText)) return xmlText;
    } catch (err) {
      lastError = err;
    }
  }
  throw (lastError || new Error("RSS fetch failed"));
}

async function fetchNewsJson(url, timeoutMs = 12000) {
  const normalized = String(url || "").trim();
  const attempts = [
    () => fetchJson(normalized, timeoutMs),
    async () => {
      const wrapped = await fetchJson(`https://api.allorigins.win/get?url=${encodeURIComponent(normalized)}`, timeoutMs);
      const contents = String(wrapped?.contents || "");
      if (!contents.trim()) throw new Error("AllOrigins JSON empty");
      return JSON.parse(contents);
    },
    async () => {
      const text = await fetchText(`https://corsproxy.io/?${encodeURIComponent(normalized)}`, timeoutMs);
      return JSON.parse(text);
    }
  ];
  let lastError = null;
  for (const run of attempts) {
    try {
      return await run();
    } catch (err) {
      lastError = err;
    }
  }
  throw (lastError || new Error("News JSON fetch failed"));
}

function parseRssItems(xmlText, category = "Market", sourcePrefix = "RSS") {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) return [];
  const nodes = Array.from(doc.querySelectorAll("item"));
  const atomNodes = Array.from(doc.querySelectorAll("entry"));
  const rows = nodes.length ? nodes : atomNodes;
  if (!rows.length) return [];
  return rows.map((node) => {
    const titleRaw = node.querySelector("title")?.textContent || "";
    const title = extractGoogleTitle(titleRaw);
    const linkNode = node.querySelector("link");
    const url = (linkNode?.textContent || linkNode?.getAttribute("href") || "").trim();
    const pubDate = Date.parse(node.querySelector("pubDate")?.textContent || node.querySelector("updated")?.textContent || node.querySelector("published")?.textContent || "");
    const sourceNode = node.querySelector("source");
    const sourceText = (sourceNode?.textContent || "").trim();
    const source = sourceText || sourceNameFromUrl(url);
    return normalizeNewsItem({
      title,
      url,
      source: `${sourcePrefix}/${source}`,
      category,
      time: Number.isFinite(pubDate) ? pubDate : Date.now()
    });
  }).filter((a) => a.title && a.url);
}

async function fetchGoogleNewsRss(query, category = "Market") {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
  const xmlText = await fetchRssViaProxy(rssUrl, 14000);
  return parseRssItems(xmlText, category, "GoogleNews");
}

async function fetchGoogleNewsRssEn(query, category = "Market") {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const xmlText = await fetchRssViaProxy(rssUrl, 14000);
  return parseRssItems(xmlText, category, "GoogleNews");
}

async function fetchDirectRssFeed(rssUrl, category = "Market", sourcePrefix = "RSS") {
  const xmlText = await fetchRssViaProxy(rssUrl, 14000);
  return parseRssItems(xmlText, category, sourcePrefix);
}

const GLOBAL_RSS_FEEDS = [
  { url: "https://feeds.reuters.com/reuters/businessNews", category: "Market", sourcePrefix: "Reuters" },
  { url: "https://feeds.reuters.com/reuters/worldNews", category: "Geo", sourcePrefix: "Reuters" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", category: "Market", sourcePrefix: "CNBC" },
  { url: "https://www.cnbc.com/id/100727362/device/rss/rss.html", category: "Geo", sourcePrefix: "CNBC" },
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "Geo", sourcePrefix: "BBC" },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", category: "Market", sourcePrefix: "BBC" },
  { url: "https://www.theguardian.com/world/rss", category: "Geo", sourcePrefix: "Guardian" },
  { url: "https://www.theguardian.com/business/rss", category: "Market", sourcePrefix: "Guardian" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", category: "Geo", sourcePrefix: "NYTimes" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", category: "Macro", sourcePrefix: "NYTimes" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", category: "Geo", sourcePrefix: "AlJazeera" },
  { url: "https://feeds.npr.org/1001/rss.xml", category: "Geo", sourcePrefix: "NPR" },
  { url: "https://feeds.npr.org/1006/rss.xml", category: "Macro", sourcePrefix: "NPR" },
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", category: "Market", sourcePrefix: "MarketWatch" },
  { url: "https://cointelegraph.com/rss", category: "Crypto", sourcePrefix: "Cointelegraph" }
];

async function fetchGlobalRssMatrix() {
  const settled = await Promise.allSettled(
    GLOBAL_RSS_FEEDS.map((cfg) => fetchDirectRssFeed(cfg.url, cfg.category, cfg.sourcePrefix))
  );
  const merged = [];
  for (const row of settled) {
    if (row.status === "fulfilled") merged.push(...row.value);
  }
  return merged;
}

async function fetchBingNewsRss(query, category = "Market") {
  const rssUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=en-us`;
  const xmlText = await fetchRssViaProxy(rssUrl, 14000);
  return parseRssItems(xmlText, category, "BingNews");
}

async function fetchGeoNewsGdelt() {
  const query = encodeURIComponent("(geopolitics OR war OR sanctions OR tariff OR oil supply OR conflict OR central bank)");
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&maxrecords=10&format=json&sort=DateDesc`;
  const data = await fetchNewsJson(url, 12000);
  const articles = Array.isArray(data.articles) ? data.articles : [];
  return articles.map((a) => normalizeNewsItem({
    title: a.title,
    url: a.url,
    source: a.sourcecommonname || a.domain || "GDELT",
    category: "Geo",
    time: Date.parse(a.seendate || "") || Date.now()
  })).filter((a) => a.title && a.url);
}

async function fetchCryptoNewsGdelt() {
  const query = encodeURIComponent("(bitcoin OR ethereum OR solana OR xrp OR stablecoin OR ETF OR exchange) AND (market OR regulation OR inflow OR volatility OR institutional adoption)");
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&maxrecords=10&format=json&sort=DateDesc`;
  const data = await fetchNewsJson(url, 12000);
  const articles = Array.isArray(data.articles) ? data.articles : [];
  return articles.map((a) => normalizeNewsItem({
    title: a.title,
    url: a.url,
    source: a.sourcecommonname || a.domain || "GDELT",
    category: "Crypto",
    time: Date.parse(a.seendate || "") || Date.now()
  })).filter((a) => a.title && a.url);
}

async function fetchMacroNewsGdelt() {
  const query = encodeURIComponent("(fed OR cpi OR inflation OR treasury yield OR interest rate OR dollar index OR jobs report OR unemployment) AND (stock market OR bond market OR risk assets OR commodities OR currencies)");
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&maxrecords=10&format=json&sort=DateDesc`;
  const data = await fetchNewsJson(url, 12000);
  const articles = Array.isArray(data.articles) ? data.articles : [];
  return articles.map((a) => normalizeNewsItem({
    title: a.title,
    url: a.url,
    source: a.sourcecommonname || a.domain || "GDELT",
    category: "Macro",
    time: Date.parse(a.seendate || "") || Date.now()
  })).filter((a) => a.title && a.url);
}

async function fetchPolicyNewsGdelt() {
  const query = encodeURIComponent("(SEC OR regulation OR policy OR lawsuit OR approval OR ban OR framework OR bill) AND (crypto OR ETF OR stablecoin OR exchange OR digital asset)");
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&maxrecords=10&format=json&sort=DateDesc`;
  const data = await fetchNewsJson(url, 12000);
  const articles = Array.isArray(data.articles) ? data.articles : [];
  return articles.map((a) => normalizeNewsItem({
    title: a.title,
    url: a.url,
    source: a.sourcecommonname || a.domain || "GDELT",
    category: "Policy",
    time: Date.parse(a.seendate || "") || Date.now()
  })).filter((a) => a.title && a.url);
}

async function fetchGlobalMarketNewsGdelt() {
  const query = encodeURIComponent("(stock market OR equities OR treasury yield OR bond market OR dollar index OR oil OR gold) AND (volatility OR risk assets OR recession OR earnings)");
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&maxrecords=10&format=json&sort=DateDesc`;
  const data = await fetchNewsJson(url, 12000);
  const articles = Array.isArray(data.articles) ? data.articles : [];
  return articles.map((a) => normalizeNewsItem({
    title: a.title,
    url: a.url,
    source: a.sourcecommonname || a.domain || "GDELT",
    category: "Market",
    time: Date.parse(a.seendate || "") || Date.now()
  })).filter((a) => a.title && a.url);
}

async function fetchEconomyNewsGdelt() {
  const query = encodeURIComponent("(GDP OR inflation OR cpi OR pce OR jobs report OR unemployment OR fed OR ecb OR boj) AND (market reaction OR risk sentiment OR monetary policy)");
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&maxrecords=10&format=json&sort=DateDesc`;
  const data = await fetchNewsJson(url, 12000);
  const articles = Array.isArray(data.articles) ? data.articles : [];
  return articles.map((a) => normalizeNewsItem({
    title: a.title,
    url: a.url,
    source: a.sourcecommonname || a.domain || "GDELT",
    category: "Macro",
    time: Date.parse(a.seendate || "") || Date.now()
  })).filter((a) => a.title && a.url);
}

async function fetchCryptoCompareNews() {
  const data = await fetchNewsJson("https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=BTC,ETH,Regulation,Trading,Blockchain,Market", 12000);
  const rows = Array.isArray(data?.Data) ? data.Data : [];
  return rows.slice(0, 8).map((r) => normalizeNewsItem({
    title: r.title,
    url: r.url,
    source: r.source_info?.name || "CryptoCompare",
    category: "Crypto",
    time: Number(r.published_on) * 1000,
    engagement: Number(r.source_info?.id) || 0
  })).filter((a) => a.title && a.url);
}

async function fetchRedditNews(subreddit, category = "Social") {
  const data = await fetchNewsJson(`https://www.reddit.com/r/${subreddit}/hot.json?limit=8`, 12000);
  const rows = Array.isArray(data?.data?.children) ? data.data.children : [];
  return rows
    .map((item) => item?.data)
    .filter(Boolean)
    .map((post) => normalizeNewsItem({
      title: post.title,
      url: post.url,
      source: `Reddit/${subreddit}`,
      category,
      time: Number(post.created_utc) * 1000,
      engagement: Number(post.score || 0) + Number(post.num_comments || 0)
    }))
    .filter((a) => a.title && a.url);
}

async function fetchRedditSearchNews(query, category = "Social") {
  const encoded = encodeURIComponent(query);
  const data = await fetchNewsJson(`https://www.reddit.com/search.json?q=${encoded}&sort=new&t=day&limit=14`, 12000);
  const rows = Array.isArray(data?.data?.children) ? data.data.children : [];
  return rows
    .map((item) => item?.data)
    .filter(Boolean)
    .map((post) => normalizeNewsItem({
      title: post.title,
      url: post.url,
      source: `Reddit/Search/${post.subreddit || "all"}`,
      category,
      time: Number(post.created_utc) * 1000,
      engagement: Number(post.score || 0) + Number(post.num_comments || 0)
    }))
    .filter((a) => a.title && a.url);
}

function enrichNewsItems(items) {
  const categoryWeight = { Geo: 3.8, Macro: 3.2, Policy: 3.4, Crypto: 2.8, Social: 2.3, Market: 2.4 };
  return items.map((item) => {
    const tone = scoreHeadlineSentiment(item.title);
    const ageHours = (Date.now() - item.time) / 3600000;
    const recency = clamp(8 - ageHours, 0, 8) * 0.24;
    const engagement = Math.log10((item.engagement || 0) + 10) * 0.95;
    const major = hasMajorKeyword(item.title) ? 2.2 : 0;
    const priorityBoost = Math.max(0, Number(item.priority || 0)) * 0.72;
    const agentBoost = Math.max(0, Number(item.agentScore || 0)) * 0.16;
    const pinned = Number(item.pinnedUntil || 0) > Date.now();
    const pinnedBoost = pinned ? 2.8 : 0;
    const impact = (categoryWeight[item.category] || 2.2) + Math.abs(tone) * 1.2 + recency + engagement + major + priorityBoost + agentBoost + pinnedBoost;
    return {
      ...item,
      tone,
      impact,
      brief: item.brief || toChineseBrief(item.title, item.category),
      headlineZh: item.headlineZh || toChineseHeadline(item.title, item.category),
      summaryZh: item.summaryZh || toChineseSummary(item.title, item.category, item.source, item.priority, pinned),
      isPinned: pinned,
      size: "sm"
    };
  });
}

function inferNewsTopic(item) {
  const text = toLowerSafe(item?.title || "");
  const category = String(item?.category || "Market");
  if (/\bbitcoin|\bbtc\b/.test(text)) return "bitcoin";
  if (/\bethereum|\beth\b/.test(text)) return "ethereum";
  if (/\bsolana|\bsol\b|\bxrp\b|ripple|dogecoin|\bdoge\b|cardano|\bada\b|avalanche|\bavax\b|polkadot|\bdot\b/.test(text)) return "altcoin";
  if (/\betf|sec|regulation|regulatory|policy|lawsuit|ban|approval|compliance/.test(text)) return "policy";
  if (/\bfed|fomc|cpi|pce|inflation|payroll|nonfarm|jobs|unemployment|gdp|pmi/.test(text)) return "macro";
  if (/\btreasury|yield|bond|dxy|dollar|fx|currency|euro|yen/.test(text)) return "rates_fx";
  if (/\boil|brent|wti|opec|energy|gas/.test(text)) return "energy";
  if (/\bgold|silver|metals?/.test(text)) return "metals";
  if (/\bstocks?|equities|nasdaq|s&p|dow|earnings|guidance/.test(text)) return "equities";
  if (/\bwar|conflict|sanction|tariff|middle east|iran|israel|ukraine|russia/.test(text)) return "geopolitics";
  return category.toLowerCase();
}

function pickBalancedNews(items, targetCount) {
  const now = Date.now();
  const sorted = [...items].sort((a, b) => {
    const pinDelta = (Number(b.pinnedUntil || 0) > now ? 1 : 0) - (Number(a.pinnedUntil || 0) > now ? 1 : 0);
    if (pinDelta !== 0) return pinDelta;
    const delta = (b.impact || 0) - (a.impact || 0);
    if (Math.abs(delta) > 0.0001) return delta;
    return (b.time || 0) - (a.time || 0);
  });
  const out = [];
  const picked = new Set();
  const sourceCount = Object.create(null);
  const categoryCount = Object.create(null);
  const topicCount = Object.create(null);
  const maxPerSource = 2;
  const maxPerCategory = Math.max(2, Math.ceil(targetCount * 0.35));
  const maxPerTopic = Math.max(2, Math.ceil(targetCount * 0.3));

  const canTake = (row, sourceCap, categoryCap, topicCap) => {
    const s = sourceCount[row.source] || 0;
    const c = categoryCount[row.category] || 0;
    const topic = inferNewsTopic(row);
    const t = topicCount[topic] || 0;
    return s < sourceCap && c < categoryCap && t < topicCap;
  };

  const take = (row) => {
    const key = newsDedupKey(row);
    if (picked.has(key)) return false;
    picked.add(key);
    out.push(row);
    sourceCount[row.source] = (sourceCount[row.source] || 0) + 1;
    categoryCount[row.category] = (categoryCount[row.category] || 0) + 1;
    const topic = inferNewsTopic(row);
    topicCount[topic] = (topicCount[topic] || 0) + 1;
    return true;
  };

  const pinnedUrgent = sorted.filter((row) => Number(row.pinnedUntil || 0) > now).slice(0, Math.max(1, Math.floor(targetCount * 0.4)));
  for (const row of pinnedUrgent) {
    if (out.length >= targetCount) return out;
    take(row);
  }

  const authorityUrgent = sorted
    .filter((row) => Number(row.priority || 0) >= 10 && !picked.has(newsDedupKey(row)))
    .slice(0, 3);
  for (const row of authorityUrgent) {
    if (out.length >= targetCount) return out;
    take(row);
  }

  const preferredCategories = ["Macro", "Market", "Policy", "Geo", "Crypto", "Social"];
  for (const cat of preferredCategories) {
    if (out.length >= targetCount) return out;
    const row = sorted.find((candidate) => candidate.category === cat && !picked.has(newsDedupKey(candidate)) && canTake(candidate, 1, maxPerCategory, 1));
    if (row) take(row);
  }

  for (const row of sorted) {
    if (out.length >= targetCount) return out;
    if (!canTake(row, maxPerSource, maxPerCategory, maxPerTopic)) continue;
    take(row);
  }

  for (const row of sorted) {
    if (out.length >= targetCount) return out;
    if (!canTake(row, maxPerSource + 1, maxPerCategory + 1, maxPerTopic + 1)) continue;
    take(row);
  }

  for (const row of sorted) {
    if (out.length >= targetCount) break;
    if (inferNewsTopic(row) === "bitcoin") continue;
    take(row);
  }

  for (const row of sorted) {
    if (out.length >= targetCount) break;
    take(row);
  }

  return out;
}

async function fetchNewsFeed() {
  if (NEWS_SOURCE_MODE === "snapshot") {
    const snapshotRes = buildNewsFromSnapshot();
    if (snapshotRes && snapshotRes.items.length) {
      cache.news.at = Date.now();
      cache.news.items = snapshotRes.items;
      cache.news.sourceStats = snapshotRes.sourceStats;
      cache.news.agentMode = Boolean(snapshotRes.agentMode);
      return snapshotRes;
    }
    if (cache.news.items.length) {
      const staleMs = Date.now() - cache.news.at;
      return {
        items: cache.news.items,
        sourceStats: cache.news.sourceStats,
        failed: 0,
        totalSources: 1,
        stale: true,
        staleMinutes: Math.max(1, Math.round(staleMs / 60000)),
        snapshot: true,
        snapshotMinutes: null,
        agentMode: cache.news.agentMode
      };
    }
    return {
      items: [],
      sourceStats: {},
      failed: 0,
      totalSources: 1,
      stale: false,
      staleMinutes: 0,
      snapshot: true,
      snapshotMinutes: null,
      agentMode: false
    };
  }

  const jobs = [
    fetchGlobalRssMatrix(),
    fetchGeoNewsGdelt(),
    fetchCryptoNewsGdelt(),
    fetchMacroNewsGdelt(),
    fetchPolicyNewsGdelt(),
    fetchGlobalMarketNewsGdelt(),
    fetchEconomyNewsGdelt(),
    fetchCryptoCompareNews(),
    fetchBingNewsRss("global economy inflation central bank rates growth recession", "Macro"),
    fetchBingNewsRss("geopolitics sanctions conflict middle east shipping oil", "Geo"),
    fetchBingNewsRss("stock market earnings treasury yield dollar index commodities", "Market"),
    fetchBingNewsRss("crypto regulation etf stablecoin ethereum solana", "Crypto"),
    fetchRedditNews("CryptoCurrency", "Social"),
    fetchRedditNews("CryptoMarkets", "Crypto"),
    fetchRedditNews("ethfinance", "Crypto"),
    fetchRedditNews("wallstreetbets", "Market"),
    fetchRedditNews("stocks", "Market"),
    fetchRedditNews("investing", "Macro"),
    fetchRedditNews("economics", "Macro"),
    fetchRedditNews("worldnews", "Geo"),
    fetchRedditNews("geopolitics", "Geo"),
    fetchRedditSearchNews("federal reserve OR CPI OR treasury yield OR stock market OR oil", "Macro"),
    fetchRedditSearchNews("ethereum OR solana OR stablecoin OR crypto ETF OR SEC", "Crypto"),
    fetchRedditSearchNews("geopolitics OR sanctions OR conflict OR middle east OR shipping", "Geo"),
    fetchGoogleNewsRss("以太坊 OR Solana OR 稳定币 OR 加密监管 OR ETF", "Crypto"),
    fetchGoogleNewsRss("美联储 OR CPI OR 通胀 OR 非农 OR 美债收益率", "Macro"),
    fetchGoogleNewsRss("股市 OR 纳斯达克 OR 标普 OR 美元指数 OR 黄金 OR 原油", "Market"),
    fetchGoogleNewsRss("地缘政治 OR 冲突 OR 制裁 OR 关税 OR 中东 OR 航运", "Geo"),
    fetchGoogleNewsRssEn("ethereum OR solana OR stablecoin OR crypto regulation OR etf", "Crypto"),
    fetchGoogleNewsRssEn("federal reserve OR cpi OR inflation OR treasury yield OR unemployment", "Macro"),
    fetchGoogleNewsRssEn("stock market OR nasdaq OR s&p 500 OR dollar index OR oil OR gold OR earnings", "Market"),
    fetchGoogleNewsRssEn("geopolitics OR sanctions OR conflict OR middle east OR shipping", "Geo")
  ];
  const settled = await Promise.allSettled(jobs);
  const merged = [];
  for (const item of settled) {
    if (item.status === "fulfilled") merged.push(...item.value);
  }
  merged.sort((a, b) => {
    const t = (b.time || 0) - (a.time || 0);
    if (Math.abs(t) > 0) return t;
    return (b.engagement || 0) - (a.engagement || 0);
  });
  const dedup = [];
  const seen = new Set();
  for (const row of merged) {
    const key = newsDedupKey(row);
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(row);
    }
  }
  const now = Date.now();
  const maxAgeMs = NEWS_MAX_AGE_HOURS * 3600 * 1000;
  const recent = dedup.filter((row) => Number.isFinite(row.time) && row.time >= now - maxAgeMs && row.time <= now + 10 * 60 * 1000);
  if (recent.length < NEWS_MIN_COUNT) {
    const rescueJobs = [
      fetchBingNewsRss("breaking global market news inflation central bank", "Macro"),
      fetchBingNewsRss("breaking geopolitics sanctions conflict oil shipping", "Geo"),
      fetchGoogleNewsRssEn("breaking financial news OR macro economy OR central bank", "Macro"),
      fetchGoogleNewsRssEn("breaking crypto market OR ethereum OR stablecoin OR etf", "Crypto"),
      fetchRedditSearchNews("breaking market news OR fed OR cpi OR treasury yield OR equities", "Macro"),
      fetchRedditSearchNews("breaking geopolitics OR sanctions OR conflict OR oil shipping", "Geo")
    ];
    const rescue = await Promise.allSettled(rescueJobs);
    for (const r of rescue) {
      if (r.status !== "fulfilled") continue;
      for (const row of r.value) {
        const key = newsDedupKey(row);
        if (seen.has(key)) continue;
        if (!Number.isFinite(row.time) || row.time < now - maxAgeMs || row.time > now + 10 * 60 * 1000) continue;
        seen.add(key);
        recent.push(row);
      }
    }
  }
  recent.sort((a, b) => b.time - a.time);
  const baseList = recent.slice(0, NEWS_POOL_SIZE);
  const enriched = enrichNewsItems(baseList);
  const picked = pickBalancedNews(enriched, NEWS_TARGET_COUNT);
  let items = picked.map((x, idx) => ({ ...x, size: tileSizeFromImpact(x.impact, idx) }));

  if (items.length < NEWS_MIN_COUNT && cache.news.items.length) {
    const used = new Set(items.map((x) => newsDedupKey(x)));
    const fill = cache.news.items.filter((x) => {
      const key = newsDedupKey(x);
      return !used.has(key) && Number.isFinite(x.time) && x.time >= now - maxAgeMs;
    });
    const need = Math.max(0, NEWS_MIN_COUNT - items.length);
    items = items.concat(fill.slice(0, need)).slice(0, NEWS_TARGET_COUNT);
  }

  const sourceStats = {};
  for (const row of items) {
    sourceStats[row.source] = (sourceStats[row.source] || 0) + 1;
  }
  const failed = settled.filter((s) => s.status === "rejected").length;
  if (items.length) {
    cache.news.at = Date.now();
    cache.news.items = items;
    cache.news.sourceStats = sourceStats;
    return { items, sourceStats, failed, totalSources: jobs.length, stale: false, staleMinutes: 0, snapshot: false, snapshotMinutes: null };
  }
  const staleMs = Date.now() - cache.news.at;
  if (cache.news.items.length && staleMs <= NEWS_CACHE_MAX_AGE_MS) {
    return {
      items: cache.news.items,
      sourceStats: cache.news.sourceStats,
      failed,
      totalSources: jobs.length,
      stale: true,
      staleMinutes: Math.max(1, Math.round(staleMs / 60000)),
      snapshot: false,
      snapshotMinutes: null
    };
  }
  const snapshotFallback = buildNewsFromSnapshot();
  if (snapshotFallback && snapshotFallback.items.length) {
    return {
      ...snapshotFallback,
      stale: true,
      staleMinutes: Number.isFinite(snapshotFallback.snapshotMinutes) ? snapshotFallback.snapshotMinutes : 0
    };
  }
  return { items: [], sourceStats: {}, failed, totalSources: jobs.length, stale: false, staleMinutes: 0, snapshot: false, snapshotMinutes: null };
}
async function fetchHotAltBoardCoinLore() {
  const data = await fetchJson("https://api.coinlore.net/api/tickers/?start=0&limit=300", 12000);
  const rows = Array.isArray(data?.data) ? data.data : [];
  if (!rows.length) throw new Error("CoinLore alt payload invalid");

  const bySymbol = new Map(rows.map((row) => [String(row.symbol || "").toUpperCase(), row]));
  const board = ALT_CONFIG.map((cfg) => {
    const row = bySymbol.get(cfg.symbol);
    if (!row) return null;
    const price = Number(row.price_usd);
    const changePct = Number(row.percent_change_24h);
    const volumeUsd = Number(row.volume24);
    if (!Number.isFinite(price) || !Number.isFinite(changePct)) return null;
    return {
      id: cfg.id,
      symbol: cfg.symbol,
      name: cfg.name,
      aliases: cfg.aliases,
      price,
      changePct,
      volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : NaN,
      rank: Number(row.rank),
      source: "CoinLore"
    };
  }).filter(Boolean);

  if (board.length < 5) throw new Error("CoinLore alt rows insufficient");
  return board;
}

async function fetchHotAltBoardAlternative() {
  const root = await fetchJson("https://api.alternative.me/v2/ticker/?limit=400&convert=USD", 14000);
  const rows = root?.data && typeof root.data === "object" ? Object.values(root.data) : [];
  if (!rows.length) throw new Error("Alternative alt payload invalid");

  const bySymbol = new Map(rows.map((row) => [String(row?.symbol || "").toUpperCase(), row]));
  const board = ALT_CONFIG.map((cfg) => {
    const row = bySymbol.get(cfg.symbol);
    if (!row) return null;
    const quote = row?.quotes?.USD;
    const price = Number(quote?.price);
    const changePct = Number(quote?.percentage_change_24h);
    const volumeUsd = Number(quote?.volume_24h);
    if (!Number.isFinite(price) || !Number.isFinite(changePct)) return null;
    return {
      id: cfg.id,
      symbol: cfg.symbol,
      name: cfg.name,
      aliases: cfg.aliases,
      price,
      changePct,
      volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : NaN,
      rank: Number(row?.rank),
      source: "Alternative.me"
    };
  }).filter(Boolean);

  if (board.length < 5) throw new Error("Alternative alt rows insufficient");
  return board;
}

async function fetchHotAltBoardCoinGecko() {
  const ids = ALT_CONFIG.map((c) => c.id).join(",");
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h`;
  const rows = await fetchJson(url, 12000);
  if (!Array.isArray(rows) || !rows.length) throw new Error("CoinGecko alt payload invalid");

  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const board = ALT_CONFIG.map((cfg) => {
    const row = byId.get(cfg.id);
    if (!row) return null;
    return {
      id: cfg.id,
      symbol: cfg.symbol,
      name: cfg.name,
      aliases: cfg.aliases,
      price: Number(row.current_price),
      changePct: Number(row.price_change_percentage_24h),
      volumeUsd: Number(row.total_volume),
      rank: Number(row.market_cap_rank),
      source: "CoinGecko"
    };
  }).filter(Boolean);

  if (board.length < 5) throw new Error("CoinGecko alt rows insufficient");
  return board;
}

async function fetchHotAltBoardBinance() {
  const pairs = ALT_CONFIG.map((c) => c.pair);
  const symbols = encodeURIComponent(JSON.stringify(pairs));
  const rows = await fetchJson(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}`, 12000);
  if (!Array.isArray(rows) || !rows.length) throw new Error("Binance alt payload invalid");

  const byPair = new Map(rows.map((r) => [String(r.symbol), r]));
  const board = ALT_CONFIG.map((cfg) => {
    const row = byPair.get(cfg.pair);
    if (!row) return null;
    const price = Number(row.lastPrice);
    const changePct = Number(row.priceChangePercent);
    const volumeUsd = Number(row.quoteVolume);
    if (!Number.isFinite(price) || !Number.isFinite(changePct)) return null;
    return {
      id: cfg.id,
      symbol: cfg.symbol,
      name: cfg.name,
      aliases: cfg.aliases,
      price,
      changePct,
      volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : NaN,
      rank: NaN,
      source: "Binance"
    };
  }).filter(Boolean);

  if (board.length < 5) throw new Error("Binance alt rows insufficient");
  return board;
}

async function fetchHotAltBoard() {
  const runners = [fetchHotAltBoardCoinLore, fetchHotAltBoardAlternative, fetchHotAltBoardCoinGecko, fetchHotAltBoardBinance];
  const errors = [];
  for (const run of runners) {
    try {
      return await run();
    } catch (error) {
      errors.push(error?.message || "Unknown error");
    }
  }
  throw new Error(errors.join("; "));
}

function eventTypeLabel(type) {
  if (type === "PushEvent") return "代码提交";
  if (type === "ReleaseEvent") return "版本发布";
  if (type === "PullRequestEvent") return "PR 变更";
  if (type === "IssuesEvent") return "Issue 更新";
  if (type === "CreateEvent") return "分支/标签创建";
  return "仓库动态";
}

async function fetchOfficialEventsFromGitHub() {
  const picks = ALT_CONFIG.slice(0, 10);
  const jobs = picks.map((cfg) =>
    fetchJson(`https://api.github.com/repos/${cfg.repo}/events?per_page=1`, 12000).then((rows) => {
      const event = Array.isArray(rows) ? rows[0] : null;
      if (!event) throw new Error("No github events");
      return {
        coin: cfg.symbol,
        source: "GitHub",
        title: `${cfg.symbol} ${eventTypeLabel(event.type)}`,
        url: `https://github.com/${cfg.repo}/events`,
        time: Date.parse(event.created_at || "") || Date.now()
      };
    })
  );

  const settled = await Promise.allSettled(jobs);
  const items = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
  if (!items.length) throw new Error("Official events unavailable");
  items.sort((a, b) => b.time - a.time);
  return items.slice(0, 8);
}

async function getOfficialEvents() {
  const now = Date.now();
  if (cache.official.items.length && now - cache.official.at < OFFICIAL_CACHE_MS) return cache.official.items;
  try {
    const events = await fetchOfficialEventsFromGitHub();
    cache.official.items = events;
    cache.official.at = now;
    return events;
  } catch {
    if (cache.official.items.length) return cache.official.items;
    return FALLBACK_EVENTS;
  }
}
function evaluateGeoRisk(headlines) {
  const riskWords = ["war", "conflict", "sanction", "tariff", "attack", "missile", "tension", "embargo", "strike", "crisis", "冲突", "制裁", "风险"];
  const easeWords = ["ceasefire", "deal", "agreement", "talks", "summit", "truce", "negotiation", "缓和", "协议", "停火"];
  let score = 0;
  for (const item of headlines) {
    const text = toLowerSafe(item.title);
    for (const word of riskWords) {
      if (text.includes(word)) score += 1.8;
    }
    for (const word of easeWords) {
      if (text.includes(word)) score -= 1.15;
    }
  }
  score = clamp(score, 0, 20);
  const tone = score >= 11 ? "高压偏紧" : score >= 5 ? "中性偏紧" : "相对平稳";
  return { score, tone };
}

function deriveCompositeMood(snapshot, fearGreed, headlines) {
  const priceScore = clamp(snapshot.changePct / 2, -3.8, 3.8);
  const fngScore = fearGreed ? clamp((fearGreed.value - 50) / 12, -3.6, 3.6) : 0;
  const newsToneAvg = headlines.length ? headlines.reduce((acc, item) => acc + item.tone, 0) / headlines.length : 0;
  const fearCount = headlines.filter((item) => item.tone <= -1).length;
  const greedyCount = headlines.filter((item) => item.tone >= 1).length;
  const socialFear = headlines.filter((item) => item.category === "Social" && item.tone <= -1).length;
  const newsScore = clamp(newsToneAvg * 1.7 + (greedyCount - fearCount) * 0.18 - socialFear * 0.12, -3.8, 3.8);

  const total = priceScore + fngScore + newsScore;
  const mood = total >= 0.3 ? "bull" : "bear";
  const confidence = Math.abs(total);

  let label = "中性震荡";
  if (mood === "bull" && confidence >= 2.8) label = "牛市推进";
  else if (mood === "bull") label = "偏多观察";
  else if (mood === "bear" && confidence >= 2.8) label = "熊市防守";
  else label = "偏空观察";

  const newsBrief = fearCount > greedyCount ? "社区/X舆情偏恐慌" : greedyCount > fearCount ? "社区/X舆情偏乐观" : "社区/X舆情分歧";
  const line = `综合判断：${label}（F&G ${fearGreed ? fearGreed.value : "--"}，${newsBrief}）`;

  return {
    mood,
    score: total,
    label,
    line,
    components: {
      priceScore,
      fngScore,
      newsScore,
      fearCount,
      greedyCount
    }
  };
}

function deriveAltSentiment(changePct, btcDominance, altBoard) {
  const changes = altBoard.map((c) => c.changePct).filter(Number.isFinite);
  const avgAltChange = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : 0;
  let score = changePct * 1.08 + avgAltChange * 0.95;
  if (Number.isFinite(btcDominance)) score += (50 - btcDominance) * 0.8;

  if (score >= 14) return { label: "山寨热度升温", detail: "资金扩散明显，轮动和弹性都在增强。", score };
  if (score >= 3.5) return { label: "山寨结构分化", detail: "龙头相对更强，后排波动偏大。", score };
  return { label: "山寨偏防守", detail: "防守资金占优，优先观察高流动性标的。", score };
}

function updateMoodUI(snapshot, moodProfile) {
  sceneState.changePct = snapshot.changePct;
  sceneState.mood = moodProfile.mood;

  els.body.classList.toggle("mood-bear", moodProfile.mood === "bear");
  els.price.textContent = `$ ${numberFmt.format(snapshot.price)}`;
  els.change24h.textContent = `24h: ${snapshot.changePct >= 0 ? "+" : ""}${pctFmt.format(snapshot.changePct)}%`;
  els.updatedAt.textContent = `更新时间: ${toLocalTime(Date.now())}`;
  els.dataSource.textContent = `数据源: ${snapshot.source}`;

  if (moodProfile.mood === "bull") {
    els.badge.className = "pill bull";
    els.badge.textContent = "BULL FLOW";
  } else {
    els.badge.className = "pill bear";
    els.badge.textContent = "BEAR FLOW";
  }
  els.moodLine.textContent = moodProfile.line;
}

function updateGeoDot(geoRisk) {
  sceneState.geoRisk = geoRisk;
  if (geoRisk >= 11) {
    els.geoDot.style.background = "#ff766f";
    els.geoDot.style.boxShadow = "0 0 12px rgba(255,118,111,0.9)";
  } else if (geoRisk >= 5) {
    els.geoDot.style.background = "#ffc168";
    els.geoDot.style.boxShadow = "0 0 12px rgba(255,193,104,0.9)";
  } else {
    els.geoDot.style.background = "#78ffbd";
    els.geoDot.style.boxShadow = "0 0 12px rgba(120,255,189,0.9)";
  }
}

function updateMacroCards(fearGreed, globalData, ticker, geoTone) {
  els.fearGreedValue.textContent = fearGreed ? `${fearGreed.value}` : "--";
  els.fearGreedSub.textContent = fearGreed ? fearGreed.classification : "暂无可用数据";

  els.dominanceValue.textContent = Number.isFinite(globalData?.btcDominance) ? `${pctFmt.format(globalData.btcDominance)}%` : "--";
  els.dominanceSub.textContent = "BTC 市值占比";

  els.volumeValue.textContent = Number.isFinite(ticker?.volumeUsd) ? `$${compactFmt.format(ticker.volumeUsd)}` : "--";
  els.volumeSub.textContent = "BTC 24h 报价成交额";

  els.geoRiskValue.textContent = `${geoTone.score.toFixed(1)} / 20`;
  els.geoRiskSub.textContent = `风险状态：${geoTone.tone}`;

  els.marketCapLine.textContent = Number.isFinite(globalData?.totalMarketCapUsd)
    ? `加密总市值：$${compactFmt.format(globalData.totalMarketCapUsd)}`
    : "加密总市值：暂无可用数据";
}

function applyNewsRects(rects, gap) {
  const tiles = els.newsWall.querySelectorAll(".news-tile");
  rects.forEach((rect, idx) => {
    const tile = tiles[idx];
    if (!tile) return;
    const w = Math.max(6, rect.w - gap);
    const h = Math.max(6, rect.h - gap);
    const x = clamp(rect.x + gap * 0.5, 0, 100);
    const y = clamp(rect.y + gap * 0.5, 0, 100);
    tile.style.setProperty("--x", `${x.toFixed(3)}%`);
    tile.style.setProperty("--y", `${y.toFixed(3)}%`);
    tile.style.setProperty("--w", `${w.toFixed(3)}%`);
    tile.style.setProperty("--h", `${h.toFixed(3)}%`);
  });
}

function setNewsHoverState(activeIndex) {
  if (!newsLayoutState.tree) return;
  if (newsLayoutState.hoverIndex === activeIndex) return;
  newsLayoutState.hoverIndex = activeIndex;

  const tiles = els.newsWall.querySelectorAll(".news-tile");
  tiles.forEach((tile) => tile.classList.remove("is-active", "is-dimmed"));

  const weights = [];
  for (let i = 0; i < tiles.length; i += 1) {
    const impact = Number(tiles[i].dataset.impact);
    weights[i] = Number.isFinite(impact) ? Math.max(1, impact) : 1;
  }
  if (activeIndex >= 0) {
    weights[activeIndex] = weights[activeIndex] * NEWS_HOVER_SCALE;
    for (let i = 0; i < weights.length; i += 1) {
      if (i !== activeIndex) weights[i] = weights[i] * NEWS_DIM_SCALE;
    }
  }

  const rects = new Array(weights.length);
  computeRectsFromTree(newsLayoutState.tree, 0, 0, 100, 100, weights, rects);
  applyNewsRects(rects, 0.46);

  if (activeIndex >= 0) {
    tiles.forEach((tile, idx) => {
      if (idx === activeIndex) tile.classList.add("is-active");
      else tile.classList.add("is-dimmed");
    });
  }
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function setInsightFloatingMode(enabled) {
  if (enabled) {
    els.cellInsight.classList.add("floating");
  } else {
    els.cellInsight.classList.remove("floating", "is-hidden", "is-visible");
    els.cellInsight.style.left = "";
    els.cellInsight.style.top = "";
  }
}

function hideFloatingInsight() {
  if (!els.cellInsight.classList.contains("floating")) return;
  els.cellInsight.classList.add("is-hidden");
  els.cellInsight.classList.remove("is-visible");
}

function placeFloatingInsight(clientX, clientY) {
  if (!els.cellInsight.classList.contains("floating")) return;
  const margin = 10;
  const gapX = 14;
  const gapY = 12;
  const rect = els.cellInsight.getBoundingClientRect();

  let left = clientX - rect.width - gapX;
  if (left < margin) {
    left = Math.min(clientX + gapX, window.innerWidth - rect.width - margin);
  }

  let top = clientY + gapY;
  if (top + rect.height + margin > window.innerHeight) {
    top = Math.max(margin, clientY - rect.height - gapY);
  }

  els.cellInsight.style.left = `${Math.max(margin, left)}px`;
  els.cellInsight.style.top = `${Math.max(margin, top)}px`;
}

function showFloatingInsight(clientX, clientY) {
  if (!els.cellInsight.classList.contains("floating")) return;
  placeFloatingInsight(clientX, clientY);
  els.cellInsight.classList.remove("is-hidden");
  els.cellInsight.classList.add("is-visible");
}

function renderNewsWallMobile(headlines) {
  if (!headlines.length) {
    els.newsWall.innerHTML = "<span class='error-tip'>暂无可用新闻快照。</span>";
    els.reportHeadlines.innerHTML = "<span class='report-item'>暂无可用头条</span>";
    newsLayoutState.tree = null;
    newsLayoutState.hoverIndex = -1;
    return;
  }

  const rows = headlines.map((h, idx) => {
    const title = escapeHtml(h.headlineZh || toChineseHeadline(h.title, h.category));
    const summary = escapeHtml(h.summaryZh || toChineseSummary(h.title, h.category, h.source, h.priority, h.isPinned));
    const source = escapeHtml(h.source || "News");
    const category = escapeHtml(toChineseCategory(h.category || "Market"));
    const url = escapeHtml(h.url);
    const time = toShortTime(h.time);
    const sentiment = h.tone >= 1 ? "偏多" : h.tone <= -1 ? "偏空" : "中性";
    const rank = idx + 1;
    return `
      <a class="news-mobile-item" href="${url}" target="_blank" rel="noopener noreferrer">
        <div class="news-mobile-top">
          <span class="news-mobile-rank">#${rank}</span>
          <span class="news-mobile-source">${source}</span>
          <span class="news-mobile-time">${time}</span>
        </div>
        <div class="news-mobile-title">${title}</div>
        <div class="news-mobile-summary">${summary}</div>
        <div class="news-mobile-bottom">
          <span>${category}</span>
          <span>${sentiment}</span>
        </div>
      </a>
    `;
  });

  els.newsWall.innerHTML = `<div class="news-mobile-list">${rows.join("")}</div>`;
  els.reportHeadlines.innerHTML = headlines
    .slice(0, 4)
    .map((h) => `<span class="report-item">[${escapeHtml(h.source)}] ${escapeHtml(h.headlineZh || toChineseHeadline(h.title, h.category))}</span>`)
    .join("");
  newsLayoutState.tree = null;
  newsLayoutState.hoverIndex = -1;
  els.newsWall.classList.remove("is-hovering");
}

function renderNewsWall(headlines) {
  if (isMobileViewport()) {
    renderNewsWallMobile(headlines);
    return;
  }

  if (!headlines.length) {
    els.newsWall.innerHTML = "<span class='error-tip'>实时新闻源暂不可用，正在重连...</span>";
    els.reportHeadlines.innerHTML = "<span class='report-item'>暂无可用头条</span>";
    newsLayoutState.tree = null;
    newsLayoutState.hoverIndex = -1;
    els.newsWall.classList.remove("is-hovering");
    return;
  }

  const weights = headlines.map((h) => toImpactWeight(h));
  const indices = headlines.map((_, idx) => idx);
  newsLayoutState.tree = buildNewsTree(indices, weights, 100, 100);

  const rects = new Array(headlines.length);
  computeRectsFromTree(newsLayoutState.tree, 0, 0, 100, 100, weights, rects);
  const gap = 0.46;
  const rows = rects.map((rect, idx) => {
    const h = headlines[idx];
    const title = escapeHtml(h.headlineZh || toChineseHeadline(h.title, h.category));
    const summary = escapeHtml(h.summaryZh || toChineseSummary(h.title, h.category, h.source, h.priority, h.isPinned));
    const source = escapeHtml(h.source || "News");
    const category = escapeHtml(toChineseCategory(h.category || "Market"));
    const url = escapeHtml(h.url);
    const time = toShortTime(h.time);
    const sentiment = h.tone >= 1 ? "偏多" : h.tone <= -1 ? "偏空" : "中性";
    const impactText = `影响 ${h.impact.toFixed(1)}`;
    const heat = clamp((h.impact - 4) / 8, 0, 1);
    const hue = h.tone >= 1 ? 152 : h.tone <= -1 ? 5 : 42;
    const alpha = (0.18 + heat * 0.58).toFixed(2);

    const w = Math.max(6, rect.w - gap);
    const hgt = Math.max(6, rect.h - gap);
    const x = clamp(rect.x + gap * 0.5, 0, 100);
    const y = clamp(rect.y + gap * 0.5, 0, 100);
    const tileArea = w * hgt;
    const size = tileSizeFromArea(tileArea);
    const style = `--heat-h:${hue};--heat-a:${alpha};--x:${x.toFixed(3)}%;--y:${y.toFixed(3)}%;--w:${w.toFixed(3)}%;--h:${hgt.toFixed(3)}%;`;

    return `
      <a class="news-tile" data-idx="${idx}" data-impact="${h.impact.toFixed(3)}" style="${style}" data-size="${size}" href="${url}" target="_blank" rel="noopener noreferrer">
        <div class="news-top">
          <span class="news-src">${source}</span>
          <span>${time}</span>
        </div>
        <div class="news-main">
          <h4>${title}</h4>
          <p>${summary}</p>
        </div>
        <div class="news-bottom">
          <span class="news-cat">${category}</span>
          <span class="news-sent">${sentiment} · ${impactText}</span>
        </div>
      </a>
    `;
  });

  els.newsWall.innerHTML = rows.join("");
  newsLayoutState.hoverIndex = -1;
  const tiles = els.newsWall.querySelectorAll(".news-tile");
  tiles.forEach((tile) => {
    tile.addEventListener("pointerenter", () => {
      const idx = Number(tile.dataset.idx);
      if (!Number.isFinite(idx)) return;
      els.newsWall.classList.add("is-hovering");
      setNewsHoverState(idx);
    });
  });
  els.newsWall.onpointerleave = () => {
    els.newsWall.classList.remove("is-hovering");
    setNewsHoverState(-1);
  };

  els.reportHeadlines.innerHTML = headlines.slice(0, 4).map((h) => `<span class="report-item">[${escapeHtml(h.source)}] ${escapeHtml(h.headlineZh || toChineseHeadline(h.title, h.category))}</span>`).join("");
}

function renderSourceStrip(stats) {
  const rows = Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, cnt]) => `<span class="source-chip">${escapeHtml(name)} x${cnt}</span>`);
  els.sourceStrip.innerHTML = rows.length ? rows.join("") : "<span class='source-chip'>实时源重连中</span>";
}

function buildCoinContext(board, events, newsItems) {
  const map = new Map();
  for (const coin of board) {
    const aliasSet = new Set([coin.symbol.toLowerCase(), coin.name.toLowerCase(), ...(coin.aliases || [])]);
    const coinEvents = events.filter((ev) => (ev.coin || "").toLowerCase() === coin.symbol.toLowerCase());
    const relatedNews = newsItems.filter((item) => {
      const text = toLowerSafe(item.title);
      for (const alias of aliasSet) {
        if (text.includes(alias)) return true;
      }
      return false;
    });

    const policyScore = relatedNews.reduce((acc, item) => {
      const text = toLowerSafe(item.title);
      let delta = 0;
      if (text.includes("approval") || text.includes("inflow") || text.includes("adoption") || text.includes("支持") || text.includes("通过")) delta += 1;
      if (text.includes("ban") || text.includes("lawsuit") || text.includes("监管收紧") || text.includes("限制") || text.includes("打击")) delta -= 1;
      return acc + delta;
    }, 0);

    let policy = "政策线索有限，维持中性观察。";
    if (policyScore >= 2) policy = "政策/监管舆情偏友好，短线风险偏好提升。";
    else if (policyScore <= -2) policy = "政策/监管舆情偏紧，注意波动和回撤。";

    map.set(coin.symbol, {
      events: coinEvents,
      relatedNews,
      policy
    });
  }
  return map;
}

function renderCellInsight(coin, context) {
  if (!coin) {
    els.cellInsight.textContent = "将鼠标移到任意细胞，查看该币种近期活动与政策走向。";
    return;
  }

  const price = Number.isFinite(coin.price) ? `$${numberFmt.format(coin.price)}` : "--";
  const change = Number.isFinite(coin.changePct) ? `${coin.changePct >= 0 ? "+" : ""}${pctFmt.format(coin.changePct)}%` : "--";
  const vol = Number.isFinite(coin.volumeUsd) ? `$${compactFmt.format(coin.volumeUsd)}` : "--";
  const topEvent = context?.events?.[0]?.title || "暂无明确官方活动，观察仓库和公告更新节奏。";
  const headlines = (context?.relatedNews || []).slice(0, 2).map((item) => summarizeHeadline(item.title));

  els.cellInsight.innerHTML = `
    <div class="insight-head">
      <span>${escapeHtml(coin.symbol)} · ${escapeHtml(coin.name)}</span>
      <span class="insight-chip">24h ${change}</span>
    </div>
    <div>现价：${price} · 24h 成交额：${vol}</div>
    <div style="margin-top:0.32rem;">活动：${escapeHtml(topEvent)}</div>
    <div style="margin-top:0.32rem;">政策：${escapeHtml(context?.policy || "暂无政策线索")}</div>
    <ul class="insight-list">
      ${headlines.length ? headlines.map((h) => `<li>${escapeHtml(h)}</li>`).join("") : "<li>暂无强相关新闻，建议结合主流市场节奏观察。</li>"}
    </ul>
  `;
}

function renderAltClusterMobile(board, contextMap) {
  setInsightFloatingMode(false);

  if (!board.length) {
    els.altCluster.innerHTML = "<span class='error-tip'>暂无可用山寨币数据。</span>";
    renderCellInsight(null, null);
    return;
  }

  const sorted = [...board]
    .filter((x) => Number.isFinite(x.changePct))
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 12);

  const rows = sorted.map((coin) => `
    <button class="alt-mobile-item ${coin.changePct >= 0 ? "up" : "down"}" data-symbol="${escapeHtml(coin.symbol)}" type="button">
      <span class="alt-mobile-symbol">${escapeHtml(coin.symbol)}</span>
      <span class="alt-mobile-price">$${numberFmt.format(coin.price)}</span>
      <span class="alt-mobile-change ${coin.changePct >= 0 ? "up" : "down"}">${coin.changePct >= 0 ? "+" : ""}${pctFmt.format(coin.changePct)}%</span>
    </button>
  `);

  els.altCluster.innerHTML = `<div class="alt-mobile-list">${rows.join("")}</div>`;

  const bySymbol = new Map(sorted.map((coin) => [coin.symbol, coin]));
  els.altCluster.querySelectorAll(".alt-mobile-item").forEach((node) => {
    node.addEventListener("click", () => {
      const symbol = node.dataset.symbol;
      const coin = bySymbol.get(symbol);
      renderCellInsight(coin, contextMap.get(symbol));
    });
  });

  const leader = sorted[0];
  renderCellInsight(leader, contextMap.get(leader.symbol));
}

function renderAltCluster(board, contextMap) {
  if (isMobileViewport()) {
    renderAltClusterMobile(board, contextMap);
    return;
  }

  setInsightFloatingMode(true);
  hideFloatingInsight();

  if (!board.length) {
    els.altCluster.innerHTML = "<span class='error-tip'>暂无可用山寨币数据。</span>";
    renderCellInsight(null, null);
    return;
  }

  const stageRect = els.cellStage.getBoundingClientRect();
  if (stageRect.width < 80 || stageRect.height < 80) {
    requestAnimationFrame(() => renderAltCluster(board, contextMap));
    return;
  }

  const sorted = [...board].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  const leader = sorted[0];
  const compactMode = window.matchMedia("(max-width: 760px)").matches;
  const others = compactMode ? sorted.slice(1, 12) : sorted.slice(1);
  const maxAbs = Math.max(1, ...sorted.map((c) => Math.abs(c.changePct || 0)));
  const cx = stageRect.width * 0.5;
  const cy = compactMode ? stageRect.height * 0.46 : stageRect.height * 0.52;
  const minDim = Math.min(stageRect.width, stageRect.height);

  let html = "";
  const centerSize = compactMode
    ? clamp(104 + (Math.abs(leader.changePct || 0) / maxAbs) * 30, 98, 140)
    : clamp(126 + (Math.abs(leader.changePct || 0) / maxAbs) * 42, 126, 176);
  html += `
    <div class="cluster-cell center ${leader.changePct >= 0 ? "up" : "down"}" data-symbol="${escapeHtml(leader.symbol)}"
      style="left:${cx}px;top:${cy}px;--size:${centerSize}px;">
      <div class="cluster-symbol">${escapeHtml(leader.symbol)}</div>
      <div class="cluster-name">${escapeHtml(leader.name)}</div>
      <div class="cluster-change ${leader.changePct >= 0 ? "up" : "down"}">${leader.changePct >= 0 ? "+" : ""}${pctFmt.format(leader.changePct)}%</div>
    </div>
  `;

  others.forEach((coin, idx) => {
    const angle = -Math.PI / 2 + (idx / Math.max(1, others.length)) * Math.PI * 2 + (idx % 2 ? 0.09 : -0.06);
    let ring = idx < 8 ? minDim * 0.24 : idx < 18 ? minDim * 0.34 : minDim * 0.43;
    if (compactMode) ring = idx < 5 ? minDim * 0.23 : minDim * 0.33;
    const x = cx + Math.cos(angle) * ring;
    const y = cy + Math.sin(angle) * ring;
    const size = compactMode
      ? clamp(52 + (Math.abs(coin.changePct || 0) / maxAbs) * 26, 50, 88)
      : clamp(64 + (Math.abs(coin.changePct || 0) / maxAbs) * 38, 60, 118);
    html += `
      <div class="cluster-cell ${coin.changePct >= 0 ? "up" : "down"}" data-symbol="${escapeHtml(coin.symbol)}"
        style="left:${x}px;top:${y}px;--size:${size}px;">
        <div class="cluster-symbol">${escapeHtml(coin.symbol)}</div>
        <div class="cluster-change ${coin.changePct >= 0 ? "up" : "down"}">${coin.changePct >= 0 ? "+" : ""}${pctFmt.format(coin.changePct)}%</div>
      </div>
    `;
  });

  els.altCluster.innerHTML = html;

  const mapBySymbol = new Map(sorted.map((coin) => [coin.symbol, coin]));
  els.altCluster.querySelectorAll(".cluster-cell").forEach((node) => {
    node.addEventListener("pointerenter", (ev) => {
      const symbol = node.dataset.symbol;
      const coin = mapBySymbol.get(symbol);
      renderCellInsight(coin, contextMap.get(symbol));
      showFloatingInsight(ev.clientX, ev.clientY);
    });
    node.addEventListener("pointermove", (ev) => {
      showFloatingInsight(ev.clientX, ev.clientY);
    });
    node.addEventListener("pointerleave", () => {
      hideFloatingInsight();
    });
  });
  els.altCluster.onpointerleave = () => {
    hideFloatingInsight();
  };
}

function buildReportText(payload) {
  const { snapshot, fearGreed, globalData, geoTone, altSig, headlines, moodProfile, altBoard } = payload;
  const dateText = new Date().toLocaleDateString("zh-CN");
  const changeText = `${snapshot.changePct >= 0 ? "+" : ""}${pctFmt.format(snapshot.changePct)}%`;
  const fngText = fearGreed ? `${fearGreed.value} (${fearGreed.classification})` : "暂无可用数据";
  const domText = Number.isFinite(globalData?.btcDominance) ? `${pctFmt.format(globalData.btcDominance)}%` : "暂无可用数据";

  const topNews = headlines.slice(0, 2).map((x, idx) => `${idx + 1}. ${summarizeHeadline(x.title)}`).join("；") || "暂无头条";
  const movers = altBoard
    .filter((x) => Number.isFinite(x.changePct))
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 3)
    .map((x) => `${x.symbol} ${x.changePct >= 0 ? "+" : ""}${pctFmt.format(x.changePct)}%`)
    .join("，") || "暂无数据";

  return [
    `日期：${dateText}`,
    `BTC 当日变动：${changeText}，现价 $${numberFmt.format(snapshot.price)}。`,
    `综合氛围：${moodProfile.label}（价格、恐慌贪婪指数与新闻情绪共同判定）。`,
    `市场情绪：恐慌贪婪指数 ${fngText}，BTC Dominance ${domText}。`,
    `地缘政治：风险温度 ${geoTone.tone}（评分 ${geoTone.score.toFixed(1)}/20）。`,
    `新闻焦点：${topNews}。`,
    `山寨判断：${altSig.label}，${altSig.detail}`,
    `高波动币：${movers}。`
  ].join("\n");
}

function bindTilt(selector) {
  const cards = document.querySelectorAll(selector);
  cards.forEach((card) => {
    card.addEventListener("pointermove", (ev) => {
      const rect = card.getBoundingClientRect();
      const px = (ev.clientX - rect.left) / rect.width;
      const py = (ev.clientY - rect.top) / rect.height;
      const rx = (0.5 - py) * 6.2;
      const ry = (px - 0.5) * 7.2;
      card.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      card.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
      card.style.setProperty("--lx", `${(px * 100).toFixed(1)}%`);
      card.style.setProperty("--ly", `${(py * 100).toFixed(1)}%`);
    });

    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
      card.style.setProperty("--lx", "50%");
      card.style.setProperty("--ly", "50%");
    });
  });
}

function bindRevealOnScroll() {
  const targets = document.querySelectorAll(".reveal");
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) entry.target.classList.add("is-visible");
    }
  }, { threshold: 0.18 });
  targets.forEach((el) => io.observe(el));
}

function bindBridgeTransition() {
  const hero = els.hero;
  const news = els.newsSection;
  if (!hero || !news) return;

  const rootStyle = document.documentElement.style;
  let ticking = false;

  const update = () => {
    const heroRect = hero.getBoundingClientRect();
    const viewH = Math.max(window.innerHeight || 0, 1);
    const start = viewH * 0.66;
    const end = viewH * 0.02;
    const span = Math.max(start - end, 1);
    const progress = clamp((start - heroRect.bottom) / span, 0, 1);

    const fade = clamp(1 - progress * 0.88, 0.08, 1);
    const shiftPx = progress * Math.max(84, viewH * 0.1);
    const newsOpacity = clamp(0.34 + progress * 0.52, 0.34, 0.9);

    rootStyle.setProperty("--bridge-progress", progress.toFixed(4));
    rootStyle.setProperty("--bridge-fade", fade.toFixed(4));
    rootStyle.setProperty("--bridge-shift", `${shiftPx.toFixed(1)}px`);
    rootStyle.setProperty("--bridge-news-opacity", newsOpacity.toFixed(4));
    ticking = false;
  };

  const schedule = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  schedule();
}

function bindSceneTransition() {
  const sections = [
    { id: "hero", cls: "scene-hero" },
    { id: "newsSection", cls: "scene-news" },
    { id: "altSection", cls: "scene-alt" }
  ];
  const nodes = sections.map((s) => ({ ...s, el: document.getElementById(s.id), ratio: 0 }));

  const setScene = (sceneCls) => {
    els.body.classList.remove("scene-hero", "scene-news", "scene-alt");
    els.body.classList.add(sceneCls);
  };

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const item = nodes.find((n) => n.el === entry.target);
      if (item) item.ratio = entry.intersectionRatio;
    }
    const best = [...nodes].sort((a, b) => b.ratio - a.ratio)[0];
    if (best && best.ratio > 0.08) setScene(best.cls);
  }, { threshold: [0.08, 0.2, 0.4, 0.6, 0.8] });

  nodes.forEach((n) => n.el && io.observe(n.el));
  setScene("scene-hero");
}

function bindReportToggle() {
  els.briefTrigger.addEventListener("click", (ev) => {
    ev.stopPropagation();
    els.briefZone.classList.toggle("open");
  });

  document.addEventListener("click", (ev) => {
    if (!els.briefZone.contains(ev.target)) els.briefZone.classList.remove("open");
  });
}

function placeCoins() {
  const coins = els.coinLayer.querySelectorAll(".coin");
  coins.forEach((coin) => {
    const bx = Number(coin.dataset.x) || 20;
    const by = Number(coin.dataset.y) || 50;
    coin.style.left = `${bx}%`;
    coin.style.top = `${by}%`;
  });
}

function bindMouseParallax() {
  const coins = els.coinLayer.querySelectorAll(".coin");
  window.addEventListener("pointermove", (ev) => {
    mouse.x = ev.clientX;
    mouse.y = ev.clientY;
    mouse.active = true;
    const nx = (ev.clientX / window.innerWidth - 0.5) * 2;
    const ny = (ev.clientY / window.innerHeight - 0.5) * 2;
    coins.forEach((coin) => {
      const depth = Number(coin.dataset.depth) || 20;
      const tx = nx * depth;
      const ty = ny * depth;
      coin.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
    });
  });

  window.addEventListener("pointerleave", () => {
    mouse.active = false;
    coins.forEach((coin) => {
      coin.style.transform = "translate(0px, 0px)";
    });
  });
}

function setupFxCanvas() {
  const canvas = els.fxCanvas;
  const ctx = canvas.getContext("2d");
  let w = 0;
  let h = 0;
  const particles = [];

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.floor(Math.min(108, Math.max(52, w / 18)));
    particles.length = 0;
    for (let i = 0; i < count; i += 1) {
      particles.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.42, vy: (Math.random() - 0.5) * 0.42, r: Math.random() * 2.4 + 1.0 });
    }

    if (latest.altBoard.length) {
      renderAltCluster(latest.altBoard, latest.contexts);
    }
  }

  function frame() {
    const bull = sceneState.mood === "bull";
    ctx.clearRect(0, 0, w, h);
    const color = bull ? "100,245,182" : "255,130,118";

    for (const p of particles) {
      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const distSq = dx * dx + dy * dy;

      if (mouse.active && distSq < 21000) {
        const dist = Math.max(18, Math.sqrt(distSq));
        const force = (21000 - distSq) / 21000;
        p.vx += (dx / dist) * force * 0.38;
        p.vy += (dy / dist) * force * 0.38;
      }

      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      if (p.y < -10) p.y = h + 10;
      if (p.y > h + 10) p.y = -10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color}, 0.54)`;
      ctx.fill();
    }

    requestAnimationFrame(frame);
  }

  resize();
  frame();
  window.addEventListener("resize", resize);
}

async function refresh() {
  await syncLocalSnapshotFiles();

  const newsSettled = await Promise.allSettled([fetchNewsFeed()]);
  const newsRes = newsSettled[0].status === "fulfilled"
    ? newsSettled[0].value
    : { items: [], sourceStats: {}, failed: -1, totalSources: 0, stale: false, staleMinutes: 0, snapshot: false, snapshotMinutes: null };

  let tickerRes = null;
  let fearGreedRes = null;
  let globalRes = null;
  let altBoardRes = [];
  let officialRes = FALLBACK_EVENTS;
  let tickerError = "";
  let marketSnapshotMinutes = null;

  if (MARKET_SOURCE_MODE === "snapshot") {
    const marketSnapshot = buildMarketFromSnapshot();
    if (marketSnapshot?.ticker) {
      tickerRes = marketSnapshot.ticker;
      fearGreedRes = marketSnapshot.fearGreed;
      globalRes = marketSnapshot.globalData;
      altBoardRes = marketSnapshot.altBoard || [];
      officialRes = marketSnapshot.officialEvents?.length ? marketSnapshot.officialEvents : FALLBACK_EVENTS;
      marketSnapshotMinutes = marketSnapshot.snapshotMinutes;
    }
  }

  if (!tickerRes) {
    const live = await Promise.allSettled([
      fetchTicker(),
      fetchFearGreed(),
      fetchGlobalData(),
      fetchHotAltBoard(),
      getOfficialEvents()
    ]);
    tickerRes = live[0].status === "fulfilled" ? live[0].value : null;
    fearGreedRes = live[1].status === "fulfilled" ? live[1].value : null;
    globalRes = live[2].status === "fulfilled" ? live[2].value : null;
    altBoardRes = live[3].status === "fulfilled" ? live[3].value : [];
    officialRes = live[4].status === "fulfilled" ? live[4].value : FALLBACK_EVENTS;
    tickerError = live[0].status === "rejected" ? String(live[0].reason?.message || "Unknown error") : "";
  }

  const headlines = (newsRes.items || []).slice(0, NEWS_TARGET_COUNT);

  if (!tickerRes) {
    els.badge.className = "pill bear";
    els.badge.textContent = "OFFLINE";
    els.moodLine.textContent = "行情接口不可用，自动重试中。";
    els.newsMeta.innerHTML = `<span class="error-tip">核心行情获取失败：${escapeHtml(tickerError || "Unknown error")}</span>`;
    renderNewsWall(headlines);
    renderSourceStrip(newsRes.sourceStats || {});
    if (altBoardRes.length) {
      const context = buildCoinContext(altBoardRes, officialRes, headlines);
      latest.altBoard = altBoardRes;
      latest.contexts = context;
      renderAltCluster(altBoardRes, context);
    }
    return;
  }

  const moodProfile = deriveCompositeMood(tickerRes, fearGreedRes, headlines);
  updateMoodUI(tickerRes, moodProfile);
  if (Number.isFinite(marketSnapshotMinutes)) {
    els.updatedAt.textContent = `更新时间: ${toLocalTime(Date.now())} · 本地快照 ${marketSnapshotMinutes} 分钟前`;
  }

  const geoTone = evaluateGeoRisk(headlines);
  updateGeoDot(geoTone.score);

  const altSig = deriveAltSentiment(tickerRes.changePct, globalRes?.btcDominance, altBoardRes);

  updateMacroCards(fearGreedRes, globalRes, tickerRes, geoTone);
  renderNewsWall(headlines);
  renderSourceStrip(newsRes.sourceStats);

  if (altBoardRes.length) {
    const context = buildCoinContext(altBoardRes, officialRes, headlines);
    latest.altBoard = altBoardRes;
    latest.contexts = context;
    renderAltCluster(altBoardRes, context);
  } else {
    els.altCluster.innerHTML = "<span class='error-tip'>暂无可用山寨币数据。</span>";
  }

  const reportText = buildReportText({
    snapshot: tickerRes,
    fearGreed: fearGreedRes,
    globalData: globalRes,
    geoTone,
    altSig,
    headlines,
    moodProfile,
    altBoard: altBoardRes
  });
  els.reportContent.textContent = reportText;

  const sourceSummary = Object.keys(newsRes.sourceStats || {}).length;
  const newsFailCount = Number.isFinite(newsRes.failed) ? newsRes.failed : 0;
  const failRatio = newsRes.totalSources > 0 ? newsFailCount / newsRes.totalSources : 0;
  if (newsRes.snapshot) {
    if (!headlines.length) {
      els.newsMeta.innerHTML = "<span class='error-tip'>本地新闻快照为空，请先运行本地同步脚本。</span>";
    } else if (newsRes.stale) {
      els.newsMeta.textContent = `新闻快照模式：来源 ${sourceSummary}，沿用 ${newsRes.staleMinutes} 分钟前快照。`;
    } else if (Number.isFinite(newsRes.snapshotMinutes)) {
      els.newsMeta.textContent = `新闻快照模式：${sourceSummary} 个来源，快照约 ${newsRes.snapshotMinutes} 分钟前更新（前端不直连外部新闻接口）。`;
    } else {
      els.newsMeta.textContent = `新闻快照模式：${sourceSummary} 个来源（前端不直连外部新闻接口）。`;
    }
  } else if (newsFailCount < 0) {
    els.newsMeta.innerHTML = "<span class='error-tip'>实时新闻接口暂不可用，正在重连。</span>";
  } else if (newsRes.stale) {
    els.newsMeta.innerHTML = `<span class="error-tip">实时源短时波动，沿用 ${newsRes.staleMinutes} 分钟前的实时快照（来源 ${sourceSummary}）。</span>`;
  } else if (!headlines.length) {
    els.newsMeta.innerHTML = "<span class='error-tip'>实时新闻暂未返回有效内容，请稍后自动刷新。</span>";
  } else if (newsFailCount === 0 || failRatio <= 0.75) {
    els.newsMeta.textContent = newsFailCount === 0
      ? `实时新闻源正常：${sourceSummary} 个来源，方块墙已按影响力重排。`
      : `实时新闻源正常：${sourceSummary} 个来源，${newsFailCount}/${newsRes.totalSources || "?"} 接口请求失败（常见于跨域/CORS、限流或代理超时），主结果已自动聚合。`;
  } else {
    els.newsMeta.innerHTML = `<span class="error-tip">实时新闻源已聚合：${sourceSummary} 个来源，部分接口请求失败（${newsFailCount}/${newsRes.totalSources || "?"}，常见原因：跨域/CORS、限流或代理超时）。</span>`;
  }
}

function init() {
  placeCoins();
  bindReportToggle();
  bindMouseParallax();
  bindRevealOnScroll();
  bindBridgeTransition();
  bindSceneTransition();
  if (!isMobileViewport()) bindTilt(".focus-panel");
  setupFxCanvas();
  refresh();
  setInterval(refresh, REFRESH_MS);
}

init();

