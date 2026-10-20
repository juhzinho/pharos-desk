import { DOCS_MCP_URL } from "../lib/mcp.js";
import { withClient } from "../lib/api-util.js";
import { runOnboarding } from "../lib/onboard.js";

export default async function handler(req, res) {
  const lang = new URL(req.url, "http://localhost").searchParams.get("lang") === "pt" ? "pt" : "en";
  return withClient(DOCS_MCP_URL, res, (client) => runOnboarding(client, lang));
}
