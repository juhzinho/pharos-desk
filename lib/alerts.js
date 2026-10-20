import { getAddress, parseUnits } from "viem";
import { fetchTransfers, latestBlock, logWindows, lookbackFrom, MAX_LOOKBACK, MAX_LOOKBACK_API } from "./transfers.js";
import { FAROSWAP_V3, PACIFIC, TOKEN_LIST } from "./tokens.js";
import { callJson } from "./mcp.js";
import { explorerAddress, explorerTx, formatAmount, labeled } from "./format.js";

const MIXSWAP = getAddress("0xA5cA5Fbe34e444F366B373170541ec6902b0F75c");
const POOL = FAROSWAP_V3.poolWprosUsdc100;
const SLOT0 = "0x3850c7bd";
const TOKEN0 = "0x0dfe1681";
const TOKEN1 = "0xd21220a7";

export function parseMode(input) {
  const mode = String(input || "transfer").toLowerCase();
  if (mode === "transfer" || mode === "price" || mode === "call") return mode;
  return { error: "bad-mode" };
}

export function decodeSlot0(hex) {
  const body = String(hex ?? "").replace(/^0x/i, "");
  if (body.length < 64) return null;
  try {
    return BigInt(`0x${body.slice(0, 64)}`);
  } catch {
    return null;
  }
}

export function decodeAddressWord(hex) {
  const body = String(hex ?? "").replace(/^0x/i, "");
  if (body.length < 64) return null;
  return getAddress(`0x${body.slice(24, 64)}`);
}

/** Human price of token1 per 1 token0. */
export function sqrtToPrice(sqrtPriceX96, dec0 = 18, dec1 = 6) {
  const sqrt = BigInt(sqrtPriceX96);
  const scale = 1_000_000n;
  const q = 1n << 192n;
  const shift = 10n ** BigInt(Math.abs(dec0 - dec1));
  const scaled = dec0 >= dec1
    ? (sqrt * sqrt * shift * scale) / q
    : (sqrt * sqrt * scale) / (q * shift);
  return Number(scaled) / 1e6;
}

/** USDC for 1 WPROS, after checking which token is token0. */
export function wprosUsdcPrice(sqrtPriceX96, token0, token1) {
  const sqrt = BigInt(sqrtPriceX96);
  if (sqrt === 0n) return null;
  const wpros = PACIFIC.WPROS.address.toLowerCase();
  const usdc = PACIFIC.USDC.address.toLowerCase();
  const a = String(token0).toLowerCase();
  const b = String(token1).toLowerCase();
  const scale = 1_000_000n;
  const q = 1n << 192n;
  const shift = 10n ** 12n;
  let scaled;
  if (a === wpros && b === usdc) scaled = (sqrt * sqrt * shift * scale) / q;
  else if (a === usdc && b === wpros) scaled = (q * shift * scale) / (sqrt * sqrt);
  else return null;
  return Number(scaled) / 1e6;
}

