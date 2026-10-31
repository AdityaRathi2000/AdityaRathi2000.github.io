// The weather model's reliability data (plan P6.T2): only the declared evaluation fields get
// through, every cross-field rule holds, stale exports are flagged, the published JSON Schema is
// the parser's own, and the chart geometry maps probabilities onto the plot.
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { schemaText } from "../../scripts/make-kalshi-schema.mjs";
import { CHART, HIST_TOP, STALE_AFTER_DAYS, VIEW_H, bandPath, curvePath, histBars, liveOnly, parseReliability, sx, sy, withCi } from "../../src/lib/kalshi-reliability.ts";

const FIXTURE = JSON.parse(readFileSync("src/data/kalshi/reliability.fixture.json", "utf8"));
const fresh = () => structuredClone(FIXTURE);
const NOW = new Date(Date.parse(FIXTURE.generated_at) + 3600 * 1000);
const rejects = (mutate: (d: any) => void, why: RegExp | string) => {
  const d = fresh();
  mutate(d);
  assert.throws(() => parseReliability(d, NOW), (e: Error) => (typeof why === "string" ? e.message.includes(why) : why.test(e.message)));
};

test("the fixture parses and says it is a fixture", () => {
  const { data, stale } = parseReliability(fresh(), NOW);
  assert.equal(data.provenance, "fixture");
  assert.equal(stale, false);
});

test("the committed JSON Schema is generated from the parser (run node scripts/make-kalshi-schema.mjs)", () => {
  assert.equal(readFileSync("schemas/kalshi-reliability.schema.json", "utf8"), schemaText());
});

test("fields the schema does not declare are refused, at every level (disclosure rule)", () => {
  rejects((d) => (d.pnl = 120.5), /pnl/);
  rejects((d) => (d.positions = []), /positions/);
  rejects((d) => (d.per_city = [{ city: "Somewhere", ece: 0.02 }]), /per_city/);
  rejects((d) => (d.scores.brier.city = "Somewhere"), /city/);
  rejects((d) => (d.corp_curve[0].timestamp = "2026-09-01T12:00:00Z"), /timestamp/);
  rejects((d) => (d.bootstrap.seed = 7), /seed/);
});

test("provenance and the bootstrap method are closed sets", () => {
  rejects((d) => (d.provenance = "backtest"), /provenance/);
  rejects((d) => (d.bootstrap.method = "iid"), /method/);
});

test("cross-field rules: isotonic curve, band around it, intervals, counts, dates, lag", () => {
  rejects((d) => (d.corp_curve[3].y = d.corp_curve[2].y - 0.05), "isotonic");
  rejects((d) => (d.corp_curve[3].lo = d.corp_curve[3].y + 0.01), "lo <= y <= hi");
  rejects((d) => (d.corp_curve[3].x = d.corp_curve[2].x), "x strictly increasing");
  rejects((d) => (d.scores.brier.value = d.scores.brier.ci[1] + 0.01), "inside its ci");
  rejects((d) => (d.calibration.smooth_ece.value = d.calibration.smooth_ece.ci[0] - 0.001), "inside its ci");
  rejects((d) => (d.histogram[0].count += 1), "sum to n_settled_forecasts");
  // Audit C4: bins must tile [0, 1], with no gap at the start and no zero-width bin at 1.
  rejects((d) => (d.histogram[0].edge = 0.05), "first bin starts at 0");
  rejects((d) => {
    d.histogram.push({ edge: 1, count: 0 });
  }, "last bin starts below 1");
  // One day after as_of: a valid timestamp, but inside the 48-hour embargo.
  rejects((d) => (d.generated_at = new Date(Date.parse(`${d.as_of}T12:00:00Z`) + 24 * 3600 * 1000).toISOString()), "48 hours");
});

test("the case-study page accepts only a live export", () => {
  const parsed = parseReliability(fresh(), NOW);
  assert.throws(() => liveOnly(parsed), /not a live export/);
  // Flipping provenance alone is not enough: the fixture's placeholders are refused (audit round 2).
  const flipped = fresh();
  flipped.provenance = "live";
  assert.throws(() => parseReliability(flipped, NOW), /placeholders/);
  const live = fresh();
  Object.assign(live, { provenance: "live", model_version: "emos-2026.10" });
  live.tests.commit = "a1b2c3d";
  assert.equal(liveOnly(parseReliability(live, NOW)).data.provenance, "live");
});

