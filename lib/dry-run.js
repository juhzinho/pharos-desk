import { encodeFunctionData, erc20Abi, getAddress, isAddress, parseUnits } from "viem";
import { callJson } from "./mcp.js";
import { PACIFIC } from "./tokens.js";
import { plainReason, reasonFromMessage } from "./revert.js";
import { explorerAddress, formatAmount, formatInteger, labeled } from "./format.js";

/** Public Pacific addresses used only as simulation samples. Nothing is signed or sent. */
export const SAMPLE_FROM = "0x15dDce897D76ac39c188AdE4D353711A60395315";
export const SAMPLE_POOL = "0x912c9aDe24D44d8922f0866D8Dcb079f1363f647";
export const SAMPLE_TO = "0x000000000000000000000000000000000000dEaD";

export const SAMPLES = {
  pass: { kind: "transfer", token: "USDC", from: SAMPLE_FROM, to: SAMPLE_TO, amount: "1" },
  revert: { kind: "transfer", token: "USDC", from: SAMPLE_FROM, to: SAMPLE_TO, amount: "999999999999" },
  gas: { kind: "transfer", token: "USDC", from: SAMPLE_POOL, to: SAMPLE_TO, amount: "1" },
};

function fail(lang, en, pt) {
  const error = new Error(lang === "pt" ? pt : en);
  error.status = 400;
  throw error;
}

function say(lang, pack) {
  return lang === "pt" ? pack.pt : pack.en;
}

function asAddress(value, lang, labelEn, labelPt) {
  const text = String(value ?? "").trim();
  if (!isAddress(text)) fail(lang, `${labelEn} is not an address.`, `${labelPt} não é um endereço.`);
  return getAddress(text);
}

export function parseAmount(amount, decimals, lang = "en") {
  const text = String(amount ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(text)) fail(lang, "Amount has to be a plain number.", "O valor tem que ser um número.");
  try {
    const raw = parseUnits(text, decimals);
    if (raw <= 0n) fail(lang, "Amount has to be greater than zero.", "O valor tem que ser maior que zero.");
    return raw;
  } catch {
    fail(lang, "That amount does not fit this token.", "Esse valor não cabe nesse token.");
  }
}

export function resolveIntent(input = {}) {
  const lang = input.lang === "pt" ? "pt" : "en";
  const sample = SAMPLES[String(input.sample || "").toLowerCase()];
  const src = sample ? { ...sample, ...stripEmpty(input), lang } : { ...input, lang };
  if (sample) {
    src.kind = sample.kind;
    src.token = sample.token;
    src.from = sample.from;
    src.to = sample.to;
    src.amount = sample.amount;
  }
  return buildCall({ ...src, lang });
}

function stripEmpty(input) {
  const out = {};
  for (const key of ["kind", "token", "from", "to", "amount"]) {
    if (input[key] != null && String(input[key]).trim() !== "") out[key] = input[key];
  }
  return out;
}

export function buildCall(intent) {
  const lang = intent.lang === "pt" ? "pt" : "en";
  const kind = ["transfer", "approve", "native"].includes(intent.kind) ? intent.kind : "transfer";
  const from = asAddress(intent.from, lang, "From", "De");
  if (kind === "native") {
    const recipient = asAddress(intent.to, lang, "To", "Para");
    const amount = parseAmount(intent.amount, 18, lang);
    return { lang, kind, from, to: recipient, data: "0x", value: amount, token: null, symbol: "PROS", decimals: 18, amount, recipient };
  }
  const symbol = String(intent.token || "USDC").toUpperCase();
  const token = PACIFIC[symbol];
  if (!token) fail(lang, "Token has to be USDC, WPROS, LINK or WETH.", "O token tem que ser USDC, WPROS, LINK ou WETH.");
  const recipient = asAddress(intent.to, lang, kind === "approve" ? "Spender" : "To", kind === "approve" ? "Quem pode gastar" : "Para");
  const amount = parseAmount(intent.amount, token.decimals, lang);
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: kind === "approve" ? "approve" : "transfer",
    args: [recipient, amount],
  });
  return { lang, kind, from, to: token.address, data, value: 0n, token, symbol: token.symbol, decimals: token.decimals, amount, recipient };
}

/** Funds move only when the call succeeded and the sender can pay the fee. */
export function predictBalances({ callOk, canPay, kind, amount, fromToken, toToken, allowance, fromNative, value, fee }) {
  const mined = Boolean(callOk && canPay && fee != null);
  const movesToken = mined && kind === "transfer";
  const movesAllowance = mined && kind === "approve";
  const nativeDebit = mined ? (value ?? 0n) + fee : 0n;
  return {
    mined,
    fromToken: movesToken ? fromToken - amount : fromToken,
    toToken: movesToken ? toToken + amount : toToken,
    allowance: movesAllowance ? amount : allowance,
    fromNative: fromNative - nativeDebit,
  };
}

