import { callJson } from "./mcp.js";
import { explorerAddress, explorerTx, formatAmount, formatInteger, labeled, short } from "./format.js";
import { functionName, isTxHash, outOfGas, plainReason, reasonFromMessage, receiptFailed } from "./revert.js";

async function tryTools(client, names, args) {
  let last;
  for (const name of names) {
    try {
      return { name, data: await callJson(client, name, args) };
    } catch (error) {
      last = error;
    }
  }
  throw last ?? new Error("no tool");
}

function pickTx(raw) {
  if (!raw || typeof raw !== "object") return null;
  if ("transaction" in raw) return raw.transaction && typeof raw.transaction === "object" ? raw.transaction : null;
  if ("result" in raw) return raw.result && typeof raw.result === "object" ? raw.result : null;
  return raw;
}

export function txPresent(record) {
  if (!record || typeof record !== "object") return false;
  return Boolean(record.hash || record.transactionHash || record.from || record.to || record.blockNumber || record.blockHash);
}

function say(lang, pack) {
  if (lang === "pt") return pack.pt;
  if (lang === "es") return pack.es;
  return pack.en;
}

function pickReceipt(raw) {
  if (!raw || typeof raw !== "object") return null;
  if ("receipt" in raw) return raw.receipt && typeof raw.receipt === "object" ? raw.receipt : null;
  if ("result" in raw) return raw.result && typeof raw.result === "object" ? raw.result : null;
  return raw;
}

