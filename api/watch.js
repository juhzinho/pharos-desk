import { applyEnvFile } from "../lib/notify.js";
import { readState, updateState } from "../lib/state.js";
import { checkPriceWatches } from "../lib/telegram.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const GAP_MS = 25000;
const DAY_CAP = 3000;

function allowed(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.authorization === `Bearer ${secret}`;
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (!allowed(req)) {
    res.statusCode = 401;
    res.end("no");
    return;
  }
  await applyEnvFile(new URL("../.env", import.meta.url));
  const url = new URL(req.url, "http://localhost");
  const seq = Number(url.searchParams.get("seq") || 0);
  const today = dayKey();
  const now = Date.now();
  const bag = await readState();
  const lease = Number(bag.watchLease) || 0;
  const current = Number(bag.watchSeq) || 0;
  const count = bag.watchDay === today ? Number(bag.watchCount) || 0 : 0;
  const successor = seq > 0 && seq === current;
  if (count >= DAY_CAP) {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, stopped: true }));
    return;
  }
  if (!successor && lease > now) {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, skipped: true }));
    return;
  }

  const next = current + 1;
  await updateState((state) => {
    const sameDay = state.watchDay === today;
    state.watchSeq = next;
    state.watchLease = Date.now() + GAP_MS + 20000;
    state.watchCount = (sameDay ? Number(state.watchCount) || 0 : 0) + 1;
    state.watchDay = today;
  });

  let checked = false;
  try {
    await checkPriceWatches();
    checked = true;
  } catch (error) {
    console.error(error);
  }

  await sleep(GAP_MS);
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  if (host && process.env.CRON_SECRET) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    await fetch(`${proto}://${host}/api/watch?seq=${next}`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: ctrl.signal,
    }).catch(() => {});
    clearTimeout(timer);
  }

  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ ok: true, checked }));
}
