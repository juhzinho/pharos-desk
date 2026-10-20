#!/usr/bin/env node
import { connect, DOCS_MCP_URL, takeCallLog } from "../../lib/mcp.js";
import { summarizeCalls } from "../../lib/agent.js";
import { runOnboarding } from "../../lib/onboard.js";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run onboard -- [--lang en|pt]

Walks a fixed onboarding checklist against Developer Docs MCP only.
Logs covered / thin / broke. Does not invent missing pages.`);
  process.exit(0);
}

const lang = args.includes("--lang") && args[args.indexOf("--lang") + 1] === "pt" ? "pt" : (args.includes("pt") ? "pt" : "en");
const client = await connect(DOCS_MCP_URL, "pharos-desk-onboard");
try {
  takeCallLog(client);
  const report = await runOnboarding(client, lang);
  console.log(report.headline);
  console.log(`Docs MCP ${DOCS_MCP_URL}`);
  report.steps.forEach((step, i) => {
    console.log(`\n${i + 1}. Tried: ${step.tried}`);
    console.log(`   Query: ${step.query}`);
    console.log(`   [${step.grade}] ${step.note}`);
    if (step.answer) console.log(step.answer.slice(0, 700));
    for (const s of step.sources) console.log(`   source  ${s.title}  ${s.url}`);
  });
  console.log("\nGaps");
  report.gaps.forEach((gap, i) => {
    console.log(`\n${i + 1}. Query: ${gap.query}`);
    console.log(`   ${gap.problem}`);
    console.log(`   Docs should have said: ${gap.fix}`);
  });
  console.log(`\nRan\n${report.ran}`);
  console.log(`\ncalls ${summarizeCalls(takeCallLog(client))}`);
} finally {
  await client.close().catch(() => {});
}
