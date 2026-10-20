import { deflateSync, crc32 } from "node:zlib";

const DETAIL = "https://api.coinmarketcap.com/data-api/v3/cryptocurrency/detail?slug=pharos";
const CHART = "https://api.coinmarketcap.com/data-api/v3/cryptocurrency/detail/chart?id=39682&range=1D";
const ETH = "https://api.coinmarketcap.com/data-api/v3/cryptocurrency/detail?slug=ethereum";
export const CMC_URL = "https://coinmarketcap.com/pt-br/currencies/pharos/";

const HEADERS = { accept: "application/json", "user-agent": "pharos-desk" };

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sep(lang) {
  return lang === "en" ? { g: ",", d: "." } : { g: ".", d: "," };
}

function grouped(value, lang, digits) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const { g, d } = sep(lang);
  const sign = n < 0 ? "-" : "";
  const [whole, frac = ""] = Math.abs(n).toFixed(digits).split(".");
  const body = whole.replace(/\B(?=(\d{3})+(?!\d))/g, g);
  return sign + body + (digits ? d + frac : "");
}

function usd(value, lang, digits) {
  const text = grouped(value, lang, digits);
  if (text === "—") return text;
  return lang === "en" ? `$${text}` : `US$ ${text}`;
}

function pct(value, lang) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${grouped(n, lang, 2)}%`;
}

export function chartPoints(chart) {
  const raw = chart?.data?.points || chart?.points || {};
  const rows = Array.isArray(raw) ? raw : Object.values(raw);
  return rows.map((row) => {
    const v = row?.v || row?.c || [];
    return { usd: num(v[0]), btc: num(v[3]) };
  }).filter((point) => point.usd != null);
}

export function prosFromCmc(detail, extras = {}) {
  const data = detail?.data || detail || {};
  const stats = data.statistics || {};
  const points = chartPoints(extras.chart);
  const last = points.at(-1);
  const price = num(stats.price) ?? last?.usd ?? null;
  const ethUsd = num(extras.ethUsd);
  return {
    name: data.name || "Pharos",
    symbol: data.symbol || "PROS",
    price,
    priceBtc: last?.btc ?? null,
    priceEth: price != null && ethUsd ? price / ethUsd : null,
    change1h: num(stats.priceChangePercentage1h),
    change24h: num(stats.priceChangePercentage24h),
    change7d: num(stats.priceChangePercentage7d),
    volume: num(data.volume),
    marketCap: num(stats.marketCap),
    fdv: num(stats.fullyDilutedMarketCap),
    circulating: num(stats.circulatingSupply),
    total: num(stats.totalSupply),
    points: points.map((point) => point.usd),
    url: CMC_URL,
  };
}

export function formatProsCard(data, lang = "pt") {
  const btc = data.priceBtc == null ? "—" : `${grouped(data.priceBtc, lang, 8)} BTC`;
  const eth = data.priceEth == null ? "—" : `${grouped(data.priceEth, lang, 8)} ETH`;
  const lines = {
    pt: [
      `${data.name || "Pharos"} (${data.symbol || "PROS"})`,
      "CoinMarketCap · 24h",
      `Preço: ${usd(data.price, "pt", 6)}`,
      `Preço: ${btc}`,
      `Preço: ${eth}`,
      `Variação 1h: ${pct(data.change1h, "pt")}`,
      `Variação 24h: ${pct(data.change24h, "pt")}`,
      `Variação 7d: ${pct(data.change7d, "pt")}`,
      `Volume: ${usd(data.volume, "pt", 2)}`,
      `Market cap: ${usd(data.marketCap, "pt", 2)}`,
      `FDV: ${usd(data.fdv, "pt", 2)}`,
      `Em circulação: ${grouped(data.circulating, "pt", 0)} PROS`,
      `Supply total: ${grouped(data.total, "pt", 0)} PROS`,
    ],
    es: [
      `${data.name || "Pharos"} (${data.symbol || "PROS"})`,
      "CoinMarketCap · 24h",
      `Precio: ${usd(data.price, "es", 6)}`,
      `Precio: ${btc}`,
      `Precio: ${eth}`,
      `Cambio 1h: ${pct(data.change1h, "es")}`,
      `Cambio 24h: ${pct(data.change24h, "es")}`,
      `Cambio 7d: ${pct(data.change7d, "es")}`,
      `Volumen: ${usd(data.volume, "es", 2)}`,
      `Market cap: ${usd(data.marketCap, "es", 2)}`,
      `FDV: ${usd(data.fdv, "es", 2)}`,
      `En circulación: ${grouped(data.circulating, "es", 0)} PROS`,
      `Supply total: ${grouped(data.total, "es", 0)} PROS`,
    ],
    en: [
      `${data.name || "Pharos"} (${data.symbol || "PROS"})`,
      "CoinMarketCap · 24h",
      `Price: ${usd(data.price, "en", 6)}`,
      `Price: ${btc}`,
      `Price: ${eth}`,
      `1hr change: ${pct(data.change1h, "en")}`,
      `24hr change: ${pct(data.change24h, "en")}`,
      `7d change: ${pct(data.change7d, "en")}`,
      `Volume: ${usd(data.volume, "en", 2)}`,
      `Market cap: ${usd(data.marketCap, "en", 2)}`,
      `Fully diluted market cap: ${usd(data.fdv, "en", 2)}`,
      `Circulating supply: ${grouped(data.circulating, "en", 0)} PROS`,
      `Total supply: ${grouped(data.total, "en", 0)} PROS`,
    ],
  };
  return (lines[lang] || lines.pt).join("\n");
}

async function readJson(fetchImpl, url) {
  const res = await fetchImpl(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`coinmarketcap ${res.status}`);
  return res.json();
}

export async function loadProsMarket(fetchImpl = globalThis.fetch) {
  const [detail, chart, eth] = await Promise.all([
    readJson(fetchImpl, DETAIL),
    readJson(fetchImpl, CHART).catch(() => null),
    readJson(fetchImpl, ETH).catch(() => null),
  ]);
  return prosFromCmc(detail, { chart, ethUsd: eth?.data?.statistics?.price });
}

function pngChunk(type, data) {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([size, body, sum]);
}

export function renderPriceChart(points) {
  const values = (points || []).filter((value) => Number.isFinite(Number(value)));
  if (values.length < 2) return null;
  const width = 900;
  const height = 420;
  const pad = 28;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 0.01;
    max += 0.01;
  }
  const span = max - min;
  const raw = Buffer.alloc(height * (1 + width * 3));
  const set = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * (1 + width * 3) + 1 + x * 3;
    raw[i] = r;
    raw[i + 1] = g;
    raw[i + 2] = b;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) set(x, y, 13, 17, 28);
  }
  for (let step = 1; step <= 4; step += 1) {
    const y = Math.round(pad + ((height - pad * 2) * step) / 5);
    for (let x = pad; x < width - pad; x += 1) set(x, y, 36, 48, 68);
  }
  const coords = values.map((value, index) => {
    const x = pad + Math.round((index / (values.length - 1)) * (width - pad * 2));
    const y = pad + Math.round((1 - (value - min) / span) * (height - pad * 2));
    return [x, y];
  });
  for (let i = 1; i < coords.length; i += 1) {
    const [x0, y0] = coords[i - 1];
    const [x1, y1] = coords[i];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let step = 0; step <= steps; step += 1) {
      const x = Math.round(x0 + ((x1 - x0) * step) / steps);
      const y = Math.round(y0 + ((y1 - y0) * step) / steps);
      for (let fill = y; fill < height - pad; fill += 1) set(x, fill, 64, 24, 58);
      set(x, y, 255, 77, 166);
      set(x, y - 1, 255, 77, 166);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
