import { CHAIN_MCP_URL } from "../lib/mcp.js";
import { withClient } from "../lib/api-util.js";
import { simulate } from "../lib/dry-run.js";

export default async function handler(req, res) {
  const q = new URL(req.url, "http://localhost").searchParams;
  const lang = q.get("lang") === "pt" ? "pt" : "en";
  return withClient(CHAIN_MCP_URL, res, (client) => simulate(client, {
    lang,
    sample: q.get("sample") || "",
    kind: q.get("kind") || q.get("mode") || "",
    token: q.get("token") || "",
    from: q.get("from") || "",
    to: q.get("to") || "",
    amount: q.get("amount") || "",
    execute: q.get("execute") === "1",
  }));
}
