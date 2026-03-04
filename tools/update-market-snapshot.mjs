import { readFile, writeFile } from "node:fs/promises";

const OUTPUT_JS_FILE = "market.snapshot.js";
const OUTPUT_JSON_FILE = "market.snapshot.json";

const ALT_CONFIG = [
  { id: "ethereum", symbol: "ETH", name: "Ethereum", repo: "ethereum/go-ethereum", aliases: ["eth", "ethereum"] },
  { id: "solana", symbol: "SOL", name: "Solana", repo: "solana-labs/solana", aliases: ["sol", "solana"] },
  { id: "ripple", symbol: "XRP", name: "Ripple", repo: "XRPLF/rippled", aliases: ["xrp", "ripple", "xrpl"] },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin", repo: "dogecoin/dogecoin", aliases: ["doge", "dogecoin"] },
  { id: "cardano", symbol: "ADA", name: "Cardano", repo: "IntersectMBO/cardano-node", aliases: ["ada", "cardano"] },
  { id: "sui", symbol: "SUI", name: "Sui", repo: "MystenLabs/sui", aliases: ["sui"] },
  { id: "chainlink", symbol: "LINK", name: "Chainlink", repo: "smartcontractkit/chainlink", aliases: ["link", "chainlink"] },
  { id: "avalanche-2", symbol: "AVAX", name: "Avalanche", repo: "ava-labs/avalanchego", aliases: ["avax", "avalanche"] },
  { id: "tron", symbol: "TRX", name: "Tron", repo: "tronprotocol/java-tron", aliases: ["trx", "tron"] },
  { id: "toncoin", symbol: "TON", name: "Toncoin", repo: "ton-blockchain/ton", aliases: ["ton", "toncoin"] },
  { id: "polkadot", symbol: "DOT", name: "Polkadot", repo: "paritytech/polkadot-sdk", aliases: ["dot", "polkadot"] },
  { id: "litecoin", symbol: "LTC", name: "Litecoin", repo: "litecoin-project/litecoin", aliases: ["ltc", "litecoin"] },
  { id: "bitcoin-cash", symbol: "BCH", name: "Bitcoin Cash", repo: "bitcoin-cash-node/bitcoin-cash-node", aliases: ["bch", "bitcoin cash"] },
  { id: "aptos", symbol: "APT", name: "Aptos", repo: "aptos-labs/aptos-core", aliases: ["apt", "aptos"] },
  { id: "arbitrum", symbol: "ARB", name: "Arbitrum", repo: "OffchainLabs/nitro", aliases: ["arb", "arbitrum"] },
  { id: "optimism", symbol: "OP", name: "Optimism", repo: "ethereum-optimism/optimism", aliases: ["op", "optimism"] },
  { id: "near", symbol: "NEAR", name: "Near", repo: "near/nearcore", aliases: ["near"] },
  { id: "cosmos", symbol: "ATOM", name: "Cosmos", repo: "cosmos/cosmos-sdk", aliases: ["atom", "cosmos"] },
  { id: "filecoin", symbol: "FIL", name: "Filecoin", repo: "filecoin-project/lotus", aliases: ["fil", "filecoin"] },
  { id: "stellar", symbol: "XLM", name: "Stellar", repo: "stellar/stellar-core", aliases: ["xlm", "stellar"] },
  { id: "uniswap", symbol: "UNI", name: "Uniswap", repo: "Uniswap/v3-core", aliases: ["uni", "uniswap"] }
];

function eventTypeLabel(type) {
  if (type === "PushEvent") return "代码提交";
  if (type === "ReleaseEvent") return "版本发布";
  if (type === "PullRequestEvent") return "PR 变更";
  if (type === "IssuesEvent") return "Issue 更新";
  if (type === "CreateEvent") return "分支/标签创建";
  return "仓库动态";
}

function fallbackOfficialEvents() {
  const now = Date.now();
  return [
    { coin: "ETH", source: "Official", title: "Ethereum 官方渠道持续跟踪客户端升级进展", url: "https://github.com/ethereum/go-ethereum/events", time: now - 3600000 },
    { coin: "SOL", source: "Official", title: "Solana 官方仓库持续有代码提交与 Issue 更新", url: "https://github.com/solana-labs/solana/events", time: now - 5400000 },
    { coin: "XRP", source: "Official", title: "XRPL 官方仓库保持协议讨论与维护节奏", url: "https://github.com/XRPLF/rippled/events", time: now - 7200000 }
  ];
}

