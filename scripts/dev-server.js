import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import alerts from "../api/alerts.js";
import support from "../api/support.js";
import { applyEnvFile } from "../lib/notify.js";
import { checkPriceWatches, handleTelegramUpdates, publishTelegramCommands, publishTelegramProfile, pushMenu } from "../lib/telegram.js";

await applyEnvFile(new URL("../.env", import.meta.url));
await applyEnvFile(new URL("../.env.local", import.meta.url));
if (process.env.BOT_RUNTIME !== "cloud") {
  publishTelegramCommands().catch(() => {});
  publishTelegramProfile().catch(() => {});
  pushMenu().catch(() => {});
  let telegramBusy = false;
  setInterval(() => {
    if (telegramBusy) return;
    telegramBusy = true;
    handleTelegramUpdates().catch(() => {}).finally(() => { telegramBusy = false; });
  }, 4000);
  let watchBusy = false;
  const watchTick = () => {
    if (watchBusy) return;
    watchBusy = true;
    checkPriceWatches().catch(() => {}).finally(() => { watchBusy = false; });
  };
  watchTick();
  setInterval(watchTick, 30000);
}

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = fileURLToPath(new URL("../public/", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const ROUTES = { "/api/alerts": alerts, "/api/support": support };

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    if (ROUTES[pathname]) return ROUTES[pathname](req, res);
    const file = normalize(pathname === "/" ? "index.html" : pathname.slice(1));
    if (file.startsWith("..")) return res.writeHead(403).end();
    try {
      const body = await readFile(join(ROOT, file));
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}`));
