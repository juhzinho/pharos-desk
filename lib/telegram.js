import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CHAIN_MCP_URL } from "./mcp.js";
import { readState, updateState } from "./state.js";
import { getSharedClient, resetSharedClient } from "./server-client.js";
import { remember, saveLastPrice, saveSeen } from "./notify.js";
import { runTrackedScan } from "./alert-run.js";
import { addWatch, ensureIds, patchWatches, priceIsHot, removeWatch, loadWatches, updatePriceWatch, upsertWatch } from "./watches.js";
import { CMC_URL, formatProsCard, loadProsMarket, renderPriceChart } from "./pros.js";
import { scanAlerts } from "./alerts.js";
import { inspectTx } from "./support.js";
import { isTxHash } from "./revert.js";

const LANG_FILE = path.join(process.cwd(), "data", "bot-lang.json");
const OFFSET_FILE = path.join(process.cwd(), "data", "telegram-offset.json");

const UI = {
  en: {
    help: ["Send a command. The bot asks for whatever is missing.", "/price  then a number, for example 0.62, then above or below", "/pros  price, market cap and FDV", "/transfer  then USDC 50", "/call", "/list  saved alerts, with each price", "/lang  to change language"].join("\n"),
    listTitle: "Saved alerts",
    priceTitle: (n) => `Price alerts (${n})`,
    otherTitle: "Other alerts",
    priceLine: (n, side, price) => `${n}. ${side} ${price} USDC`,
    listEmpty: "No alerts saved yet.",
    listPrice: (side, price) => `price: WPROS ${side} ${price} USDC`,
    listTransfer: (token, min) => `transfer: ${token} from ${min}`,
    listCall: "call: FaroSwap router",
    edit: "Edit",
    cancel: "Cancel",
    missing: (id) => `Alert ${id} was not found.`,
    editAsk: (id) => `Alert ${id}. Send the new price, for example 0.70`,
    cancelled: (id) => `Alert ${id} cancelled.`,
    askPrice: "WPROS price in USDC?\nSend the number, for example 0.62",
    askTransfer: "Large transfer.\nSend the token and the minimum. Example: USDC 50",
    askSupport: "Paste the transaction hash (0x and 64 hex characters).\nI will say if it failed, and why.",
    scanning: "Scanning…",
    quiet: "Nothing new.",
    langSet: "English is on.",
    askLang: "Choose a language.",
    above: "above",
    below: "below",
    side: (price) => [`Line ${price} USDC.`, "above = alert if the price rises through this line.", "below = alert if the price falls through this line.", "", "Tap a button or type above or below."].join("\n"),
    saved: (price, side, spot, hot) => [`Alert saved: ${side} ${price} USDC.`, `WPROS is ${spot} now.`, hot ? "It is already on that side, so the alert fires now." : "I will message this chat when the price crosses that line."].join("\n"),
    fired: (spot, side, price) => `Alert: WPROS is ${spot} USDC, ${side} ${price}.`,
    savedTransfer: (token, min) => `Alert saved: ${token} transfers from ${min} up. New ones show up in this chat.`,
    savedCall: `Alert saved: calls on the FaroSwap router. New ones show up in this chat.`,
    menu: "Menu",
    already: (id, side, price) => `Alert ${id} is already ${side} ${price} USDC.`,
    failed: "I could not finish that. Try again.",
  },
  es: {
    help: ["Manda un comando. El bot pregunta lo que falte.", "/price  luego el número, por ejemplo 0.62, luego arriba o abajo", "/pros  precio, market cap y FDV", "/transfer  luego USDC 50", "/call", "/list  alertas guardadas, con cada precio", "/lang  para cambiar el idioma"].join("\n"),
    listTitle: "Alertas guardadas",
    priceTitle: (n) => `Alertas de precio (${n})`,
    otherTitle: "Otras alertas",
    priceLine: (n, side, price) => `${n}. ${side} de ${price} USDC`,
    listEmpty: "Todavía no hay alertas guardadas.",
    listPrice: (side, price) => `price: WPROS ${side} ${price} USDC`,
    listTransfer: (token, min) => `transfer: ${token} desde ${min}`,
    listCall: "call: router de FaroSwap",
    edit: "Editar",
    cancel: "Cancelar",
    missing: (id) => `No encontré la alerta ${id}.`,
    editAsk: (id) => `Alerta ${id}. Manda el precio nuevo, por ejemplo 0.70`,
    cancelled: (id) => `Alerta ${id} cancelada.`,
    askPrice: "¿Precio de WPROS en USDC?\nManda el número, por ejemplo 0.62",
    askTransfer: "Transferencia grande.\nManda el token y el mínimo. Ejemplo: USDC 50",
    askSupport: "Pega el hash de la transacción (0x y 64 hex).\nDiré si falló, y por qué.",
    scanning: "Buscando…",
    quiet: "Nada nuevo.",
    langSet: "Español activado.",
    askLang: "Elige un idioma.",
    above: "arriba",
    below: "abajo",
    side: (price) => [`Línea ${price} USDC.`, "arriba = avisa si el precio sube y pasa esta línea.", "abajo = avisa si el precio baja y pasa esta línea.", "", "Toca un botón o escribe arriba o abajo."].join("\n"),
    saved: (price, side, spot, hot) => [`Alerta guardada: ${side} ${price} USDC.`, `WPROS está en ${spot} ahora.`, hot ? "Ya está de ese lado, así que la alerta sale ahora." : "Avisaré en este chat cuando el precio cruce esa línea."].join("\n"),
    fired: (spot, side, price) => `Alerta: WPROS está en ${spot} USDC, ${side} ${price}.`,
    savedTransfer: (token, min) => `Alerta guardada: transferencias de ${token} desde ${min}. Las nuevas aparecen en este chat.`,
    savedCall: `Alerta guardada: llamadas al router de FaroSwap. Las nuevas aparecen en este chat.`,
    menu: "Menu",
    already: (id, side, price) => `La alerta ${id} ya es ${side} de ${price} USDC.`,
    failed: "No pude terminar eso. Inténtalo de nuevo.",
  },
  pt: {
    help: ["Manda um comando. O bot pergunta o que faltar.", "/price  depois o número, por exemplo 0.62, depois acima ou abaixo", "/pros  preço, market cap e FDV", "/transfer  depois USDC 50", "/call", "/list  alertas gravados, com cada preço", "/lang  para trocar o idioma"].join("\n"),
    listTitle: "Alertas gravados",
    priceTitle: (n) => `Alertas de preço (${n})`,
    otherTitle: "Outros alertas",
    priceLine: (n, side, price) => `${n}. ${side} de ${price} USDC`,
    listEmpty: "Nenhum alerta gravado ainda.",
    listPrice: (side, price) => `price: WPROS ${side} ${price} USDC`,
    listTransfer: (token, min) => `transfer: ${token} a partir de ${min}`,
    listCall: "call: router do FaroSwap",
    edit: "Editar",
    cancel: "Cancelar",
    missing: (id) => `Não achei o alerta ${id}.`,
    editAsk: (id) => `Alerta ${id}. Manda o preço novo, por exemplo 0.70`,
    cancelled: (id) => `Alerta ${id} cancelado.`,
    askPrice: "Qual o preço do WPROS em USDC?\nManda o número, por exemplo 0.62",
    askTransfer: "Transferência grande.\nManda o token e o mínimo. Exemplo: USDC 50",
    askSupport: "Cola o hash da transação (0x e 64 hex).\nEu digo se falhou, e por quê.",
    scanning: "Varrendo…",
    quiet: "Nada novo.",
    langSet: "Português ligado.",
    askLang: "Escolhe o idioma.",
    above: "acima",
    below: "abaixo",
    side: (price) => [`Linha ${price} USDC.`, "acima = avisa se o preço subir e passar dessa linha.", "abaixo = avisa se o preço cair e passar dessa linha.", "", "Toca um botão ou escreve acima ou abaixo."].join("\n"),
    saved: (price, side, spot, hot) => [`Alerta gravado: ${side} ${price} USDC.`, `O WPROS está em ${spot} agora.`, hot ? "Já está desse lado, então o alerta sai agora." : "Vou avisar neste chat quando o preço cruzar essa linha."].join("\n"),
    fired: (spot, side, price) => `Alerta: o WPROS está em ${spot} USDC, ${side} ${price}.`,
    savedTransfer: (token, min) => `Alerta gravado: transferências de ${token} a partir de ${min}. As novas aparecem neste chat.`,
    savedCall: `Alerta gravado: chamadas no router do FaroSwap. As novas aparecem neste chat.`,
    menu: "Menu",
    already: (id, side, price) => `O alerta ${id} já é ${side} de ${price} USDC.`,
    failed: "Não consegui terminar isso. Tenta de novo.",
  },
};

