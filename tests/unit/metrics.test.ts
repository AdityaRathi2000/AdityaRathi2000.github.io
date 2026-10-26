// Run with: node --test tests/unit/   (Node ≥ 23.6 strips TypeScript types natively)
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { formatAsOf, formatValue, spokenValue } from "../../src/lib/metrics.ts";

test("percent, with and without qualifiers", () => {
  assert.equal(formatValue({ value: 93, unit: "percent" }), "93%");
  assert.equal(formatValue({ value: 95.1, unit: "percent" }), "95.1%");
  assert.equal(formatValue({ value: 35, unit: "percent", qualifier: "approx" }), "~35%");
  assert.equal(spokenValue({ value: 35, unit: "percent", qualifier: "approx" }), "about 35 percent");
});

test("counts use compact notation from a thousand up", () => {
  assert.equal(formatValue({ value: 4_300_000, unit: "count", qualifier: "approx" }), "~4.3M");
  assert.equal(formatValue({ value: 440_000_000, unit: "count" }), "440M");
  assert.equal(formatValue({ value: 282_000, unit: "count" }), "282K");
  assert.equal(formatValue({ value: 3_200, unit: "count" }), "3.2K");
  assert.equal(formatValue({ value: 8, unit: "count", qualifier: "at_least" }), "8+");
  assert.equal(spokenValue({ value: 4_300_000, unit: "count", qualifier: "approx" }), "about 4.3 million");
});

test("durations switch to seconds at a thousand milliseconds", () => {
  assert.equal(formatValue({ value: 2000, unit: "ms", qualifier: "lt" }), "< 2 s");
  assert.equal(formatValue({ value: 120, unit: "ms" }), "120 ms");
  assert.equal(spokenValue({ value: 2000, unit: "ms", qualifier: "lt" }), "under 2 seconds");
});

test("as_of dates", () => {
  assert.equal(formatAsOf("2026-10"), "Oct 2026");
  assert.equal(formatAsOf("2026-10-26"), "Oct 2026");
  assert.equal(formatAsOf("2022"), "2022");
});
