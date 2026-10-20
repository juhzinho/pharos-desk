import { applyEnvFile } from "../lib/notify.js";
import { checkPriceWatches } from "../lib/telegram.js";

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.statusCode = 401;
    res.end("no");
    return;
  }
  await applyEnvFile(new URL("../.env", import.meta.url));
  try {
    await checkPriceWatches();
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false }));
  }
}