function blockNumber(value) {
  if (value == null || value === "") return null;
  try {
    const n = BigInt(value);
    if (n <= 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(n);
  } catch {
    return null;
  }
}

function badCall(message) {
  return /invalid (parameter|params|argument)|unsupported|block number|header not found|missing value/i.test(String(message ?? ""));
}

async function replayReason(client, call, block) {
  const tags = [];
  if (block > 1) tags.push(block - 1, `0x${(block - 1).toString(16)}`);
  if (block) tags.push(block, `0x${block.toString(16)}`);
  let sawSuccess = false;
  for (const tag of tags) {
    try {
      await callJson(client, "eth_call", { transaction: call, block: tag });
      sawSuccess = true;
    } catch (error) {
      const message = String(error?.message ?? "");
      if (badCall(message) && !reasonFromMessage(message)) continue;
      const decoded = reasonFromMessage(message);
      if (decoded) return { decoded, replayed: true };
    }
  }
  return { decoded: null, replayed: sawSuccess };
}

export async function inspectTx(client, hash, lang = "en") {
  const txHash = String(hash ?? "").trim();
  if (!isTxHash(txHash)) {
    const err = new Error(say(lang, {
      pt: "Passe o hash da transação (0x + 64 hex).",
      es: "Pasa el hash de la transacción (0x + 64 hex).",
      en: "Pass a transaction hash (0x + 64 hex).",
    }));
    err.status = 400;
    throw err;
  }

  let txWrap;
  try {
    txWrap = await tryTools(client, ["get_transaction", "eth_getTransactionByHash"], { hash: txHash, transactionHash: txHash });
  } catch {
    return {
      ok: true,
      found: false,
      failed: null,
      headline: say(lang, { pt: "Não achei essa tx na Pacific.", es: "No encontré esa tx en Pacific.", en: "I could not find that tx on Pacific." }),
      lines: [
        say(lang, {
          pt: "O Chain MCP não devolveu a transação. Confere o hash, ou se ela ainda não chegou no nó.",
          es: "Chain MCP no devolvió la transacción. Revisa el hash, o todavía no llegó al nodo.",
          en: "Chain MCP did not return the transaction. Check the hash, or it may not be on this node yet.",
        }),
      ],
      link: explorerTx(txHash),
      hash: txHash,
    };
  }

  const tx = pickTx(txWrap.data);
  let receipt = null;
  let receiptTool = null;
  try {
    const rec = await tryTools(client, ["get_transaction_receipt", "eth_getTransactionReceipt"], { hash: txHash, transactionHash: txHash });
    receipt = pickReceipt(rec.data);
    receiptTool = rec.name;
  } catch {
    /* pending or missing */
  }

  if (!txPresent(tx) && !txPresent(receipt)) {
    return {
      ok: true,
      found: false,
      failed: null,
      headline: say(lang, { pt: "Não achei essa tx na Pacific.", es: "No encontré esa tx en Pacific.", en: "I could not find that tx on Pacific." }),
      lines: [
        say(lang, {
          pt: "Esse hash não corresponde a uma transação nesta rede. Confere se ele é da Pacific e se já foi enviado.",
          es: "Ese hash no corresponde a una transacción en esta red. Revisa si es de Pacific y si ya fue enviada.",
          en: "That hash is not a transaction on this network. Check that it is on Pacific and that it was sent.",
        }),
      ],
      link: explorerTx(txHash),
      hash: txHash,
      tools: [txWrap.name, receiptTool].filter(Boolean),
    };
  }

  const failed = receiptFailed(receipt);
  const to = tx?.to ?? receipt?.to ?? null;
  const from = tx?.from ?? receipt?.from ?? null;
  const input = tx?.input ?? tx?.data ?? "0x";
  const block = blockNumber(tx?.blockNumber ?? receipt?.blockNumber);
  const gasUsed = receipt?.gasUsed ?? null;
  const gasLimit = tx?.gas ?? tx?.gasLimit ?? null;
  const locale = lang === "en" ? "en" : lang === "es" ? "es" : "pt";
  const lines = [];
  const action = functionName(input, lang);

  if (failed === null && !receipt) {
    lines.push(say(lang, {
      pt: "A transação existe, mas o bloco ainda não devolveu o resultado. Espera um pouco e manda o hash de novo.",
      es: "La transacción existe, pero el bloque todavía no devolvió el resultado. Espera un momento y manda el hash otra vez.",
      en: "The transaction exists, but the block has not returned a result yet. Wait a moment and send the hash again.",
    }));
  } else if (failed === null) {
    lines.push(say(lang, {
      pt: "O recibo veio sem um status que eu reconheço, então não dá para afirmar se ela falhou.",
      es: "El recibo llegó sin un estado que yo reconozca, así que no puedo afirmar si falló.",
      en: "The receipt came back without a status I recognize, so I cannot say whether it failed.",
    }));
  } else if (failed === false) {
    lines.push(say(lang, {
      pt: "A rede aceitou a transação. Ela não falhou.",
      es: "La red aceptó la transacción. No falló.",
      en: "The network accepted the transaction. It did not fail.",
    }));
  } else if (failed === true) {
    const spent = outOfGas(gasUsed, gasLimit);
    let decoded = null;
    let replayed = false;
    if (to) {
      const replay = await replayReason(client, {
        to,
        from: from ?? undefined,
        data: input,
        value: tx.value ?? "0x0",
      }, block);
      decoded = replay.decoded;
      replayed = replay.replayed;
    }
    const reason = plainReason(decoded, lang);
    if (spent) {
      lines.push(say(lang, {
        pt: `Acabou o gás. O limite era ${formatInteger(gasLimit, locale)} e a transação usou tudo, então o contrato não terminou.`,
        es: `Se acabó el gas. El límite era ${formatInteger(gasLimit, locale)} y la transacción lo usó todo, así que el contrato no terminó.`,
        en: `It ran out of gas. The limit was ${formatInteger(gasLimit, locale)} and the transaction used all of it, so the contract did not finish.`,
      }));
    }
    if (reason) lines.push(reason);
    if (!spent && !reason) {
      lines.push(to
        ? say(lang, {
          pt: replayed
            ? "Não consegui repetir a falha. O estado de antes do bloco já não recusa essa chamada. O motivo pode ter sido outra transação no mesmo bloco, ou um estado que já mudou."
            : "Não consegui ler o texto do revert. O nó não devolveu o motivo do contrato.",
          es: replayed
            ? "No pude repetir el fallo. El estado de antes del bloque ya no rechaza esta llamada. El motivo puede haber sido otra transacción en el mismo bloque, o un estado que ya cambió."
            : "No pude leer el texto del revert. El nodo no devolvió el motivo del contrato.",
          en: replayed
            ? "I could not replay the failure. The state from before the block no longer rejects this call. The cause may have been another transaction in the same block, or state that has already changed."
            : "I could not read the revert text. The node did not return the contract's reason.",
        })
        : say(lang, {
          pt: "O deploy do contrato falhou. Sem um contrato de destino, não dá para repetir a chamada e ler o motivo.",
          es: "El deploy del contrato falló. Sin un contrato de destino, no se puede repetir la llamada y leer el motivo.",
          en: "The contract deploy failed. With no destination contract, the call cannot be replayed to read the reason.",
        }));
    }
  }

  if (action) lines.push(`${say(lang, { pt: "O que ela tentou", es: "Qué intentó", en: "What it tried" })}: ${action}.`);
  try {
    if (tx?.value != null && BigInt(tx.value) > 0n) {
      lines.push(`${say(lang, { pt: "Valor nativo", es: "Valor nativo", en: "Native value" })}: ${formatAmount(tx.value, 18, 6, locale)} PROS`);
    }
  } catch { /* value was not a number */ }

  const who = lang === "en" ? "en" : "pt";
  if (from) lines.push(`${say(lang, { pt: "De", es: "De", en: "From" })}: ${labeled(from, {}, who)}`);
  if (to) lines.push(`${say(lang, { pt: "Para", es: "Para", en: "To" })}: ${labeled(to, {}, who)}`);
  else lines.push(say(lang, { pt: "Sem destino: parece um deploy de contrato.", es: "Sin destino: parece un deploy de contrato.", en: "No destination: this looks like a contract deploy." }));
  if (block) lines.push(`${say(lang, { pt: "Bloco", es: "Bloque", en: "Block" })}: ${formatInteger(block, locale)}`);
  if (gasUsed != null && gasLimit != null && !outOfGas(gasUsed, gasLimit)) {
    try {
      lines.push(`${say(lang, { pt: "Gás", es: "Gas", en: "Gas" })}: ${formatInteger(gasUsed, locale)} / ${formatInteger(gasLimit, locale)}`);
    } catch { /* ignore unreadable gas */ }
  } else if (gasUsed != null && gasLimit == null) {
    try {
      lines.push(`${say(lang, { pt: "Gás usado", es: "Gas usado", en: "Gas used" })}: ${formatInteger(gasUsed, locale)}`);
    } catch { /* ignore unreadable gas */ }
  }

  const headline = failed
    ? `${say(lang, { pt: "Falhou", es: "Falló", en: "Failed" })} · ${short(txHash)}`
    : failed === false
      ? `${say(lang, { pt: "Passou", es: "Pasó", en: "Succeeded" })} · ${short(txHash)}`
      : `${say(lang, { pt: "Pendente ou incompleta", es: "Pendiente o incompleta", en: "Pending or incomplete" })} · ${short(txHash)}`;

  return {
    ok: true,
    found: true,
    failed,
    headline,
    lines,
    hash: txHash,
    from,
    to,
    block,
    link: explorerTx(txHash),
    fromLink: from ? explorerAddress(from) : null,
    toLink: to ? explorerAddress(to) : null,
    tools: [txWrap.name, receiptTool].filter(Boolean),
  };
}
