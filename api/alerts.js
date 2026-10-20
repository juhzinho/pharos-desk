import { CHAIN_MCP_URL } from "../lib/mcp.js";
import { withClient } from "../lib/api-util.js";
import { applyEnvFile } from "../lib/notify.js";
import { runTrackedScan } from "../lib/alert-run.js";

export default async function handler(req, res) {
  await applyEnvFile(new URL("../.env", import.meta.url));
  const q = new URL(req.url, "http://localhost").searchParams;
  return withClient(CHAIN_MCP_URL, res, async (client) => {
    const { report, fresh, delivery } = await runTrackedScan(client, {
      mode: q.get("mode") || "transfer",
      token: q.get("token") || "USDC",
      min: q.get("min") || "50",
      price: q.get("price") ?? "",
      side: q.get("side") || "above",
      contract: q.get("contract") || "",
      selector: q.get("selector") || "",
      lookback: q.get("lookback") || "200",
      lang: q.get("lang") === "pt" ? "pt" : "en",
    });
    return { ...report, alerts: fresh, delivery };
  });
}
