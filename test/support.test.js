import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeRevert, functionName, isTxHash, outOfGas, plainReason, reasonFromMessage, receiptFailed, revertDataFromError } from "../lib/revert.js";

test("tx hash shape", () => {
  assert.equal(isTxHash("0x" + "ab".repeat(32)), true);
  assert.equal(isTxHash("0x123"), false);
});

test("receiptFailed reads status 0 and 1", () => {
  assert.equal(receiptFailed({ status: 0 }), true);
  assert.equal(receiptFailed({ status: "0x0" }), true);
  assert.equal(receiptFailed({ status: 1 }), false);
  assert.equal(receiptFailed(null), null);
});

test("decodeRevert Error(string)", () => {
  const data = "0x08c379a000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000016696e73756666696369656e7420616c6c6f77616e636500000000000000000000";
  const got = decodeRevert(data);
  assert.equal(got.kind, "error");
  assert.equal(got.text, "insufficient allowance");
  assert.match(plainReason(got, "pt"), /permissão suficiente/);
});

test("revert payload is not the first address in a node error", () => {
  const data = "0x08c379a000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000016696e73756666696369656e7420616c6c6f77616e636500000000000000000000";
  const noisy = `eth_call falhou: {"from":"0x912c9ade24d44d8922f0866d8dcb079f1363f647","data":"${data}"}`;
  const picked = revertDataFromError(noisy);
  assert.equal(decodeRevert(picked).text, "insufficient allowance");
  assert.equal(reasonFromMessage("execution reverted: insufficient allowance").text, "insufficient allowance");
});

test("panic overflow is a sentence", () => {
  const data = "0x4e487b710000000000000000000000000000000000000000000000000000000000000011";
  const got = decodeRevert(data);
  assert.equal(got.kind, "panic");
  assert.equal(got.code, 17);
  assert.match(plainReason(got, "pt"), /estourou o limite/);
  assert.match(plainReason(got, "es"), /límite/);
  assert.match(plainReason(got, "en"), /overflowed/);
});

test("out of gas and known calls", () => {
  assert.equal(outOfGas("0x5208", "0x5208"), true);
  assert.equal(outOfGas("0x5208", "0x10000"), false);
  assert.equal(receiptFailed({ status: "0x1" }), false);
  assert.equal(receiptFailed({ status: "0x00" }), true);
  assert.match(functionName("0xa9059cbb" + "00".repeat(64), "pt"), /transferência/);
});
