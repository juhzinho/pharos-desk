import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { put } from "@vercel/blob";
import { loadDotEnv } from "../lib/notify.js";

const envFile = loadDotEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
const localFile = loadDotEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8").catch(() => ""));
const env = { ...envFile, ...localFile };
for (const [key, value] of Object.entries(env)) process.env[key] = value;

if (!env.TELEGRAM_WEBHOOK_SECRET) env.TELEGRAM_WEBHOOK_SECRET = randomBytes(24).toString("hex");
if (!env.CRON_SECRET) env.CRON_SECRET = randomBytes(24).toString("hex");

const lines = [
  `BLOB_READ_WRITE_TOKEN=${env.BLOB_READ_WRITE_TOKEN}`,
  `TELEGRAM_WEBHOOK_SECRET=${env.TELEGRAM_WEBHOOK_SECRET}`,
  `CRON_SECRET=${env.CRON_SECRET}`,
];
await writeFile(new URL("../.env.local", import.meta.url), `${lines.join("\n")}\n`);

async function readJson(name, fallback) {
  try {
    return JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"));
  } catch {
    return fallback;
  }
}

const watches = await readJson("bot-watches.json", []);
const langs = await readJson("bot-lang.json", {});
const seen = await readJson("alert-seen.json", []);
const priceFile = await readJson("last-price.json", {});
const bag = {
  rev: 1,
  watches: Array.isArray(watches) ? watches : [],
  langs: langs && typeof langs === "object" ? langs : {},
  seen: Array.isArray(seen) ? seen : [],
  price: Number.isFinite(Number(priceFile.price)) ? Number(priceFile.price) : null,
};
await put("state/bot.json", JSON.stringify(bag), {
  access: "private",
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: "application/json",
});

function addEnv(name, value) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["vercel", "env", "add", name, "--environment", "production", "--sensitive", "--force", "--yes"], {
      shell: true,
      stdio: ["pipe", "ignore", "pipe"],
    });
    child.stderr.on("data", () => {});
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${name} ${code}`))));
    child.stdin.write(value);
    child.stdin.end();
  });
}

await addEnv("TELEGRAM_BOT_TOKEN", env.TELEGRAM_BOT_TOKEN);
await addEnv("TELEGRAM_CHAT_ID", env.TELEGRAM_CHAT_ID);
await addEnv("TELEGRAM_WEBHOOK_SECRET", env.TELEGRAM_WEBHOOK_SECRET);
await addEnv("CRON_SECRET", env.CRON_SECRET);

if (!envFile.BOT_RUNTIME) {
  const current = await readFile(new URL("../.env", import.meta.url), "utf8");
  await writeFile(new URL("../.env", import.meta.url), `${current.trim()}\nBOT_RUNTIME=cloud\n`);
}

if (process.argv.includes("--hook")) {
const hook = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: "https://pharos-desk.vercel.app/api/telegram",
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    drop_pending_updates: false,
  }),
});
if (!hook.ok) throw new Error(`webhook ${hook.status}`);
const hookBody = await hook.json();
if (!hookBody.ok) throw new Error("webhook rejected");
console.log("webhook on");
}
console.log(`state ${bag.watches.length} alerts`);