export function parseThreshold(input) {
  const text = String(input ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return { error: "bad-price" };
  const value = Number(text);
  if (!Number.isFinite(value)) return { error: "bad-price" };
  return { value };
}

export function priceCrossed(price, threshold, side = "above") {
  if (!Number.isFinite(price) || !Number.isFinite(threshold)) return false;
  return side === "below" ? price <= threshold : price >= threshold;
}

export function priceStatus(price, threshold, side, crossed, lang) {
  const shown = Number(price).toFixed(6);
  const line = String(threshold);
  const onSide = priceCrossed(price, threshold, side);
  if (crossed) {
    return phrase(lang, {
      pt: `O WPROS está em ${shown} USDC e acabou de cruzar ${side === "below" ? "abaixo" : "acima"} de ${line}.`,
      es: `WPROS está en ${shown} USDC y acaba de cruzar ${side === "below" ? "por debajo" : "por encima"} de ${line}.`,
      en: `WPROS is ${shown} USDC and just crossed ${side} ${line}.`,
    });
  }
  if (onSide) {
    return phrase(lang, {
      pt: `O WPROS está em ${shown} USDC, já ${side === "below" ? "abaixo" : "acima"} de ${line}. Nesta leitura ele não cruzou a linha.`,
      es: `WPROS está en ${shown} USDC, ya ${side === "below" ? "por debajo" : "por encima"} de ${line}. En esta lectura no cruzó la línea.`,
      en: `WPROS is ${shown} USDC, already ${side} ${line}. It did not cross that line on this check.`,
    });
  }
  const where = side === "below"
    ? { pt: "acima", es: "por encima", en: "above" }
    : { pt: "abaixo", es: "por debajo", en: "below" };
  const want = side === "below"
    ? { pt: "abaixo", es: "por debajo", en: "below" }
    : { pt: "acima", es: "por encima", en: "above" };
  return phrase(lang, {
    pt: `O WPROS está em ${shown} USDC, ${where.pt} de ${line}. A linha “${want.pt} de ${line}” não foi cruzada.`,
    es: `WPROS está en ${shown} USDC, ${where.es} de ${line}. La línea “${want.es} de ${line}” no fue cruzada.`,
    en: `WPROS is ${shown} USDC, ${where.en} ${line}. The “${want.en} ${line}” line was not crossed.`,
  });
}

/** True only when the price moves from one side of the line to the other. */
export function priceJustCrossed(prev, next, threshold, side = "above") {
  if (!Number.isFinite(prev) || !Number.isFinite(next) || !Number.isFinite(threshold)) return false;
  if (side === "below") return prev > threshold && next <= threshold;
  return prev < threshold && next >= threshold;
}

export function inputSelector(data) {
  const hex = String(data ?? "");
  if (!/^0x[0-9a-f]{8,}/i.test(hex)) return null;
  return hex.slice(0, 10).toLowerCase();
}

export function normalizeSelector(input) {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return null;
  const hex = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-f]{8}$/.test(hex)) return { error: "bad-selector" };
  return hex;
}

export function resolveToken(input) {
  const raw = String(input ?? "USDC").trim();
  if (!raw) return PACIFIC.USDC;
  const bySym = TOKEN_LIST.find((t) => t.symbol.toLowerCase() === raw.toLowerCase());
  if (bySym) return bySym;
  if (/^0x[0-9a-f]{40}$/i.test(raw)) {
    const known = TOKEN_LIST.find((t) => t.address.toLowerCase() === raw.toLowerCase());
    return known ?? { symbol: "TOKEN", address: getAddress(raw), decimals: 18 };
  }
  return { error: "unknown-token" };
}

export function parseMin(token, amount) {
  const text = String(amount ?? "50").trim() || "50";
  if (!/^\d+(\.\d+)?$/.test(text)) return { error: "bad-min" };
  try {
    return { wei: parseUnits(text, token.decimals), text };
  } catch {
    return { error: "bad-min" };
  }
}

export function pickTransfers(transfers, minWei) {
  return transfers.filter((t) => t.value >= minWei);
}

function callResult(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") return raw;
  return raw.result ?? raw.data ?? null;
}

async function readWord(client, to, data) {
  const raw = await callJson(client, "eth_call", { transaction: { to, data } });
  return callResult(raw);
}

export function alertLang(input) {
  const lang = String(input || "en").toLowerCase();
  return lang === "pt" || lang === "es" ? lang : "en";
}

function phrase(lang, pack) {
  return pack[alertLang(lang)] || pack.en;
}

function transferAlert(t, token, lang) {
  const amount = formatAmount(t.value, token.decimals, 4, lang);
  const who = `${labeled(t.from, {}, lang)} → ${labeled(t.to, {}, lang)}`;
  const line = phrase(lang, {
    pt: `Transferência grande de ${amount} ${token.symbol} (${t.kind}). ${who}. Bloco ${t.block}.`,
    es: `Transferencia grande de ${amount} ${token.symbol} (${t.kind}). ${who}. Bloque ${t.block}.`,
    en: `Large ${t.kind}: ${amount} ${token.symbol}. ${who}. Block ${t.block}.`,
  });
  return {
    id: `tf:${token.address.toLowerCase()}:${t.tx}:${t.logIndex}`,
    kind: "transfer",
    line,
    value: `${amount} ${token.symbol}`,
    tx: t.tx,
    link: explorerTx(t.tx),
    block: t.block,
  };
}

