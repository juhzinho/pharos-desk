import { hexToString } from "viem";

const ERROR_STRING = "08c379a0";
const PANIC = "4e487b71";

export function isTxHash(value) {
  return /^0x[0-9a-f]{64}$/i.test(String(value ?? "").trim());
}

function strip(data) {
  return String(data ?? "").replace(/^0x/i, "").toLowerCase();
}

export function decodeRevert(data) {
  const hex = strip(data);
  if (!hex) return { kind: "empty", text: "" };
  if (hex.startsWith(ERROR_STRING) && hex.length >= 8 + 64 + 64) {
    const offset = Number.parseInt(hex.slice(8, 8 + 64), 16);
    const start = 8 + offset * 2;
    const len = Number.parseInt(hex.slice(start, start + 64), 16);
    const body = hex.slice(start + 64, start + 64 + len * 2);
    try {
      return { kind: "error", text: hexToString(`0x${body}`) };
    } catch {
      return { kind: "error", text: "Error(string)" };
    }
  }
  if (hex.startsWith(PANIC) && hex.length >= 8 + 64) {
    const code = Number.parseInt(hex.slice(8, 8 + 64), 16);
    return { kind: "panic", text: `Panic(${code})` };
  }
  return { kind: "raw", text: `0x${hex.slice(0, 20)}…` };
}

export function receiptFailed(receipt) {
  if (!receipt) return null;
  const status = receipt.status;
  if (status === 0 || status === "0" || status === "0x0" || status === "0x00") return true;
  if (status === 1 || status === "0x1" || status === "0x01") return false;
  if (typeof status === "string" && /^0x0+$/i.test(status)) return true;
  return null;
}