export function decide({ callOk, gas, gasPriceWei, nativeWei, valueWei }) {
  const fee = gas == null ? null : BigInt(gas) * BigInt(gasPriceWei);
  const needed = (valueWei ?? 0n) + (fee ?? 0n);
  const canPay = fee != null && nativeWei >= needed;
  if (!callOk) return { blocked: true, verdict: "revert", canPay: false, fee, needed };
  if (!canPay) return { blocked: true, verdict: "gas", canPay: false, fee, needed };
  return { blocked: false, verdict: "pass", canPay: true, fee, needed };
}

export function finish(decision, unsigned) {
  return { ...decision, broadcast: false, unsigned: decision.blocked ? null : unsigned };
}

function hexWei(value) {
  return `0x${(value ?? 0n).toString(16)}`;
}

function weiOf(res) {
  if (res?.balanceWei != null && res.balanceWei !== "") return BigInt(res.balanceWei);
  if (res?.balanceHex) return BigInt(res.balanceHex);
  if (res?.result != null && res.result !== "") return BigInt(res.result);
  return 0n;
}

async function tokenBalance(client, token, holder, block) {
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [holder] });
  const { result } = await callJson(client, "eth_call", { transaction: { to: token, data }, block });
  return BigInt(result);
}

async function allowanceOf(client, token, owner, spender, block) {
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
  const { result } = await callJson(client, "eth_call", { transaction: { to: token, data }, block });
  return BigInt(result);
}

function row(label, before, after, lang) {
  const same = before === after;
  const tail = same ? say(lang, { pt: "igual", en: "unchanged" }) : after;
  return { label, before, after, same, line: `${label}: ${before} → ${tail}` };
}