function ui(lang) {
  return UI[lang] || UI.pt;
}

const LANG_WORDS = {
  english: "en", en: "en", ingles: "en", inglês: "en",
  espanol: "es", español: "es", spanish: "es", es: "es",
  portugues: "pt", português: "pt", portuguese: "pt", pt: "pt",
};

export function parseLangChoice(text) {
  const raw = String(text || "").trim().toLowerCase();
  const cmd = raw.split(/\s+/)[0].split("@")[0];
  if (cmd === "/lang" || cmd === "/language" || cmd === "/idioma") return { kind: "ask-lang" };
  const word = raw.replace(/^\//, "");
  if (LANG_WORDS[word]) return { kind: "set-lang", lang: LANG_WORDS[word] };
  return null;
}

const SIDE_KEYS = {
  above: "above",
  acima: "above",
  up: "above",
  over: "above",
  sobe: "above",
  arriba: "above",
  encima: "above",
  below: "below",
  abaixo: "below",
  under: "below",
  down: "below",
  cai: "below",
  abajo: "below",
  debajo: "below",
};

function sideKeyboard(lang) {
  const copy = ui(lang);
  return {
    keyboard: [[{ text: copy.above }, { text: copy.below }], ...menuKeyboard().keyboard],
    resize_keyboard: true,
  };
}

const LANG_KEYBOARD = {
  keyboard: [[{ text: "English" }, { text: "Español" }, { text: "Português" }]],
  resize_keyboard: true,
};

function menuKeyboard() {
  return {
    keyboard: [
      [{ text: "/price" }, { text: "/pros" }, { text: "/list" }],
      [{ text: "/transfer" }, { text: "/call" }, { text: "/support" }],
      [{ text: "Menu" }],
      [{ text: "English" }, { text: "Español" }, { text: "Português" }],
    ],
    resize_keyboard: true,
  };
}

const HOME_WORDS = new Set(["menu", "inicio", "início", "home", "voltar", "start"]);

export function parseHome(text) {
  const word = String(text || "").trim().toLowerCase().split(/\s+/)[0].replace(/^\//, "");
  return HOME_WORDS.has(word) ? { kind: "help" } : null;
}

export function formatWatchList(watches, lang = "pt") {
  const copy = ui(lang);
  const mine = (watches || []).filter((item) => item && item.mode);
  if (!mine.length) return `${copy.listTitle}\n${copy.listEmpty}`;
  const prices = mine.filter((item) => item.mode === "price");
  const rest = mine.filter((item) => item.mode !== "price");
  const lines = [copy.priceTitle(prices.length)];
  if (!prices.length) lines.push(copy.listEmpty);
  prices.forEach((item, index) => {
    const sideName = item.side === "below" ? copy.below : copy.above;
    lines.push(copy.priceLine(item.id || index + 1, sideName, item.threshold));
  });
  if (rest.length) {
    lines.push("", copy.otherTitle);
    for (const item of rest) {
      const n = item.id || "";
      if (item.mode === "transfer") lines.push(`${n}. ${copy.listTransfer(item.token || "USDC", item.min || "50")}`);
      else lines.push(`${n}. ${copy.listCall}`);
    }
  }
  return lines.join("\n");
}

export function parseSide(word) {
  return SIDE_KEYS[String(word || "").toLowerCase()] || null;
}

function numberIn(parts) {
  const raw = parts.find((part) => /^\d+([.,]\d+)?$/.test(part));
  return raw ? raw.replace(",", ".") : "";
}

export function parseTelegramCommand(text) {
  const parts = String(text || "").trim().split(/\s+/).filter(Boolean);
  const cmd = (parts[0] || "").split("@")[0].toLowerCase();
  if (!cmd.startsWith("/")) return null;
  if (cmd === "/start" || cmd === "/help" || cmd === "/menu") return { kind: "help" };
  if (cmd === "/list" || cmd === "/alerts" || cmd === "/lista" || cmd === "/alertas") return { kind: "list" };
  if (cmd === "/cancel" || cmd === "/apagar" || cmd === "/delete") return parts[1] ? { kind: "cancel", id: Number(parts[1]) } : { kind: "list" };
  if (cmd === "/edit" || cmd === "/editar") return parts[1] ? { kind: "edit", id: Number(parts[1]) } : { kind: "list" };
  if (cmd === "/pros" || cmd === "/mkt" || cmd === "/fdv" || cmd === "/market") return { kind: "pros" };
  if (cmd === "/support" || cmd === "/tx" || cmd === "/suporte") {
    const hash = parts.find((part) => isTxHash(part));
    return hash ? { kind: "support", hash } : { kind: "ask-support" };
  }
  if (cmd === "/transfer") {
    if (parts.length === 1) return { kind: "ask-transfer" };
    const token = /^\d+([.,]\d+)?$/.test(parts[1] || "") ? "USDC" : parts[1];
    return { kind: "scan", mode: "transfer", token, min: numberIn(parts.slice(1)) || "50" };
  }
  if (cmd === "/price") {
    const price = numberIn(parts.slice(1));
    const side = parts.map(parseSide).find(Boolean) || null;
    if (!price) return { kind: "ask-price" };
    if (!side) return { kind: "ask-side", price };
    return { kind: "scan", mode: "price", price, side };
  }
  if (cmd === "/call") return { kind: "scan", mode: "call", contract: parts[1] || "", selector: parts[2] || "" };
  return { kind: "unknown" };
}

/** The next plain message after the bot asked for a price, a side, or a transfer. */
export function parseFollowUp(text, waiting) {
  const raw = String(text || "").trim();
  if (!waiting || !raw || raw.startsWith("/")) return null;
  const parts = raw.split(/\s+/);
  if (waiting.step === "edit" || waiting.step === "price") {
    const price = numberIn(parts);
    if (!price) return null;
    const side = parts.map(parseSide).find(Boolean) || null;
    if (!side) return { kind: "ask-side", price, editId: waiting.id };
    return { kind: "scan", mode: "price", price, side, editId: waiting.id };
  }
  if (waiting.step === "side") {
    const side = parseSide(parts[0]);
    if (!side) return null;
    return { kind: "scan", mode: "price", price: waiting.price, side, editId: waiting.editId };
  }
  if (waiting.step === "support") {
    const hash = parts.find((part) => isTxHash(part));
    return hash ? { kind: "support", hash } : null;
  }
  if (waiting.step === "transfer") {
    const token = /^\d+([.,]\d+)?$/.test(parts[0] || "") ? "USDC" : parts[0];
    return { kind: "scan", mode: "transfer", token, min: numberIn(parts) || "50" };
  }
  return null;
}

export function parsePriceFollowUp(text) {
  return parseFollowUp(text, { step: "price" });
}

export function scanReply(report, fresh, lang = "pt") {
  const lines = [report.headline];
  if (!fresh.length) lines.push(ui(lang).quiet);
  for (const alert of fresh) lines.push("", alert.line, alert.value ? `value ${alert.value}` : "", alert.link);
  return lines.filter((line) => line !== undefined && line !== null).join("\n").slice(0, 3900);
}

function sidePrompt(price, lang) {
  return ui(lang).side(price);
}

async function sendPhoto(token, chatId, png, caption, fetchImpl, markup) {
  const boundary = `pharos${Date.now()}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="reply_markup"\r\n\r\n${JSON.stringify(markup)}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="pros.png"\r\nContent-Type: image/png\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat([head, png, tail]),
  });
  if (!res.ok) throw new Error(`photo ${res.status}`);
}

async function send(token, chatId, text, fetchImpl, markup = menuKeyboard()) {
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      reply_markup: markup,
    }),
  });
  if (!res.ok) throw new Error(`notify ${res.status}`);
}

export async function publishTelegramCommands(env = process.env, fetchImpl = globalThis.fetch) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetchImpl(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "price", description: "WPROS line. Then a number, then above or below" },
        { command: "pros", description: "PROS price, market cap and FDV" },
        { command: "transfer", description: "Large transfer. Then USDC 50" },
        { command: "call", description: "Contract call" },
        { command: "support", description: "Why a transaction failed" },
        { command: "list", description: "Show saved alerts" },
        { command: "lang", description: "English, Español, Português" },
        { command: "help", description: "How to type it" },
      ],
    }),
  });
}

const waiting = new Map();

const INTRO = [
  "Pharos Alerts",
  "",
  "I am Pharos Alerts, a read-only bot for the Pharos Pacific chain. I watch the chain and message this chat. I never move funds.",
  "",
  "What I do",
  "Price. Send /price, a number such as 0.62, then above or below. Save as many lines as you want.",
  "List. /list shows every saved price, with Edit and Cancel.",
  "Market. /pros sends the PROS card from CoinMarketCap: chart, price, volume, market cap, FDV and supply.",
  "Transfer. /transfer, then USDC 50, for a new large transfer.",
  "Call. /call for a new call on the FaroSwap router.",
  "Support. /support, then a transaction hash, explains why it failed.",
  "",
  "Menu brings you back to this introduction.",
  "English, Español and Português change the language of the other messages.",
].join("\n");

export async function publishTelegramProfile(env = process.env, fetchImpl = globalThis.fetch) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const description = "I am Pharos Alerts, a read-only bot for the Pharos Pacific chain. I message this chat when WPROS crosses a price you save, when a large transfer lands, or when someone calls the FaroSwap router.";
  await fetchImpl(`https://api.telegram.org/bot${token}/setMyDescription`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description }),
  });
  await fetchImpl(`https://api.telegram.org/bot${token}/setMyShortDescription`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ short_description: "Pharos Alerts. Price, transfer and call alerts for Pharos Pacific." }),
  });
}

