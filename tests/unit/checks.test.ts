// The content checks must pass on good input and fail on bad input.
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const run = (script: string, args: string[]) => spawnSync("node", [script, ...args], { encoding: "utf8" });

test("literal numbers: names, years, comments, code and <Metric> pass", () => {
  const r = run("scripts/check-no-literal-numbers.mjs", ["tests/fixtures/numbers/good"]);
  assert.equal(r.status, 0, r.stderr);
});

test("literal numbers: bare numbers in prose and summary fail, with locations", () => {
  const r = run("scripts/check-no-literal-numbers.mjs", ["tests/fixtures/numbers/bad"]);
  assert.equal(r.status, 1);
  for (const token of ['"600M"', '"~35%"', '"20"', '"1.8"']) assert.match(r.stderr, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(r.stderr, /bad\.mdx:6:/);
});

test("résumé: a pdf_text the PDF does not contain fails", () => {
  const r = run("scripts/check-resume.mjs", ["--metrics", "tests/fixtures/resume/wrong-metrics.yaml"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /invented-one/);
  assert.doesNotMatch(r.stderr, /real-one/);
});
