import { spawn } from "node:child_process";

const RAW_INTERVAL_MINUTES = Number(process.env.SNAPSHOT_INTERVAL_MINUTES || 5);
const INTERVAL_MS = Math.max(1, Number.isFinite(RAW_INTERVAL_MINUTES) ? RAW_INTERVAL_MINUTES : 5) * 60 * 1000;
const JOBS = [
  "tools/update-news-snapshot.mjs",
  "tools/news-impact-agent.mjs",
  "tools/update-market-snapshot.mjs"
];

function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptPath} exited with code ${code}`));
    });
  });
}

async function runCycle() {
  const beginAt = Date.now();
  let ok = 0;
  let failed = 0;

  for (const job of JOBS) {
    try {
      await runNodeScript(job);
      ok += 1;
    } catch (error) {
      failed += 1;
      console.error(`[daemon] failed: ${job} -> ${error?.message || error}`);
    }
  }

  const seconds = ((Date.now() - beginAt) / 1000).toFixed(1);
  console.log(`[daemon] cycle done in ${seconds}s, ok=${ok}, failed=${failed}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`[daemon] local sync started, interval=${Math.round(INTERVAL_MS / 60000)}m`);
  while (true) {
    await runCycle();
    await sleep(INTERVAL_MS);
  }
}

main().catch((error) => {
  console.error(`[daemon] fatal: ${error.stack || error.message}`);
  process.exit(1);
});
