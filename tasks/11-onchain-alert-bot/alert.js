#!/usr/bin/env node
import { connect, CHAIN_MCP_URL, takeCallLog } from "../../lib/mcp.js";
import { summarizeCalls } from "../../lib/agent.js";
import { scanAlerts } from "../../lib/alerts.js";
import { applyEnvFile, channelsFromEnv, deliver, freshAlerts, loadLastPrice, loadSeen, remember, saveLastPrice, saveSeen } from "../../lib/notify.js";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run alerts -- --mode transfer|price|call [options]

  --mode transfer   USDC --min 50
  --mode price      --price 0.05 --side above|below
  --mode call       --contract 0xA5cA5Fbe34e444F366B373170541ec6902b0F75c --selector 0x128acb08
  --lookback 1000   --lang en|pt   --watch   --interval 20

One condition per run. New alerts go to Discord or Telegram.
The same event is stored and not sent again.
Put DISCORD_WEBHOOK_URL, or TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID, in .env`);
  process.exit(0);
}

await applyEnvFile(new URL("../../.env", import.meta.url));

const opts = { mode: "transfer", token: "USDC", min: "50", lookback: "200", price: "", side: "above", contract: "", selector: "", lang: "en", watch: false, interval: "20" };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--mode") opts.mode = args[++i];
  else if (a === "--min") opts.min = args[++i];
  else if (a === "--lookback") opts.lookback = args[++i];
  else if (a === "--price") opts.price = args[++i];
  else if (a === "--side") opts.side = args[++i];
  else if (a === "--contract") opts.contract = args[++i];
  else if (a === "--selector") opts.selector = args[++i];
  else if (a === "--lang") opts.lang = args[++i];
  else if (a === "--interval") opts.interval = args[++i];
  else if (a === "--watch") opts.watch = true;
  else if (!a.startsWith("--")) opts.token = a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function once(client) {
  takeCallLog(client);
  if (opts.mode === "price") opts.prevPrice = await loadLastPrice();
  const report = await scanAlerts(client, opts);
  console.log(report.headline);
  if (report.mode === "price") console.log(`price ${report.price ?? "n/a"} USDC per WPROS, line ${report.threshold} ${report.side}`);
  const seen = await loadSeen();
  const fresh = freshAlerts(report.alerts, seen).slice(0, 8);
  const activePrice = report.alerts.filter((a) => a.kind === "price").map((a) => a.id);
  for (const a of fresh) console.log(`ALERT ${a.kind}\n${a.line}\nvalue ${a.value}\n${a.link}`);
  if (!fresh.length) console.log("(no new alerts)");
  const delivery = fresh.length
    ? await deliver(fresh)
    : { delivered: true, channels: channelsFromEnv(), sent: 0, sentAlerts: [], error: "" };
  const priceStillOwed = fresh.some((a) => a.kind === "price") && !delivery.sent;
  if (report.price != null && !priceStillOwed) await saveLastPrice(report.price);
  if (delivery.sent) await saveSeen(remember(seen, delivery.sentAlerts, activePrice));
  if (delivery.error) console.error(delivery.error);
  console.log(`channel ${delivery.channels?.join(", ") || "none"} sent ${delivery.sent ?? 0}`);
  console.log(`calls ${summarizeCalls(takeCallLog(client))}`);
}

const client = await connect(CHAIN_MCP_URL, "pharos-desk-alerts");
try {
  do {
    try {
      await once(client);
    } catch (error) {
      console.error(error.message || error);
    }
    if (opts.watch) await sleep(Math.max(Number(opts.interval) || 20, 10) * 1000);
  } while (opts.watch);
} finally {
  if (!opts.watch) await client.close().catch(() => {});
}
