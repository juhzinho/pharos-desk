import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeRevert, isTxHash, receiptFailed } from "../lib/revert.js";

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
});