async function readPreviousSnapshot() {
  try {
    const raw = await readFile(OUTPUT_JSON_FILE, "utf8");
    const payload = JSON.parse(raw);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

async function fetchJson(url, timeoutMs = 12000, retries = 2) {
  let lastError = null;
  for (let i = 0; i <= retries; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (market-snapshot-builder)"
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (i < retries) await new Promise((resolve) => setTimeout(resolve, 360 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("fetch failed");
}

function normalizeDominance(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return value > 0 && value <= 1.5 ? value * 100 : value;
}

async function fetchTickerCoinLore() {
  const rows = await fetchJson("https://api.coinlore.net/api/ticker/?id=90", 12000, 1);
  const btc = Array.isArray(rows) ? rows[0] : null;
  if (!btc) throw new Error("CoinLore ticker payload invalid");
  const price = Number(btc.price_usd);
  const changePct = Number(btc.percent_change_24h);
  const volumeUsd = Number(btc.volume24);
  if (!Number.isFinite(price) || !Number.isFinite(changePct)) throw new Error("CoinLore ticker fields invalid");
  return { price, changePct, volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : null, source: "CoinLore" };
}

async function fetchTickerAlternative() {
  const data = await fetchJson("https://api.alternative.me/v2/ticker/bitcoin/?convert=USD", 12000, 1);
  const row = data?.data && typeof data.data === "object" ? Object.values(data.data)[0] : null;
  const quote = row?.quotes?.USD;
  const price = Number(quote?.price);
  const changePct = Number(quote?.percentage_change_24h);
  const volumeUsd = Number(quote?.volume_24h);
  if (!Number.isFinite(price) || !Number.isFinite(changePct)) throw new Error("Alternative ticker fields invalid");
  return { price, changePct, volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : null, source: "Alternative.me" };
}

async function fetchTickerGate() {
  const rows = await fetchJson("https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT", 12000, 1);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error("Gate ticker payload invalid");
  const price = Number(row.last);
  const changePct = Number(row.change_percentage);
  const volumeUsd = Number(row.quote_volume);
  if (!Number.isFinite(price) || !Number.isFinite(changePct)) throw new Error("Gate ticker fields invalid");
  return { price, changePct, volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : null, source: "Gate" };
}

async function fetchTicker() {
  const runners = [fetchTickerCoinLore, fetchTickerAlternative, fetchTickerGate];
  let lastError = null;
  for (const run of runners) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("ticker fetch failed");
}

async function fetchFearGreed() {
  const data = await fetchJson("https://api.alternative.me/fng/?limit=1&format=json", 12000, 1);
  const item = data?.data?.[0];
  if (!item) throw new Error("FearGreed payload invalid");
  const value = Number(item.value);
  if (!Number.isFinite(value)) throw new Error("FearGreed value invalid");
  return {
    value,
    classification: item.value_classification || "Unknown"
  };
}

async function fetchGlobalAlternative() {
  const data = await fetchJson("https://api.alternative.me/v2/global/", 12000, 1);
  const root = data?.data;
  if (!root) throw new Error("Alternative global payload invalid");
  const btcDominance = normalizeDominance(root?.bitcoin_percentage_of_market_cap);
  const totalMarketCapUsd = Number(root?.quotes?.USD?.total_market_cap);
  return {
    btcDominance: Number.isFinite(btcDominance) ? btcDominance : null,
    totalMarketCapUsd: Number.isFinite(totalMarketCapUsd) ? totalMarketCapUsd : null
  };
}

async function fetchGlobalCoinLore() {
  const rows = await fetchJson("https://api.coinlore.net/api/global/", 12000, 1);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error("CoinLore global payload invalid");
  const btcDominance = normalizeDominance(row?.btc_d);
  const totalMarketCapUsd = Number(row?.total_mcap);
  return {
    btcDominance: Number.isFinite(btcDominance) ? btcDominance : null,
    totalMarketCapUsd: Number.isFinite(totalMarketCapUsd) ? totalMarketCapUsd : null
  };
}

async function fetchGlobalData() {
  const runners = [fetchGlobalAlternative, fetchGlobalCoinLore];
  let lastError = null;
  for (const run of runners) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("global fetch failed");
}

async function fetchHotAltBoardCoinLore() {
  const data = await fetchJson("https://api.coinlore.net/api/tickers/?start=0&limit=400", 12000, 1);
  const rows = Array.isArray(data?.data) ? data.data : [];
  if (!rows.length) throw new Error("CoinLore alt payload invalid");

  const bySymbol = new Map(rows.map((row) => [String(row.symbol || "").toUpperCase(), row]));
  const out = ALT_CONFIG.map((cfg) => {
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
      volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : null,
      rank: Number(row.rank),
      source: "CoinLore"
    };
  }).filter(Boolean);

  if (out.length < 5) throw new Error("CoinLore alt rows insufficient");
  return out;
}

async function fetchHotAltBoardAlternative() {
  const data = await fetchJson("https://api.alternative.me/v2/ticker/?limit=400&convert=USD", 14000, 1);
  const rows = data?.data && typeof data.data === "object" ? Object.values(data.data) : [];
  if (!rows.length) throw new Error("Alternative alt payload invalid");

  const bySymbol = new Map(rows.map((row) => [String(row?.symbol || "").toUpperCase(), row]));
  const out = ALT_CONFIG.map((cfg) => {
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
      volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : null,
      rank: Number(row?.rank),
      source: "Alternative.me"
    };
  }).filter(Boolean);

  if (out.length < 5) throw new Error("Alternative alt rows insufficient");
  return out;
}

async function fetchHotAltBoard() {
  const runners = [fetchHotAltBoardCoinLore, fetchHotAltBoardAlternative];
  let lastError = null;
  for (const run of runners) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("alt fetch failed");
}

async function fetchOfficialEvents() {
  const picks = ALT_CONFIG.slice(0, 10);
  const jobs = picks.map(async (cfg) => {
    const rows = await fetchJson(`https://api.github.com/repos/${cfg.repo}/events?per_page=1`, 12000, 1);
    const event = Array.isArray(rows) ? rows[0] : null;
    if (!event) throw new Error("No github events");
    return {
      coin: cfg.symbol,
      source: "GitHub",
      title: `${cfg.symbol} ${eventTypeLabel(event.type)}`,
      url: `https://github.com/${cfg.repo}/events`,
      time: Date.parse(event.created_at || "") || Date.now()
    };
  });

  const settled = await Promise.allSettled(jobs);
  const out = settled
    .filter((row) => row.status === "fulfilled")
    .map((row) => row.value)
    .sort((a, b) => b.time - a.time)
    .slice(0, 8);
  return out.length ? out : fallbackOfficialEvents();
}

async function main() {
  const previous = await readPreviousSnapshot();
  const snapshotAt = new Date().toISOString();
  const settled = await Promise.allSettled([
    fetchTicker(),
    fetchFearGreed(),
    fetchGlobalData(),
    fetchHotAltBoard(),
    fetchOfficialEvents()
  ]);

  let ticker = settled[0].status === "fulfilled" ? settled[0].value : null;
  const fearGreed = settled[1].status === "fulfilled" ? settled[1].value : null;
  const globalData = settled[2].status === "fulfilled" ? settled[2].value : null;
  const altBoard = settled[3].status === "fulfilled" ? settled[3].value : [];
  const officialEvents = settled[4].status === "fulfilled" ? settled[4].value : fallbackOfficialEvents();

  if (!ticker && previous?.ticker) {
    const prevPrice = Number(previous.ticker.price);
    const prevChangePct = Number(previous.ticker.changePct);
    if (Number.isFinite(prevPrice) && prevPrice > 0 && Number.isFinite(prevChangePct)) {
      ticker = {
        ...previous.ticker,
        source: `Cached/${previous.ticker.source || "Snapshot"}`
      };
    }
  }

  const payload = {
    snapshotAt,
    ticker,
    fearGreed,
    globalData,
    altBoard,
    officialEvents
  };

  const outputJs = [
    "// Auto-generated by tools/update-market-snapshot.mjs",
    `window.__MARKET_SNAPSHOT_AT__ = ${JSON.stringify(snapshotAt)};`,
    `window.__MARKET_SNAPSHOT__ = ${JSON.stringify(payload, null, 2)};`,
    ""
  ].join("\n");

  await writeFile(OUTPUT_JS_FILE, outputJs, "utf8");
  await writeFile(OUTPUT_JSON_FILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[snapshot] wrote ${OUTPUT_JS_FILE} and ${OUTPUT_JSON_FILE}`);
}

main().catch((error) => {
  console.error(`[snapshot] failed: ${error.stack || error.message}`);
  process.exit(1);
});
