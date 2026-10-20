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

function pickReceipt(raw) {
  if (!raw || typeof raw !== "object") return raw;
  return raw.receipt ?? raw.result ?? raw;
}

export async function inspectTx(client, hash, lang = "en") {
  const txHash = String(hash ?? "").trim();
  if (!isTxHash(txHash)) {
    const err = new Error(lang === "pt" ? "Passe o hash da transação (0x + 64 hex)." : "Pass a transaction hash (0x + 64 hex).");
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
      headline: lang === "pt" ? "Não achei essa tx na Pacific." : "I could not find that tx on Pacific.",
      lines: [
        lang === "pt"
          ? "O Chain MCP não devolveu a transação. Confere o hash, ou se ela ainda não chegou no nó."
          : "Chain MCP did not return the transaction. Check the hash, or it may not be on this node yet.",
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
    lines.push(lang === "pt" ? "Tem a tx, mas ainda sem receipt — provavelmente pendente." : "I have the tx, but no receipt yet — likely pending.");
  } else if (failed === false) {
    lines.push(lang === "pt" ? "A transação passou (status 1). Não foi revert." : "The transaction succeeded (status 1). It did not revert.");
  } else if (failed === true) {
    lines.push(lang === "pt" ? "A transação falhou on-chain (status 0)." : "The transaction failed on-chain (status 0).");
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
      lines.push(lang === "pt" ? "O eth_call no bloco anterior não reverteu. O revert pode ter sido por estado no bloco da tx." : "eth_call on the previous block did not revert. The failure may depend on state in the tx block.");
    } catch (error) {
      const decoded = decodeRevert(String(error.message).match(/0x[0-9a-f]+/i)?.[0] ?? "");
      if (decoded.kind === "error" && decoded.text) {
        lines.push(lang === "pt" ? `Revert: ${decoded.text}` : `Revert: ${decoded.text}`);
      } else {
        lines.push(lang === "pt" ? `O nó devolveu erro no eth_call: ${error.message.slice(0, 240)}` : `The node returned an eth_call error: ${error.message.slice(0, 240)}`);
      }
    }
  }

  if (from) lines.push(lang === "pt" ? `De ${labeled(from, {}, "pt")}` : `From ${labeled(from, {}, "en")}`);
  if (to) lines.push(lang === "pt" ? `Para ${labeled(to, {}, "pt")}` : `To ${labeled(to, {}, "en")}`);
  else lines.push(lang === "pt" ? "Sem `to` — parece deploy de contrato." : "No `to` — looks like a contract deploy.");
  if (block) lines.push(lang === "pt" ? `Bloco ${formatInteger(block, "pt")}` : `Block ${formatInteger(block, "en")}`);
  if (receipt?.gasUsed != null) {
    lines.push(lang === "pt" ? `Gás usado ${formatInteger(receipt.gasUsed, "pt")}` : `Gas used ${formatInteger(receipt.gasUsed, "en")}`);
  }

  const headline = failed
    ? lang === "pt"
      ? `Falhou · ${short(txHash)}`
      : `Failed · ${short(txHash)}`
    : failed === false
      ? lang === "pt"
        ? `Passou · ${short(txHash)}`
        : `Succeeded · ${short(txHash)}`
      : lang === "pt"
        ? `Pendente ou incompleta · ${short(txHash)}`
        : `Pending or incomplete · ${short(txHash)}`;

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
