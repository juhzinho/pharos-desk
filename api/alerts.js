import { CHAIN_MCP_URL } from "../lib/mcp.js";
import { withClient } from "../lib/api-util.js";
import { applyEnvFile } from "../lib/notify.js";
import { runTrackedScan } from "../lib/alert-run.js";
import { armedNote, suggestLine } from "../lib/alerts.js";
import { armWatch, priceIsHot } from "../lib/watches.js";

export default async function handler(req, res) {
  await applyEnvFile(new URL("../.env", import.meta.url));
  const q = new URL(req.url, "http://localhost").searchParams;
  const lang = q.get("lang") === "pt" ? "pt" : "en";
  return withClient(CHAIN_MCP_URL, res, async (client) => {
    if (q.get("mode") === "spot") {
      const { report } = await runTrackedScan(client, { mode: "price", price: "1", side: "above", lookback: "1", lang, silent: true });
      const price = report.price;
      return {
        ok: true,
        price,
        above: price == null ? null : suggestLine(price, "above"),
        below: price == null ? null : suggestLine(price, "below"),
      };
    }
    const { report, fresh, delivery } = await runTrackedScan(client, {
      mode: q.get("mode") || "transfer",
      token: q.get("token") || "USDC",
      min: q.get("min") || "50",
      price: q.get("price") ?? "",
      side: q.get("side") || "above",
      contract: q.get("contract") || "",
      selector: q.get("selector") || "",
      lookback: q.get("lookback") || "200",
      lang,
    });
    let saved = null;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (chatId) {
      const hot = report.mode === "price" && report.price != null && priceIsHot(report.price, report.threshold, report.side);
      try {
        saved = await armWatch({
          chatId,
          lang,
          mode: report.mode,
          token: q.get("token") || "USDC",
          min: q.get("min") || "50",
          contract: report.contract || q.get("contract") || "",
          selector: q.get("selector") || "",
          threshold: report.threshold,
          side: report.side,
          latched: Boolean(hot),
          sinceBlock: report.toBlock || 0,
        });
      } catch (error) {
        console.error(error);
      }
    }
    const note = saved
      ? armedNote(report.mode, report.price, report.threshold, report.side, saved.latched, lang)
      : "";
    return { ...report, alerts: fresh, delivery, armed: saved ? { id: saved.id, latched: Boolean(saved.latched) } : null, armedNote: note };
  });
}
