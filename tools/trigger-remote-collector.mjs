import { readFile, writeFile } from "node:fs/promises";

const OWNER = String(process.env.GITHUB_REMOTE_OWNER || "").trim();
const REPO = String(process.env.GITHUB_REMOTE_REPO || "").trim();
const WORKFLOW = String(process.env.GITHUB_REMOTE_WORKFLOW || "remote-news-agent.yml").trim();
const REF = String(process.env.GITHUB_REMOTE_REF || "main").trim();
const TOKEN = String(process.env.GITHUB_REMOTE_TOKEN || "").trim();
const STRICT = String(process.env.GITHUB_REMOTE_STRICT || "0") === "1";
const MIN_INTERVAL_MINUTES = Math.max(5, Number(process.env.GITHUB_REMOTE_MIN_INTERVAL_MINUTES || 30));
const STATE_FILE = ".remote-trigger.state.json";

async function readState() {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const json = JSON.parse(raw);
    return Number.isFinite(Number(json?.lastTriggeredAt)) ? Number(json.lastTriggeredAt) : 0;
  } catch {
    return 0;
  }
}

async function writeState(ts) {
  const payload = {
    lastTriggeredAt: ts,
    lastTriggeredAtIso: new Date(ts).toISOString(),
    workflow: WORKFLOW,
    ref: REF
  };
  await writeFile(STATE_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  if (!OWNER || !REPO || !TOKEN) {
    console.log("[remote-trigger] skip: GITHUB_REMOTE_OWNER/REPO/TOKEN not configured.");
    return;
  }

  const now = Date.now();
  const last = await readState();
  const minIntervalMs = MIN_INTERVAL_MINUTES * 60 * 1000;
  if (last > 0 && now - last < minIntervalMs) {
    const remainMs = minIntervalMs - (now - last);
    const remainMin = Math.ceil(remainMs / 60000);
    console.log(`[remote-trigger] skip: next trigger in about ${remainMin}m.`);
    return;
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(OWNER)}/${encodeURIComponent(REPO)}/actions/workflows/${encodeURIComponent(WORKFLOW)}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ref: REF })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const message = `GitHub dispatch failed: HTTP ${res.status} ${text.slice(0, 200)}`;
    if (STRICT) {
      throw new Error(message);
    }
    console.error(`[remote-trigger] ${message}`);
    return;
  }

  await writeState(now);
  console.log(`[remote-trigger] dispatched workflow ${WORKFLOW} on ${OWNER}/${REPO}@${REF}`);
}

main().catch((error) => {
  console.error(`[remote-trigger] fatal: ${error.stack || error.message}`);
  if (STRICT) process.exit(1);
});

