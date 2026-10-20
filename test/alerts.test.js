import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeSlot0, inputSelector, normalizeSelector, parseMin, parseMode, parseThreshold, pickTransfers, priceCrossed, priceJustCrossed, resolveToken, sqrtToPrice, wprosUsdcPrice } from "../lib/alerts.js";
import { alertText, channelsFromEnv, deliver, freshAlerts, remember } from "../lib/notify.js";
import { formatWatchList, parseFollowUp, parseHome, parseLangChoice, parseTelegramCommand } from "../lib/telegram.js";
import { formatProsCard, prosFromCmc, renderPriceChart } from "../lib/pros.js";
import { PACIFIC } from "../lib/tokens.js";

test("resolveToken USDC and 0x", () => {
  assert.equal(resolveToken("USDC").address, PACIFIC.USDC.address);
  assert.equal(resolveToken("nope").error, "unknown-token");
});

test("parseMin uses token decimals", () => {
  const min = parseMin(PACIFIC.USDC, "50");
  assert.equal(min.wei, 50_000_000n);
});

test("price crosses only on the chosen side", () => {
  assert.equal(priceCrossed(0.08, 0.05, "above"), true);
  assert.equal(priceCrossed(0.02, 0.05, "above"), false);
  assert.equal(priceCrossed(0.02, 0.05, "below"), true);
});

test("a blank price is rejected and does not become zero", () => {
  assert.equal(parseThreshold("").error, "bad-price");
  assert.equal(parseThreshold("  ").error, "bad-price");
  assert.equal(parseThreshold("0.05").value, 0.05);
});

test("a price alert fires on the cross, not while it is already past the line", () => {
  assert.equal(priceJustCrossed(null, 0.63, 0.5, "above"), false);
  assert.equal(priceJustCrossed(0.63, 0.64, 0.5, "above"), false);
  assert.equal(priceJustCrossed(0.49, 0.63, 0.5, "above"), true);
  assert.equal(priceJustCrossed(0.7, 0.4, 0.5, "below"), true);
});

test("a call selector is the first 4 bytes", () => {
  assert.equal(inputSelector("0x128acb08abcd"), "0x128acb08");
  assert.equal(normalizeSelector("128acb08"), "0x128acb08");
  assert.equal(normalizeSelector("0x12").error, "bad-selector");
});

test("mode is one of transfer, price, call", () => {
  assert.equal(parseMode("price"), "price");
  assert.equal(parseMode("nope").error, "bad-mode");
});

test("price is USDC per WPROS on either token order", () => {
  const straight = wprosUsdcPrice((1n << 96n) / 1_000_000n, PACIFIC.WPROS.address, PACIFIC.USDC.address);
  const flipped = wprosUsdcPrice((1n << 96n) * 1_000_000n, PACIFIC.USDC.address, PACIFIC.WPROS.address);
  assert.ok(Math.abs(straight - 1) < 0.001);
  assert.ok(Math.abs(flipped - 1) < 0.001);
  assert.equal(wprosUsdcPrice(1n << 96n, PACIFIC.LINK.address, PACIFIC.USDC.address), null);
});

test("slot0 word becomes a finite USDC price", () => {
  const sqrt = (1n << 96n) / 1_000_000n;
  const hex = `0x${sqrt.toString(16).padStart(64, "0")}`;
  const price = sqrtToPrice(decodeSlot0(hex));
  assert.ok(Math.abs(price - 1) < 0.0001);
});

test("the same event is not sent twice, and a price alert can fire again after it clears", () => {
  const alert = { id: "tf:0xabc:1", kind: "transfer", line: "Large transfer", value: "80 USDC", link: "https://www.pharosscan.xyz/tx/0xabc" };
  const price = { id: "price:above:0.01", kind: "price", line: "price", value: "0.08 USDC", link: "https://www.pharosscan.xyz/address/0x1" };
  assert.equal(freshAlerts([alert], []).length, 1);
  const seen = remember([], [alert, price], [price.id]);
  assert.equal(freshAlerts([alert, price], seen).length, 0);
  const cleared = remember(seen, [], []);
  assert.equal(cleared.includes(price.id), false);
  assert.match(alertText(alert), /80 USDC/);
  assert.match(alertText(alert), /pharosscan\.xyz\/tx\/0xabc/);
});