export async function pushMenu(env = process.env, fetchImpl = globalThis.fetch) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await send(token, chatId, INTRO, fetchImpl, menuKeyboard());
}

/** Keep saved price alerts alive. One message while the price stays on the chosen side. */
export async function checkPriceWatches(env = process.env, fetchImpl = globalThis.fetch) {
  const token = env.TELEGRAM_BOT_TOKEN;
  await ensureIds();
  const watches = await loadWatches();
  if (!token || !watches.length) return;
  const client = await getSharedClient(CHAIN_MCP_URL).catch((error) => {
    resetSharedClient(CHAIN_MCP_URL);
    throw error;
  });
  const patches = [];
  const pending = watches.filter((item) => item.mode === "price");
  if (pending.length) {
    try {
      const report = await scanAlerts(client, { mode: "price", price: "999999", side: "above", lang: "en", api: true });
      if (report.price != null) {
        for (const watch of pending) {
          const before = Boolean(watch.latched);
          const hot = priceIsHot(report.price, watch.threshold, watch.side);
          if (hot && !before) {
            const lang = watch.lang || "pt";
            const spot = report.price.toFixed(6);
            const sideName = watch.side === "below" ? ui(lang).below : ui(lang).above;
            const link = `https://www.pharosscan.xyz/address/${report.pool}`;
            await send(token, watch.chatId, `${ui(lang).fired(spot, sideName, watch.threshold)}\n${link}`, fetchImpl);
            patches.push({ id: watch.id, latched: true });
          } else if (!hot && before) {
            patches.push({ id: watch.id, latched: false });
          }
        }
      }
    } catch {
      resetSharedClient(CHAIN_MCP_URL);
    }
  }
  for (const watch of watches.filter((item) => item.mode === "transfer" || item.mode === "call")) {
    try {
      const { report, fresh, seen, activePrice } = await runTrackedScan(client, {
        mode: watch.mode,
        token: watch.token,
        min: watch.min,
        contract: watch.contract,
        selector: watch.selector,
        lang: watch.lang || "pt",
        lookback: "200",
        silent: true,
      });
      const since = Number(watch.sinceBlock) || 0;
      if (!since) {
        patches.push({ id: watch.id, sinceBlock: report.toBlock || 0 });
        continue;
      }
      const newer = fresh.filter((alert) => Number(alert.block) > since).sort((a, b) => a.block - b.block).slice(0, 3);
      if (!newer.length) continue;
      for (const alert of newer) {
        const text = [alert.line, alert.value, alert.link].filter(Boolean).join("\n");
        await send(token, watch.chatId, text, fetchImpl, menuKeyboard());
      }
      await saveSeen(remember(seen, newer, activePrice));
      patches.push({ id: watch.id, sinceBlock: Math.max(since, ...newer.map((alert) => Number(alert.block) || 0)) });
    } catch {
      resetSharedClient(CHAIN_MCP_URL);
    }
  }
  if (patches.length) await patchWatches(patches);
}

