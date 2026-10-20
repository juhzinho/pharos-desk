import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeAnswer, presentStep, STEPS } from "../lib/onboard.js";

test("broke when docs found nothing", () => {
  assert.equal(gradeAnswer({ found: false, answer: "No relevant information.", sources: [] }), "broke");
});

test("thin when there is text but no source page", () => {
  assert.equal(gradeAnswer({ found: true, answer: "You just connect it somehow.", sources: [] }), "thin");
});

test("ok when there is a source", () => {
  assert.equal(gradeAnswer({
    found: true,
    answer: "Use the hosted Chain MCP at https://mcp.pharos.xyz/mcp.",
    sources: [{ title: "MCP", url: "https://docs.pharos.xyz/x" }],
  }), "ok");
});

test("a sourced answer that admits the page is missing is a breakdown", () => {
  assert.equal(gradeAnswer({
    found: true,
    answer: "I cannot find a Developer Docs MCP endpoint exposing askQuestion in the docs.",
    sources: [{ title: "Pharos MCP", url: "https://docs.pharos.xyz/tooling-and-infrastructure/mcp" }],
  }), "broke");
  assert.equal(gradeAnswer({
    found: true,
    answer: "They don’t document `ai.pharos.xyz` as the getting-started entry point.",
    sources: [{ title: "Anvita Flow", url: "https://docs.pharos.xyz/x" }],
  }), "broke");
  assert.equal(gradeAnswer({
    found: true,
    answer: "This is the Pharos chain-data MCP, not a Developer Docs MCP.",
    sources: [{ title: "Pharos MCP", url: "https://docs.pharos.xyz/tooling-and-infrastructure/mcp" }],
  }), "broke");
});

test("a breakdown keeps the exact query and a doc fix", () => {
  const view = presentStep(STEPS[0], { found: false, answer: "", sources: [] }, [], "en");
  assert.equal(view.grade, "broke");
  assert.equal(view.query, "How do I get started on ai.pharos.xyz?");
  assert.match(view.fix, /ai\.pharos\.xyz/);
});
