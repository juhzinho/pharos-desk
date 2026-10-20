import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";

const FILE = path.join(process.cwd(), "data", "bot-state.json");
const PATHNAME = "state/bot.json";

function empty() {
  return { rev: 0, watches: [], langs: {}, seen: [], price: null };
}

let tail = Promise.resolve();

function locked(fn) {
  const run = tail.then(fn, fn);
  tail = run.then(() => undefined, () => undefined);
  return run;
}

async function readLocal() {
  try {
    return { ...empty(), ...JSON.parse(await readFile(FILE, "utf8")) };
  } catch {
    return empty();
  }
}

async function readBlob() {
  const result = await get(PATHNAME, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return empty();
  const text = await new Response(result.stream).text();
  return { ...empty(), ...JSON.parse(text) };
}

async function writeLocal(bag) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(bag));
}

async function writeBlob(bag) {
  await put(PATHNAME, JSON.stringify(bag), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

const cloud = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export function updateState(mutator) {
  return locked(async () => {
    const bag = cloud() ? await readBlob() : await readLocal();
    const result = await mutator(bag);
    bag.rev = Number(bag.rev) || 0;
    bag.rev += 1;
    if (cloud()) await writeBlob(bag);
    else await writeLocal(bag);
    return result === undefined ? bag : result;
  });
}

export async function readState() {
  return locked(async () => (cloud() ? readBlob() : readLocal()));
}