test("statistical bounds: losses are non-negative, Brier at most 1, skill at most 1, ECE in [0, 1] (audit round 2)", () => {
  rejects((d) => (d.scores.brier = { value: 1.2, ci: [1.1, 1.3] }), /scores.*brier/s);
  rejects((d) => (d.scores.crps = { value: -1, ci: [-2, 0] }), /crps/);
  rejects((d) => (d.scores.log = { value: 0.2, ci: [-0.1, 0.3] }), /log/);
  rejects((d) => (d.skill_vs.climatology = { value: 0.9, ci: [0.8, 1.2] }), /climatology/);
  rejects((d) => (d.calibration.smooth_ece.ci = [-0.01, 0.026]), /smooth_ece/);
  // Negative skill is legitimate (worse than the baseline).
  const d = fresh();
  d.skill_vs.market_implied = { value: -0.4, ci: [-0.6, -0.2] };
  assert.equal(parseReliability(d, NOW).data.skill_vs.market_implied.value, -0.4);
});

test("the CORP decomposition adds up to the Brier score, with unc <= 0.25 and dsc <= unc", () => {
  rejects((d) => (d.calibration.corp_decomposition = { mcb: 0.2, dsc: 0.01, unc: 0.3 }), /unc|equals the Brier/);
  rejects((d) => (d.calibration.corp_decomposition.mcb += 0.01), "equals the Brier score");
  rejects((d) => {
    d.calibration.corp_decomposition = { mcb: 0.004, dsc: 0.2, unc: 0.25 };
    d.scores.brier = { value: 0.054, ci: [0.05, 0.06] };
    d.calibration.corp_decomposition.dsc = 0.3;
    d.calibration.corp_decomposition.mcb = 0.104;
  }, "dsc <= unc");
});

test("coverage fields agree: as_of is the window's end, city-days never exceed forecasts", () => {
  rejects((d) => {
    d.as_of = "2026-08-01";
    d.generated_at = "2026-08-05T00:00:00Z";
  }, "as_of equals window.end");
  rejects((d) => (d.city_days = d.n_settled_forecasts + 1), "city_days <= n_settled_forecasts");
});

test("a future generated_at is refused, beyond five minutes of clock skew", () => {
  const t0 = Date.parse(FIXTURE.generated_at);
  assert.equal(parseReliability(fresh(), new Date(t0 - 4 * 60 * 1000)).stale, false);
  assert.throws(() => parseReliability(fresh(), new Date(t0 - 6 * 60 * 1000)), /in the future/);
});

test(`an export older than ${STALE_AFTER_DAYS} days is stale`, () => {
  const t0 = Date.parse(FIXTURE.generated_at);
  const day = 24 * 3600 * 1000;
  assert.equal(parseReliability(fresh(), new Date(t0 + STALE_AFTER_DAYS * day)).stale, false);
  assert.equal(parseReliability(fresh(), new Date(t0 + STALE_AFTER_DAYS * day + 1000)).stale, true);
});

test("geometry: probabilities map onto the square plot, bins tile the axis", () => {
  assert.equal(sx(0), CHART.left);
  assert.equal(sx(1), CHART.left + CHART.plot);
  assert.equal(sy(1), CHART.top);
  const { data } = parseReliability(fresh(), NOW);
  assert.ok(curvePath(data.corp_curve).startsWith(`M${sx(data.corp_curve[0].x).toFixed(1)} `));
  // The band runs along hi left to right, back along lo, and closes (audit round 2).
  const two = [
    { x: 0.2, y: 0.25, lo: 0.2, hi: 0.3 },
    { x: 0.8, y: 0.75, lo: 0.7, hi: 0.8 },
  ];
  const p = (x: number, y: number) => `${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`;
  assert.equal(bandPath(two), `M${p(0.2, 0.3)} L${p(0.8, 0.8)} L${p(0.8, 0.7)} L${p(0.2, 0.2)} Z`);
  const bars = histBars(data.histogram);
  assert.equal(bars.length, data.histogram.length);
  assert.equal(bars.at(-1)!.to, 1);
  assert.ok(Math.abs(bars.reduce((s, b) => s + b.w + 1, 0) - CHART.plot) < 1e-6);
  assert.equal(Math.max(...bars.map((b) => b.hgt)), CHART.histH);
  // Every bar sits inside the drawing, below the plot.
  for (const b of bars) assert.ok(b.y >= HIST_TOP && b.y + b.hgt <= VIEW_H, JSON.stringify(b));
  assert.ok(sy(0) < HIST_TOP);
});

test("withCi prints a value with its interval", () => {
  assert.equal(withCi({ value: 0.0712, ci: [0.066, 0.0771] }), "0.071 (0.066 to 0.077)");
  assert.equal(withCi({ value: 0.41, ci: [0.37, 0.45] }, 2), "0.41 (0.37 to 0.45)");
});
