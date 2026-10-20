import { readFile } from "node:fs/promises";
import { readState, updateState } from "./state.js";

export function alertText(alert) {
  return [alert.line, alert.value ? `value ${alert.value}` : "", alert.link].filter(Boolean).join("\n");
}

export function freshAlerts(alerts, seenIds) {
  const seen = new Set(seenIds ?? []);
  return (alerts ?? []).filter((a) => a?.id && !seen.has(a.id));
}

export function remember(seenIds, sent, activePriceIds = []) {
  const next = new Set(seenIds ?? []);
  for (const alert of sent) next.add(alert.id);
  for (const id of [...next]) {
    if (String(id).startsWith("price:") && !activePriceIds.includes(id)) next.delete(id);
  }
  return [...next].slice(-400);
}

export function channelsFromEnv(env = process.env) {
  const channels = [];
  if (env.DISCORD_WEBHOOK_URL) channels.push("discord");
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) channels.push("telegram");
  return channels;
}

async function post(url, body, fetchImpl) {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`notify ${res.status}`);
}

export function loadDotEnv(text) {
  const env = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const cut = trimmed.indexOf("=");
    if (cut < 1) continue;
    env[trimmed.slice(0, cut).trim()] = trimmed.slice(cut + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

/** Fill empty process.env keys from a .env file. Existing variables win. */
export async function applyEnvFile(fileUrl) {
  try {
    const parsed = loadDotEnv(await readFile(fileUrl, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
    }
  } catch {
    /* local file is optional; production uses the host env */
  }
}

export async function deliver(alerts, env = process.env, fetchImpl = globalThis.fetch) {
  const channels = channelsFromEnv(env);
  if (!alerts.length) return { delivered: true, channels, sent: 0, sentAlerts: [] };
  if (!channels.length) {
    return {
      delivered: false,
      channels,
      sent: 0,
      sentAlerts: [],
      error: "Set DISCORD_WEBHOOK_URL or TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID",
    };
  }
  const sentAlerts = [];
  let error = "";
  for (const alert of alerts) {
    const content = alertText(alert).slice(0, 1900);
    try {
      if (channels.includes("discord")) {
        await post(env.DISCORD_WEBHOOK_URL, { content }, fetchImpl);
      }
      if (channels.includes("telegram")) {
        const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        await post(url, { chat_id: env.TELEGRAM_CHAT_ID, text: content, disable_web_page_preview: true }, fetchImpl);
      }
      sentAlerts.push(alert);
    } catch (e) {
      error = e.message || "notify failed";
      break;
    }
  }
  return { delivered: !error, channels, sent: sentAlerts.length, sentAlerts, error };
}

export async function loadSeen() {
  const seen = (await readState()).seen;
  return Array.isArray(seen) ? seen : [];
}

export async function loadLastPrice() {
  const price = Number((await readState()).price);
  return Number.isFinite(price) ? price : null;
}

export async function saveLastPrice(price) {
  if (!Number.isFinite(price)) return;
  await updateState((bag) => {
    bag.price = price;
  });
}

export async function saveSeen(ids) {
  await updateState((bag) => {
    bag.seen = ids;
  });
}