function callAlert(log, contract, valueText, lang) {
  const tx = log.transactionHash ?? log.tx;
  const block = Number(log.blockNumber ?? log.block);
  const line = phrase(lang, {
    pt: `Chamada no contrato ${contract}. Valor nativo ${valueText}. Bloco ${block}.`,
    es: `Llamada al contrato ${contract}. Valor nativo ${valueText}. Bloque ${block}.`,
    en: `Call to ${contract}. Native value ${valueText}. Block ${block}.`,
  });
  return {
    id: `call:${contract.toLowerCase()}:${tx}`,
    kind: "call",
    line,
    value: valueText,
    tx,
    link: explorerTx(tx),
    block,
  };
}

async function readCall(client, hash, lang) {
  try {
    const raw = await callJson(client, "get_transaction", { hash, transactionHash: hash });
    const tx = raw?.transaction ?? raw?.result ?? raw ?? {};
    const wei = BigInt(tx.value ?? 0);
    return {
      valueText: `${formatAmount(wei, 18, 4, lang)} PROS`,
      selector: inputSelector(tx.input ?? tx.data),
    };
  } catch {
    return { valueText: phrase(lang, { pt: "valor nativo indisponível", es: "valor nativo no disponible", en: "native value unavailable" }), selector: null };
  }
}

function asLogs(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.logs)) return raw.logs;
  if (Array.isArray(raw?.result)) return raw.result;
  return [];
}

const LOG_TOO_BIG = /too many|result limit|response (too |size)|exceeded|payload|max logs|query returned more/i;

async function contractLogs(client, address, fromBlock, toBlock) {
  const out = [];
  async function pull(start, end) {
    try {
      out.push(...asLogs(await callJson(client, "get_logs", { address, fromBlock: start, toBlock: end })));
    } catch (error) {
      if (start >= end || !LOG_TOO_BIG.test(`${error.message ?? ""}`)) throw error;
      const mid = start + Math.floor((end - start) / 2);
      await pull(start, mid);
      await pull(mid + 1, end);
    }
  }
  for (const window of logWindows(fromBlock, toBlock)) await pull(window.fromBlock, window.toBlock);
  return out;
}

