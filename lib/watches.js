import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { priceCrossed } from "./alerts.js";

const FILE = path.join(process.cwd(), "data", "bot-watches.json");

export async function loadWatches() {
  try {
    const raw = JSON.parse(await readFile(FILE, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function stampIds(rows) {
  let max = rows.reduce((top, item) => Math.max(top, Number(item.id) || 0), 0);
  return rows.map((item) => {
    if (item.id) return item;
    max += 1;
    return { ...item, id: max };
  });
}

let tail = Promise.resolve();

/** Load, edit and save as one step, so a poll cannot overwrite a newer list. */
export function withWatches(mutator) {
  const run = tail.then(async () => {
    const list = stampIds(await loadWatches());
    const result = await mutator(list);
    await saveWatches(list);
    return result === undefined ? list : result;
  });
  tail = run.then(() => undefined, () => undefined);
  return run;
}

export async function ensureIds() {
  return withWatches((list) => list.map((item) => ({ ...item })));
}

export async function saveWatches(list) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(list));
}

export async function addWatch(watch) {
  return withWatches((list) => {
    const id = list.reduce((top, item) => Math.max(top, Number(item.id) || 0), 0) + 1;
    const row = watchRow({ ...watch, id });
    list.push(row);
    return row;
  });
}

export async function removeWatch(chatId, id) {
  return withWatches((list) => {
    const before = list.length;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const item = list[i];
      if (String(item.chatId) === String(chatId) && Number(item.id) === Number(id)) list.splice(i, 1);
    }
    return list.length !== before;
  });
}

export async function updatePriceWatch(chatId, id, fields) {
  return withWatches((list) => {
    const item = list.find((row) => String(row.chatId) === String(chatId) && Number(row.id) === Number(id) && row.mode === "price");
    if (!item) return null;
    item.threshold = Number(fields.threshold);
    item.side = fields.side === "below" ? "below" : "above";
    item.latched = Boolean(fields.latched);
    if (fields.lang) item.lang = fields.lang;
    return item;
  });
}

export async function patchWatches(patches) {
  return withWatches((list) => {
    for (const patch of patches) {
      const item = list.find((row) => Number(row.id) === Number(patch.id));
      if (!item) continue;
      if (patch.latched !== undefined) item.latched = patch.latched;
      if (patch.sinceBlock !== undefined) item.sinceBlock = patch.sinceBlock;
    }
  });
}

function watchRow(watch) {
  return {
    id: Number(watch.id) || undefined,
    mode: watch.mode,
    chatId: String(watch.chatId),
    lang: watch.lang || "pt",
    token: watch.token || "USDC",
    min: watch.min || "50",
    contract: watch.contract || "",
    selector: watch.selector || "",
    threshold: Number(watch.threshold),
    side: watch.side === "below" ? "below" : "above",
    latched: Boolean(watch.latched),
    sinceBlock: Number(watch.sinceBlock) || 0,
  };
}

export async function upsertWatch(watch) {
  return withWatches((list) => {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const item = list[i];
      if (String(item.chatId) === String(watch.chatId) && item.mode === watch.mode) list.splice(i, 1);
    }
    const id = Number(watch.id) || list.reduce((top, item) => Math.max(top, Number(item.id) || 0), 0) + 1;
    const row = watchRow({ ...watch, id });
    list.push(row);
    return row;
  });
}

export async function upsertPriceWatch(watch) {
  return upsertWatch({ ...watch, mode: "price" });
}

export function priceIsHot(spot, threshold, side) {
  return priceCrossed(Number(spot), Number(threshold), side);
}