async function sendList(token, chatId, lang, fetchImpl) {
  const mine = (await ensureIds()).filter((item) => String(item.chatId) === String(chatId));
  const markup = mine.length
    ? { inline_keyboard: mine.map((item) => {
      const name = item.mode === "price" ? `${item.id} · ${item.threshold}` : item.id;
      const row = [{ text: `${ui(lang).cancel} ${name}`, callback_data: `cancel:${item.id}` }];
      if (item.mode === "price") row.unshift({ text: `${ui(lang).edit} ${item.id} · ${item.threshold}`, callback_data: `edit:${item.id}` });
      return row;
    }).concat([[{ text: ui(lang).menu, callback_data: "home" }]]) }
    : menuKeyboard();
  await send(token, chatId, formatWatchList(mine, lang), fetchImpl, markup);
}

async function readLangs() {
  const langs = (await readState()).langs;
  return langs && typeof langs === "object" ? langs : {};
}

async function writeLang(langs, chatId, lang) {
  langs[String(chatId)] = lang;
  await updateState((bag) => {
    bag.langs = langs;
  });
}

/** Read Telegram commands and run the same scan as the site. */
export async function handleTelegramUpdates(env = process.env, fetchImpl = globalThis.fetch, presetUpdates = null) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return { handled: 0 };
  const base = `https://api.telegram.org/bot${token}`;
  let updates = presetUpdates;
  if (!updates) {
    const offset = await readOffset();
    const res = await fetchImpl(`${base}/getUpdates?timeout=0${offset ? `&offset=${offset}` : ""}`);
    const data = await res.json();
    updates = Array.isArray(data.result) ? data.result : [];
  }
  const langs = await readLangs();
  let handled = 0;
  let maxId = 0;
  for (const update of updates) {
    if (update.update_id > maxId) maxId = update.update_id;
    if (update.callback_query) {
      const query = update.callback_query;
      const chatId = query.message?.chat?.id;
      if (chatId) {
        const key = String(chatId);
        const lang = langs[key] || "pt";
        await fetchImpl(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ callback_query_id: query.id }),
        });
        const [action, idRaw] = String(query.data || "").split(":");
        const id = Number(idRaw);
        if (action === "home") {
          waiting.delete(key);
      await send(token, chatId, INTRO, fetchImpl, menuKeyboard());
      handled++;
      continue;
    }
    if (action === "cancel") {
          const gone = await removeWatch(chatId, id);
          await send(token, chatId, gone ? ui(lang).cancelled(id) : ui(lang).missing(id), fetchImpl);
          if (gone) await sendList(token, chatId, lang, fetchImpl);
        } else if (action === "edit") {
          const mine = (await ensureIds()).find((item) => String(item.chatId) === key && Number(item.id) === id && item.mode === "price");
          if (!mine) await send(token, chatId, ui(lang).missing(id), fetchImpl);
          else {
            waiting.set(key, { step: "edit", id });
            await send(token, chatId, ui(lang).editAsk(id), fetchImpl);
          }
        }
      }
      handled++;
      continue;
    }
    const message = update.message;
    if (!message?.chat?.id) continue;
    const chatId = message.chat.id;
    const key = String(chatId);
    const lang = langs[key] || "pt";
    const text = message.text || "";
    let parsed = parseLangChoice(text);
    if (!parsed) parsed = parseTelegramCommand(text);
    if (!parsed) parsed = parseHome(text);
    if (!parsed) parsed = parseFollowUp(text, waiting.get(key));
    if (!parsed && isTxHash(text.trim())) parsed = { kind: "support", hash: text.trim() };
    if (!parsed) continue;
    if (parsed.kind === "ask-lang") {
      await send(token, chatId, `${ui("en").askLang}\n${ui("es").askLang}\n${ui("pt").askLang}`, fetchImpl, LANG_KEYBOARD);
      handled++;
      continue;
    }
    if (parsed.kind === "set-lang") {
      await writeLang(langs, key, parsed.lang);
      waiting.delete(key);
      await send(token, chatId, `${ui(parsed.lang).langSet}\n\n${INTRO}`, fetchImpl, menuKeyboard(parsed.lang));
      handled++;
      continue;
    }
    if (parsed.kind === "list") {
      await sendList(token, chatId, lang, fetchImpl);
      handled++;
      continue;
    }
    if (parsed.kind === "cancel") {
      const gone = await removeWatch(chatId, parsed.id);
      await send(token, chatId, gone ? ui(lang).cancelled(parsed.id) : ui(lang).missing(parsed.id), fetchImpl);
      if (gone) await sendList(token, chatId, lang, fetchImpl);
      handled++;
      continue;
    }
    if (parsed.kind === "edit") {
      const mine = (await ensureIds()).find((item) => String(item.chatId) === key && Number(item.id) === Number(parsed.id) && item.mode === "price");
      if (!mine) {
        await send(token, chatId, ui(lang).missing(parsed.id), fetchImpl);
      } else {
        waiting.set(key, { step: "edit", id: parsed.id });
        await send(token, chatId, ui(lang).editAsk(parsed.id), fetchImpl);
      }
      handled++;
      continue;
    }
    if (parsed.kind === "pros") {
      waiting.delete(key);
      await send(token, chatId, ui(lang).scanning, fetchImpl);
      try {
        const data = await loadProsMarket(fetchImpl);
        const caption = formatProsCard(data, lang);
        const button = { inline_keyboard: [[{ text: "CoinMarketCap", url: data.url || CMC_URL }], [{ text: ui(lang).menu, callback_data: "home" }]] };
        const png = renderPriceChart(data.points);
        if (png) await sendPhoto(token, chatId, png, caption, fetchImpl, button);
        else await send(token, chatId, caption, fetchImpl, button);
      } catch (error) {
        await send(token, chatId, ui(lang).failed, fetchImpl);
      }
      handled++;
      continue;
    }
    if (parsed.kind === "help") {
      waiting.delete(key);
      await send(token, chatId, INTRO, fetchImpl, menuKeyboard());
      handled++;
      continue;
    }
    if (parsed.kind === "ask-price") {
      waiting.set(key, { step: "price" });
      await send(token, chatId, ui(lang).askPrice, fetchImpl);
      handled++;
      continue;
    }
    if (parsed.kind === "ask-side") {
      waiting.set(key, { step: "side", price: parsed.price, editId: parsed.editId });
      await send(token, chatId, sidePrompt(parsed.price, lang), fetchImpl, sideKeyboard(lang));
      handled++;
      continue;
    }
    if (parsed.kind === "ask-support") {
      waiting.set(key, { step: "support" });
      await send(token, chatId, ui(lang).askSupport, fetchImpl);
      handled++;
      continue;
    }
    if (parsed.kind === "support") {
      waiting.delete(key);
      await send(token, chatId, ui(lang).scanning, fetchImpl);
      try {
        const client = await getSharedClient(CHAIN_MCP_URL);
        const report = await inspectTx(client, parsed.hash, lang);
        await send(token, chatId, [report.headline, ...report.lines, report.link].filter(Boolean).join("\n"), fetchImpl);
      } catch (error) {
        resetSharedClient(CHAIN_MCP_URL);
        await send(token, chatId, error.status === 400 ? error.message : ui(lang).failed, fetchImpl);
      }
      handled++;
      continue;
    }
    if (parsed.kind === "ask-transfer") {
      waiting.set(key, { step: "transfer" });
      await send(token, chatId, ui(lang).askTransfer, fetchImpl);
      handled++;
      continue;
    }
    if (parsed.kind === "unknown") {
      await send(token, chatId, INTRO, fetchImpl, menuKeyboard());
      handled++;
      continue;
    }
    waiting.delete(key);
    await send(token, chatId, ui(lang).scanning, fetchImpl);
    try {
      const client = await getSharedClient(CHAIN_MCP_URL);
      const { report, fresh, seen, activePrice } = await runTrackedScan(client, { ...parsed, lang, silent: true });
      if (parsed.mode === "price" && report.price != null) {
        const spot = report.price.toFixed(6);
        const hot = priceIsHot(report.price, report.threshold, report.side);
        const sideName = report.side === "below" ? ui(lang).below : ui(lang).above;
        const same = parsed.editId ? null : (await loadWatches()).find((item) => String(item.chatId) === key && item.mode === "price" && item.side === report.side && Number(item.threshold) === Number(report.threshold));
        const saved = same
          ? same
          : parsed.editId
            ? await updatePriceWatch(chatId, parsed.editId, { threshold: report.threshold, side: report.side, latched: hot, lang })
            : await addWatch({ chatId, lang, mode: "price", threshold: report.threshold, side: report.side, latched: hot, sinceBlock: report.toBlock || 0 });
        if (!saved) {
          await send(token, chatId, ui(lang).missing(parsed.editId), fetchImpl);
        } else {
          const link = `https://www.pharosscan.xyz/address/${report.pool}`;
          const text = same
            ? ui(lang).already(saved.id, sideName, report.threshold)
            : hot
              ? `${saved.id}. ${ui(lang).saved(report.threshold, sideName, spot, true)}\n\n${ui(lang).fired(spot, sideName, report.threshold)}\n${link}`
              : `${saved.id}. ${ui(lang).saved(report.threshold, sideName, spot, false)}`;
          await send(token, chatId, text, fetchImpl);
        }
      } else if (parsed.mode === "transfer" || parsed.mode === "call") {
        await upsertWatch({
          chatId,
          lang,
          mode: parsed.mode,
          token: report.token?.symbol || parsed.token || "USDC",
          min: report.min || parsed.min || "50",
          contract: report.contract || parsed.contract || "",
          selector: parsed.selector || "",
          sinceBlock: report.toBlock || 0,
        });
        const intro = parsed.mode === "transfer"
          ? ui(lang).savedTransfer(report.token?.symbol || parsed.token || "USDC", report.min || parsed.min || "50")
          : ui(lang).savedCall;
        await send(token, chatId, intro, fetchImpl);
      } else {
        await send(token, chatId, scanReply(report, fresh, lang), fetchImpl);
      }
      if (report.price != null) await saveLastPrice(report.price);
      if (fresh.length) await saveSeen(remember(seen, fresh, activePrice));
    } catch (error) {
      resetSharedClient(CHAIN_MCP_URL);
      await send(token, chatId, error.status === 400 ? error.message : ui(lang).failed, fetchImpl);
    }
    handled++;
  }
  if (!presetUpdates && maxId) {
    await fetchImpl(`${base}/getUpdates?offset=${maxId + 1}&timeout=0`);
    await writeOffset(maxId + 1);
  }
  return { handled };
}

async function readOffset() {
  try {
    return Number(JSON.parse(await readFile(OFFSET_FILE, "utf8"))) || 0;
  } catch {
    return 0;
  }
}

async function writeOffset(value) {
  await mkdir(path.dirname(OFFSET_FILE), { recursive: true });
  await writeFile(OFFSET_FILE, JSON.stringify(value));
}