export async function scanAlerts(client, opts = {}) {
  const lang = alertLang(opts.lang);
  const mode = parseMode(opts.mode);
  if (mode.error) {
    const err = new Error(phrase(lang, { pt: "Condição: transfer, price ou call.", es: "Condición: transfer, price o call.", en: "Condition must be transfer, price, or call." }));
    err.status = 400;
    throw err;
  }
  const cap = opts.api ? MAX_LOOKBACK_API : MAX_LOOKBACK;
  const lookback = Math.min(Math.max(Number(opts.lookback ?? 1000) || 1000, 1), cap);
  const hits = [];
  let price = null;
  let threshold = null;
  let side = opts.side === "below" ? "below" : "above";
  let token = null;
  let minText = null;
  let contract = null;
  let wanted = null;
  let minWei = null;

  if (mode === "transfer") {
    token = resolveToken(opts.token);
    if (token.error) {
      const err = new Error(phrase(lang, { pt: "Passe USDC, WPROS, LINK, WETH ou um 0x.", es: "Pasa USDC, WPROS, LINK, WETH o un 0x.", en: "Pass USDC, WPROS, LINK, WETH or a 0x." }));
      err.status = 400;
      throw err;
    }
    const min = parseMin(token, opts.min ?? "50");
    if (min.error) {
      const err = new Error(phrase(lang, { pt: "Mínimo inválido.", es: "Mínimo inválido.", en: "Bad minimum amount." }));
      err.status = 400;
      throw err;
    }
    minText = min.text;
    minWei = min.wei;
  }

  if (mode === "price") {
    const parsed = parseThreshold(opts.price);
    if (parsed.error) {
      const err = new Error(phrase(lang, { pt: "Passe o preço limite, por exemplo 0.05.", es: "Pasa el precio límite, por ejemplo 0.05.", en: "Pass a price threshold, for example 0.05." }));
      err.status = 400;
      throw err;
    }
    threshold = parsed.value;
  }

  if (mode === "call") {
    const raw = String(opts.contract || MIXSWAP).trim();
    if (!/^0x[0-9a-f]{40}$/i.test(raw)) {
      const err = new Error(phrase(lang, { pt: "Passe o contrato da chamada.", es: "Pasa el contrato de la llamada.", en: "Pass the contract to watch." }));
      err.status = 400;
      throw err;
    }
    contract = getAddress(raw);
    wanted = normalizeSelector(opts.selector);
    if (wanted?.error) {
      const err = new Error(phrase(lang, { pt: "O seletor da função precisa ter 4 bytes, tipo 0x128acb08.", es: "El selector de la función necesita 4 bytes, como 0x128acb08.", en: "Function selector must be 4 bytes, like 0x128acb08." }));
      err.status = 400;
      throw err;
    }
  }

  const head = await latestBlock(client);
  const fromBlock = lookbackFrom(head, lookback);

  if (mode === "transfer") {
    const { transfers } = await fetchTransfers(client, token.address, fromBlock, head);
    for (const t of pickTransfers(transfers, minWei)) hits.push(transferAlert(t, token, lang));
  }

  if (mode === "price") {
    const [slot, t0, t1] = await Promise.all([
      readWord(client, POOL, SLOT0),
      readWord(client, POOL, TOKEN0),
      readWord(client, POOL, TOKEN1),
    ]);
    const sqrt = decodeSlot0(slot);
    const token0 = decodeAddressWord(t0);
    const token1 = decodeAddressWord(t1);
    price = sqrt !== null && token0 && token1 ? wprosUsdcPrice(sqrt, token0, token1) : null;
    if (price !== null && priceJustCrossed(opts.prevPrice, price, threshold, side)) {
      const shown = price.toFixed(6);
      const way = side === "below"
        ? phrase(lang, { pt: "caiu para", es: "bajó a", en: "fell to" })
        : phrase(lang, { pt: "subiu para", es: "subió a", en: "rose to" });
      hits.push({
        id: `price:${side}:${threshold}:${head}`,
        kind: "price",
        line: phrase(lang, {
          pt: `O preço do WPROS ${way} ${shown} USDC e cruzou ${threshold}.`,
          es: `El precio de WPROS ${way} ${shown} USDC y cruzó ${threshold}.`,
          en: `WPROS price ${way} ${shown} USDC and crossed ${threshold}.`,
        }),
        value: `${shown} USDC`,
        tx: null,
        link: explorerAddress(POOL),
        block: head,
      });
    }
  }

  if (mode === "call") {
    const logs = await contractLogs(client, contract, fromBlock, head);
    const seenTx = new Set();
    let inspected = 0;
    for (const log of logs) {
      const tx = log.transactionHash ?? log.tx;
      if (!tx || seenTx.has(tx)) continue;
      seenTx.add(tx);
      inspected++;
      if (inspected > 30) break;
      const read = await readCall(client, tx, lang);
      if (wanted && read.selector !== wanted) continue;
      const lineValue = wanted ? `${read.valueText} · ${wanted}` : read.valueText;
      hits.push(callAlert(log, contract, lineValue, lang));
      if (hits.length >= 8) break;
    }
  }

  hits.sort((a, b) => b.block - a.block);
  const span = phrase(lang, { pt: `Blocos ${fromBlock}–${head}.`, es: `Bloques ${fromBlock}–${head}.`, en: `Blocks ${fromBlock}–${head}.` });
  let headline;
  if (mode === "price" && price === null) {
    headline = phrase(lang, { pt: "Não li o preço do pool WPROS/USDC.", es: "No leí el precio del pool WPROS/USDC.", en: "Could not read the WPROS/USDC pool price." });
  } else if (mode === "price") {
    headline = priceStatus(price, threshold, side, hits.length > 0, lang);
  } else {
    headline = phrase(lang, {
      pt: `${hits.length} alerta(s) na condição ${mode}. ${span}`,
      es: `${hits.length} alerta(s) en la condición ${mode}. ${span}`,
      en: `${hits.length} alert(s) for ${mode}. ${span}`,
    });
  }

  return {
    ok: true,
    mode,
    headline,
    token,
    min: minText,
    price,
    threshold,
    side,
    contract,
    fromBlock,
    toBlock: head,
    pool: POOL,
    alerts: hits.slice(0, 40),
  };
}
