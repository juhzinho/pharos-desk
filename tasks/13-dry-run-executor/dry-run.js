#!/usr/bin/env node
import { connect, CHAIN_MCP_URL, takeCallLog } from "../../lib/mcp.js";
import { summarizeCalls } from "../../lib/agent.js";
import { simulate } from "../../lib/dry-run.js";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run dry-run -- --sample pass|revert|gas [--send] [--lang en|pt]
       npm run dry-run -- --from 0x... --to 0x... --token USDC --amount 1 [--kind transfer|approve|native]

Simulates a Pacific transaction with eth_call and estimate_gas. Never broadcasts.`);
  process.exit(0);
}

function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : "";
}

const client = await connect(CHAIN_MCP_URL, "pharos-desk-dry-run");
try {
  takeCallLog(client);
  const report = await simulate(client, {
    lang: flag("--lang") === "pt" ? "pt" : "en",
    sample: flag("--sample"),
    kind: flag("--kind"),
    token: flag("--token"),
    from: flag("--from"),
    to: flag("--to"),
    amount: flag("--amount"),
    execute: args.includes("--send"),
  });
  if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(report.headline);
    for (const line of report.lines) console.log(line);
    if (report.unsigned) console.log(JSON.stringify(report.unsigned));
  }
  console.log(`\ncalls ${summarizeCalls(takeCallLog(client))}`);
} finally {
  await client.close().catch(() => {});
}
