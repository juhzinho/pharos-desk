import { readBody } from "./_util.js";
import { applyEnvFile } from "../lib/notify.js";
import { handleTelegramUpdates } from "../lib/telegram.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 200;
    res.end("ok");
    return;
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    res.statusCode = 401;
    res.end("no");
    return;
  }
  await applyEnvFile(new URL("../.env", import.meta.url));
  try {
    const update = await readBody(req);
    await handleTelegramUpdates(process.env, globalThis.fetch, [update]);
    res.statusCode = 200;
    res.end("ok");
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end("fail");
  }
}
