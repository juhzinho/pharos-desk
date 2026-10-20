import { CHAIN_MCP_URL } from "../lib/mcp.js";
import { withClient } from "../lib/api-util.js";
import { inspectTx } from "../lib/support.js";

export default async function handler(req, res) {
  const q = new URL(req.url, "http://localhost").searchParams;
  const lang = q.get("lang") === "pt" ? "pt" : "en";
  const tx = q.get("tx") || q.get("hash") || "";
  return withClient(CHAIN_MCP_URL, res, (client) => inspectTx(client, tx, lang));
}