test("discord delivery posts the alert text", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, body: opts.body });
    return { ok: true };
  };
  const alert = { id: "tf:1", line: "Large transfer", value: "80 USDC", link: "https://www.pharosscan.xyz/tx/0x1" };
  const none = await deliver([alert], {}, fetchImpl);
  assert.equal(none.delivered, false);
  const sent = await deliver([alert], { DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/1/x" }, fetchImpl);
  assert.equal(sent.sent, 1);
  assert.deepEqual(channelsFromEnv({ DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/1/x" }), ["discord"]);
  assert.match(calls[0].body, /80 USDC/);
});

test("telegram commands match the site scans", () => {
  assert.equal(parseTelegramCommand("/start").kind, "help");
  assert.equal(parseTelegramCommand("/transfer USDC 50").mode, "transfer");
  assert.equal(parseTelegramCommand("/price").kind, "ask-price");
  assert.equal(parseTelegramCommand("/price 0.05 abaixo").side, "below");
  assert.equal(parseTelegramCommand("/price above 0.62").side, "above");
  assert.equal(parseTelegramCommand("/price 0.62").kind, "ask-side");
  assert.equal(parseFollowUp("0.62", { step: "price" }).kind, "ask-side");
  assert.equal(parseFollowUp("0,70", { step: "price" }).price, "0.70");
  assert.equal(parseHome("Menu").kind, "help");
  assert.equal(parseFollowUp("abaixo", { step: "side", price: "0.62" }).side, "below");
  assert.equal(parseTelegramCommand("/transfer").kind, "ask-transfer");
  assert.equal(parseFollowUp("USDC 50", { step: "transfer" }).min, "50");
  assert.equal(parseTelegramCommand("/call 0xabc 0x128acb08").selector, "0x128acb08");
  assert.equal(parseTelegramCommand("oi"), null);
  assert.equal(parseLangChoice("Español").lang, "es");
  assert.equal(parseTelegramCommand("/list").kind, "list");
  assert.equal(parseTelegramCommand("/cancel 2").id, 2);
  assert.equal(parseTelegramCommand("/edit 3").kind, "edit");
  assert.match(formatWatchList([{ mode: "price", side: "below", threshold: 0.63 }, { mode: "transfer", token: "USDC", min: "1000" }, { mode: "call" }], "pt"), /abaixo de 0\.63 USDC/);
  const card = formatProsCard(prosFromCmc({
    data: {
      name: "Pharos",
      symbol: "PROS",
      volume: 4921888.94,
      statistics: {
        price: 0.628173,
        priceChangePercentage1h: -0.54,
        priceChangePercentage24h: -1.2,
        priceChangePercentage7d: 4.66,
        marketCap: 85180263.37,
        fullyDilutedMarketCap: 628173033.73,
        circulatingSupply: 135600000,
        totalSupply: 1000000000,
      },
    },
  }, { ethUsd: 3300, chart: { data: { points: { a: { v: [0.62, 1, 2, 0.0000077] }, b: { v: [0.63, 1, 2, 0.0000078] } } } } }), "pt");
  assert.match(card, /Market cap: US\$ 85\.180\.263,37/);
  assert.match(card, /Volume: US\$ 4\.921\.888,94/);
  assert.match(card, /Em circulação: 135\.600\.000 PROS/);
  assert.match(card, /Variação 1h:/);
  assert.match(card, /Variação 7d:/);
  assert.equal(renderPriceChart([0.62, 0.63, 0.61]).slice(0, 4).toString("hex"), "89504e47");
  assert.equal(parseTelegramCommand("/pros").kind, "pros");
  assert.equal(parseLangChoice("/lang").kind, "ask-lang");
  assert.equal(parseFollowUp("abajo", { step: "side", price: "0.62" }).side, "below");
});

test("pickTransfers keeps only legs at or above min", () => {
  const got = pickTransfers([
    { value: 10n, tx: "a" },
    { value: 50_000_000n, tx: "b" },
    { value: 90_000_000n, tx: "c" },
  ], 50_000_000n);
  assert.deepEqual(got.map((t) => t.tx), ["b", "c"]);
});
