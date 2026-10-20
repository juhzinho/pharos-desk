#!/usr/bin/env node
import { connect, CHAIN_MCP_URL, takeCallLog } from "../../lib/mcp.js";
import { summarizeCalls } from "../../lib/agent.js";
import { inspectTx } from "../../lib/support.js";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run support -- 0xTxHash [--lang en|pt]

Explains why a Pacific transaction failed, on request. Read-only Chain MCP.`);
  process.exit(0);
}

const hash = args.find((a) => /^0x[0-9a-f]{64}$/i.test(a));
let lang = "en";
const li = args.indexOf("--lang");
if (li >= 0) lang = args[li + 1] === "pt" ? "pt" : "en";
if (!hash) {
  console.error("Pass a transaction hash.");
  process.exit(1);
}

const client = await connect(CHAIN_MCP_URL, "pharos-desk-support");
try {
  takeCallLog(client);
  const report = await inspectTx(client, hash, lang);
  console.log(report.headline);
  for (const line of report.lines) console.log(line);
  if (report.link) console.log(report.link);
  console.log(`\ncalls ${summarizeCalls(takeCallLog(client))}`);
} finally {
  await client.close().catch(() => {});
}
