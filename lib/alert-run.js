import { scanAlerts } from "./alerts.js";
import { channelsFromEnv, deliver, freshAlerts, loadLastPrice, loadSeen, remember, saveLastPrice, saveSeen } from "./notify.js";

/** One scan, the same rules as the site: fresh events only, price stored after a real cross is delivered. */
export async function runTrackedScan(client, opts = {}) {
  const mode = opts.mode || "transfer";
  const report = await scanAlerts(client, {
    ...opts,
    mode,
    prevPrice: mode === "price" ? await loadLastPrice() : null,
    lookback: opts.lookback || "200",
    api: true,
  });
  const seen = await loadSeen();
  const fresh = freshAlerts(report.alerts, seen).slice(0, 8);
  const activePrice = report.alerts.filter((a) => a.kind === "price").map((a) => a.id);
  const delivery = opts.silent || !fresh.length
    ? { delivered: true, channels: opts.silent ? [] : channelsFromEnv(), sent: 0, sentAlerts: [], error: "" }
    : await deliver(fresh);
  const priceStillOwed = fresh.some((a) => a.kind === "price") && (opts.silent || !delivery.sent);
  if (report.price != null && !priceStillOwed) await saveLastPrice(report.price);
  if (delivery.sent) await saveSeen(remember(seen, delivery.sentAlerts, activePrice));
  return { report, fresh, seen, activePrice, delivery };
}
