import { callJson } from "./mcp.js";
import { explorerAddress, explorerTx, formatInteger, labeled, short } from "./format.js";
import { decodeRevert, isTxHash, receiptFailed } from "./revert.js";

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
  if (!raw || typeof raw !== "object") return raw;
  return raw.transaction ?? raw.result ?? raw;
}

function say(lang, pack) {
  if (lang === "pt") return pack.pt;
  if (lang === "es") return pack.es;
  return pack.en;
}

function pickReceipt(raw) {
  if (!raw || typeof raw !== "object") return raw;
  return raw.receipt ?? raw.result ?? raw;
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

  const tx = pickTx(txWrap.data) ?? {};
  let receipt = null;
  let receiptTool = null;
  try {
    const rec = await tryTools(client, ["get_transaction_receipt", "eth_getTransactionReceipt"], { hash: txHash, transactionHash: txHash });
    receipt = pickReceipt(rec.data);
    receiptTool = rec.name;
  } catch {
    /* pending */
  }

  const failed = receiptFailed(receipt);
  const to = tx.to ?? receipt?.to ?? null;
  const from = tx.from ?? receipt?.from ?? null;
  const block = Number(tx.blockNumber ?? receipt?.blockNumber ?? 0) || null;
  const lines = [];

  if (failed === null && !receipt) {
    lines.push(say(lang, { pt: "Tem a tx, mas ainda sem receipt — provavelmente pendente.", es: "Tengo la tx, pero aún sin receipt — probablemente pendiente.", en: "I have the tx, but no receipt yet — likely pending." }));
  } else if (failed === false) {
    lines.push(say(lang, { pt: "A transação passou (status 1). Não foi revert.", es: "La transacción pasó (status 1). No revirtió.", en: "The transaction succeeded (status 1). It did not revert." }));
  } else if (failed === true) {
    lines.push(say(lang, { pt: "A transação falhou on-chain (status 0).", es: "La transacción falló on-chain (status 0).", en: "The transaction failed on-chain (status 0)." }));
    const call = {
      to: to ?? undefined,
      from: from ?? undefined,
      data: tx.input ?? tx.data ?? "0x",
      value: tx.value ?? "0x0",
    };
    try {
      await callJson(client, "eth_call", {
        transaction: call,
        ...(block ? { block: block - 1 } : {}),
      });
      lines.push(say(lang, { pt: "O eth_call no bloco anterior não reverteu. O revert pode ter sido por estado no bloco da tx.", es: "El eth_call en el bloque anterior no revirtió. El fallo puede depender del estado en el bloque de la tx.", en: "eth_call on the previous block did not revert. The failure may depend on state in the tx block." }));
    } catch (error) {
      const decoded = decodeRevert(String(error.message).match(/0x[0-9a-f]+/i)?.[0] ?? "");
      if (decoded.kind === "error" && decoded.text) {
        lines.push(`Revert: ${decoded.text}`);
      } else {
        lines.push(say(lang, {
          pt: `O nó devolveu erro no eth_call: ${error.message.slice(0, 240)}`,
          es: `El nodo devolvió un error en eth_call: ${error.message.slice(0, 240)}`,
          en: `The node returned an eth_call error: ${error.message.slice(0, 240)}`,
        }));
      }
    }
  }

  const who = lang === "en" ? "en" : "pt";
  if (from) lines.push(`${say(lang, { pt: "De", es: "De", en: "From" })} ${labeled(from, {}, who)}`);
  if (to) lines.push(`${say(lang, { pt: "Para", es: "Para", en: "To" })} ${labeled(to, {}, who)}`);
  else lines.push(say(lang, { pt: "Sem destino — parece deploy de contrato.", es: "Sin destino — parece un deploy de contrato.", en: "No destination — looks like a contract deploy." }));
  if (block) lines.push(`${say(lang, { pt: "Bloco", es: "Bloque", en: "Block" })} ${formatInteger(block, lang === "en" ? "en" : "pt")}`);
  if (receipt?.gasUsed != null) {
    lines.push(`${say(lang, { pt: "Gás usado", es: "Gas usado", en: "Gas used" })} ${formatInteger(receipt.gasUsed, lang === "en" ? "en" : "pt")}`);
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