export async function simulate(client, input = {}) {
  const call = resolveIntent(input);
  const lang = call.lang;
  const locale = lang === "pt" ? "pt" : "en";
  const who = locale;
  const chain = await callJson(client, "get_chain_info");
  const gasPrice = await callJson(client, "get_gas_price");
  const block = Number(chain.latestBlock);
  const gasPriceWei = BigInt(gasPrice.gasPriceWei ?? gasPrice.gasPriceHex ?? 0);

  const tx = { from: call.from, to: call.to, data: call.data, value: hexWei(call.value) };
  const [fromNativeRes, nonceRes, fromToken, toToken, allowance] = await Promise.all([
    callJson(client, "get_balance", { address: call.from, block }),
    callJson(client, "get_transaction_count", { address: call.from, block }),
    call.token ? tokenBalance(client, call.to, call.from, block) : Promise.resolve(0n),
    call.token && call.kind === "transfer" ? tokenBalance(client, call.to, call.recipient, block) : Promise.resolve(0n),
    call.token && call.kind === "approve" ? allowanceOf(client, call.to, call.from, call.recipient, block) : Promise.resolve(0n),
  ]);
  const fromNative = weiOf(fromNativeRes);
  const nonce = Number(nonceRes.transactionCount ?? nonceRes.count ?? nonceRes.nonce ?? nonceRes.result ?? 0);

  let callOk = false;
  let decoded = null;
  try {
    await callJson(client, "eth_call", { transaction: tx, block });
    callOk = true;
  } catch (error) {
    decoded = reasonFromMessage(error.message);
  }

  let gas = null;
  if (callOk) {
    try {
      const est = await callJson(client, "estimate_gas", { transaction: tx });
      gas = BigInt(est.gas ?? est.gasUsed ?? est.gasHex);
    } catch (error) {
      callOk = false;
      decoded = decoded || reasonFromMessage(error.message);
    }
  }

  const decision = decide({ callOk, gas, gasPriceWei, nativeWei: fromNative, valueWei: call.value });
  const predicted = predictBalances({
    callOk,
    canPay: decision.canPay,
    kind: call.kind,
    amount: call.amount,
    fromToken,
    toToken,
    allowance,
    fromNative,
    value: call.value,
    fee: decision.fee,
  });

  const money = (raw, decimals) => formatAmount(raw, decimals, 6, locale);
  const rows = [];
  if (call.kind === "transfer") {
    rows.push(row(say(lang, { pt: `${call.symbol} de quem envia`, en: `Sender ${call.symbol}` }), money(fromToken, call.decimals), money(predicted.fromToken, call.decimals), lang));
    rows.push(row(say(lang, { pt: `${call.symbol} de quem recebe`, en: `Recipient ${call.symbol}` }), money(toToken, call.decimals), money(predicted.toToken, call.decimals), lang));
  } else if (call.kind === "approve") {
    rows.push(row(say(lang, { pt: `Permissão de ${call.symbol}`, en: `${call.symbol} allowance` }), money(allowance, call.decimals), money(predicted.allowance, call.decimals), lang));
  }
  rows.push(row(say(lang, { pt: "PROS de quem envia", en: "Sender PROS" }), money(fromNative, 18), money(predicted.fromNative, 18), lang));

  const reason = !callOk
    ? (plainReason(decoded, lang) || say(lang, { pt: "A chamada reverteu e o nó não devolveu o motivo.", en: "The call reverted and the node did not return a reason." }))
    : decision.verdict === "gas"
      ? say(lang, {
        pt: `A chamada no contrato passaria, mas a taxa é ${money(decision.fee ?? 0n, 18)} PROS e essa carteira tem ${money(fromNative, 18)} PROS.`,
        en: `The contract call would succeed, but the fee is ${money(decision.fee ?? 0n, 18)} PROS and this wallet has ${money(fromNative, 18)} PROS.`,
      })
      : say(lang, { pt: "A chamada passou e a carteira cobre a taxa.", en: "The call succeeded and the wallet covers the fee." });

  const headline = decision.verdict === "pass"
    ? say(lang, { pt: "Simulação passou.", en: "Simulation passed." })
    : decision.verdict === "gas"
      ? say(lang, { pt: "Bloqueado. Quem envia não paga o gás.", en: "Blocked. The sender cannot pay the gas." })
      : say(lang, { pt: "Simulação reverteu.", en: "Simulation reverted." });

  const attempted = Boolean(input.execute);
  const gate = decision.verdict === "gas"
    ? say(lang, {
      pt: "Envio bloqueado. A chamada até passaria, mas sem PROS para a taxa ela não entra.",
      en: "Execution blocked. The call would succeed, but without PROS for the fee it does not get in.",
    })
    : decision.blocked
    ? say(lang, {
      pt: "Envio bloqueado. A simulação reverteu, então nada foi montado para assinar.",
      en: "Execution blocked. The simulation reverted, so nothing was prepared for signing.",
    })
    : attempted
      ? say(lang, {
        pt: "A trava deixou passar. Não foi enviado. Este servidor não tem chave.",
        en: "The gate let this one through. It was not broadcast. This server has no key.",
      })
      : say(lang, {
        pt: "Pode assinar. Nada foi enviado. A transação abaixo está sem assinatura.",
        en: "Clear to sign. Nothing was broadcast. The transaction below is unsigned.",
      });

  const unsigned = {
    chainId: Number(chain.chainId) || 1672,
    from: call.from,
    to: call.to,
    data: call.data,
    value: hexWei(call.value),
    gas: gas == null ? null : `0x${gas.toString(16)}`,
    gasPrice: hexWei(gasPriceWei),
    nonce,
  };
  const gated = finish(decision, unsigned);
  const amountText = money(call.amount, call.decimals);
  const action = call.kind === "native"
    ? say(lang, { pt: `enviar ${amountText} PROS`, en: `send ${amountText} PROS` })
    : call.kind === "approve"
      ? say(lang, { pt: `aprovar ${amountText} ${call.symbol}`, en: `approve ${amountText} ${call.symbol}` })
      : say(lang, { pt: `transferir ${amountText} ${call.symbol}`, en: `transfer ${amountText} ${call.symbol}` });

  const lines = [
    `${say(lang, { pt: "Ação", en: "Action" })}: ${action}`,
    `${say(lang, { pt: "De", en: "From" })}: ${labeled(call.from, {}, who)}`,
    `${say(lang, { pt: "Para", en: "To" })}: ${labeled(call.kind === "native" ? call.to : call.recipient, {}, who)}`,
    call.token ? `${say(lang, { pt: "Contrato", en: "Contract" })}: ${labeled(call.to, {}, who)}` : "",
    gas == null
      ? say(lang, { pt: "Gás: a estimativa também reverteu, então não há taxa.", en: "Gas: the estimate reverted too, so there is no fee." })
      : say(lang, {
        pt: `Gás ${formatInteger(gas, locale)} a ${gasPrice.gasPriceGwei} gwei. Taxa ${money(decision.fee ?? 0n, 18)} PROS.`,
        en: `Gas ${formatInteger(gas, locale)} at ${gasPrice.gasPriceGwei} gwei. Fee ${money(decision.fee ?? 0n, 18)} PROS.`,
      }),
    `${say(lang, { pt: "Bloco", en: "Block" })}: ${formatInteger(block, locale)}`,
    reason,
    ...rows.map((item) => item.line),
    gate,
  ].filter(Boolean);

  return {
    ok: true,
    blocked: gated.blocked,
    broadcast: false,
    verdict: decision.verdict,
    headline,
    reason,
    gate,
    lines,
    rows,
    action,
    block,
    gas: gas == null ? null : gas.toString(),
    gasPriceGwei: gasPrice.gasPriceGwei,
    fee: decision.fee == null ? null : decision.fee.toString(),
    from: call.from,
    to: call.kind === "native" ? call.to : call.recipient,
    contract: call.token ? call.to : null,
    fromLink: explorerAddress(call.from),
    unsigned: gated.unsigned,
    attempted,
  };
}
