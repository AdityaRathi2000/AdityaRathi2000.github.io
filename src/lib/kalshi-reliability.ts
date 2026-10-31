/*
  The weather model's reliability summary (plan P6.T2): the one shape of data the site accepts
  from the forecasting system, and the geometry of its chart. Pure; unit-tested in
  tests/unit/kalshi-reliability.test.ts.

  This parser is the single source of truth. schemas/kalshi-reliability.schema.json, the
  contract the phase-7 exporter validates against before it writes anything, is generated from
  it (node scripts/make-kalshi-schema.mjs) and a unit test fails if the two drift.

  Disclosure (plan §4): evaluation only. Every object is strict, so a field the schema does not
  name (profit, positions, sizes, a city, a timestamp per forecast) fails the build instead of
  reaching a page. `provenance` separates the fixture from real results: the case-study page
  renders only "live" data (src/components/kalshi/KalshiResult.astro).
*/
import { z } from "astro/zod";

const unit = z.number().min(0).max(1);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const bounded = (lo?: number, hi?: number) => {
  let n = z.number();
  if (lo !== undefined) n = n.min(lo);
  if (hi !== undefined) n = n.max(hi);
  return n;
};
const estimateIn = (lo?: number, hi?: number) =>
  z
    .strictObject({ value: bounded(lo, hi), ci: z.tuple([bounded(lo, hi), bounded(lo, hi)]) })
    .refine((e) => e.ci[0] <= e.ci[1], "ci is [low, high]")
    .refine((e) => e.ci[0] <= e.value && e.value <= e.ci[1], "value lies inside its ci");
/** Means of non-negative per-forecast losses (CRPS, log loss): never below zero, no upper bound. */
const loss = estimateIn(0);
/** A skill score 1 - S / S_baseline can be any negative number but never exceeds 1 (S >= 0). */
const skill = estimateIn(undefined, 1);

export const Reliability = z
  .strictObject({
    schema_version: z.literal(1),
    /** "fixture": made-up numbers for building the chart; "live": exported from the forecast log. */
    provenance: z.enum(["fixture", "live"]),
    generated_at: z.iso.datetime({ offset: true }),
    /** Last settlement date included; at least 48 hours before generated_at. */
    as_of: date,
    /** Settlement dates evaluated; window.end is as_of. */
    window: z.strictObject({ start: date, end: date }),
    model_version: z.string().min(1).max(40),
    n_settled_forecasts: z.number().int().positive(),
    /** Distinct (city, settlement date) pairs with at least one settled forecast, so never more than n_settled_forecasts. */
    city_days: z.number().int().positive(),
    /** CORP (isotonic, PAV) reliability curve with its block-bootstrap band. */
    corp_curve: z
      .array(z.strictObject({ x: unit, y: unit, lo: unit, hi: unit }))
      .min(2)
      .max(100),
    /** Forecast count per probability bin; `edge` is the bin's left edge. */
    histogram: z
      .array(z.strictObject({ edge: unit, count: z.number().int().min(0) }))
      .min(1)
      .max(20),
    /** All three are lower-is-better: Brier score, CRPS, and log loss (mean negative log-likelihood). */
    scores: z.strictObject({ brier: estimateIn(0, 1), crps: loss, log: loss }),
    /** CRPS skill score against each baseline: 1 - CRPS / baseline CRPS (above zero beats the baseline). */
    skill_vs: z.strictObject({ climatology: skill, nwp_only: skill, market_implied: skill }),
    calibration: z.strictObject({
      smooth_ece: z.strictObject({ value: unit, ci: z.tuple([unit, unit]), definition: z.string().min(10).max(300) }),
      /** CORP decomposition of the Brier score: brier = mcb - dsc + unc, with unc = p(1 - p) <= 0.25 and dsc <= unc. */
      corp_decomposition: z.strictObject({ mcb: z.number().min(0), dsc: z.number().min(0), unc: z.number().min(0).max(0.25) }),
    }),
    bootstrap: z.strictObject({ method: z.literal("block-by-date"), resamples: z.number().int().min(100) }),
    gate_status: z.enum(["pass", "fail"]),
    tests: z.strictObject({ count: z.number().int().min(0), commit: z.string().regex(/^[0-9a-f]{7,40}$/) }),
  })
  .superRefine((r, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const c = r.corp_curve;
    for (let i = 0; i < c.length; i++) {
      if (!(c[i].lo <= c[i].y && c[i].y <= c[i].hi)) issue(["corp_curve", i], "lo <= y <= hi");
      if (i > 0 && !(c[i].x > c[i - 1].x)) issue(["corp_curve", i, "x"], "x strictly increasing");
      // PAV output is monotone: observed frequency never falls as the forecast rises.
      if (i > 0 && c[i].y < c[i - 1].y) issue(["corp_curve", i, "y"], "isotonic: y non-decreasing");
    }
    const h = r.histogram;
    // The bins tile [0, 1]: the first starts at 0 and the last (which runs to 1) starts below 1.
    if (h[0].edge !== 0) issue(["histogram", 0, "edge"], "the first bin starts at 0");
    if (!(h[h.length - 1].edge < 1)) issue(["histogram", h.length - 1, "edge"], "the last bin starts below 1");
    for (let i = 1; i < h.length; i++) if (!(h[i].edge > h[i - 1].edge)) issue(["histogram", i, "edge"], "edges strictly increasing");
    if (h.reduce((s, b) => s + b.count, 0) !== r.n_settled_forecasts) issue(["histogram"], "counts sum to n_settled_forecasts");
    if (r.window.start > r.window.end) issue(["window"], "start <= end");
    if (r.as_of !== r.window.end) issue(["as_of"], "as_of equals window.end (the last settlement date included)");
    if (r.city_days > r.n_settled_forecasts) issue(["city_days"], "city_days <= n_settled_forecasts");
    // Placeholders belong to the fixture only.
    if (r.provenance === "live" && (r.model_version === "fixture" || /^0+$/.test(r.tests.commit))) {
      issue(["provenance"], "a live export carries a real model version and commit, not the fixture's placeholders");
    }
    const lagMs = Date.parse(r.generated_at) - Date.parse(`${r.as_of}T23:59:59Z`);
    if (!(lagMs >= 48 * 3600 * 1000)) issue(["as_of"], "data lags generated_at by at least 48 hours");
    const e = r.calibration.smooth_ece;
    if (!(e.ci[0] <= e.value && e.value <= e.ci[1])) issue(["calibration", "smooth_ece"], "value lies inside its ci");
    const { mcb, dsc, unc } = r.calibration.corp_decomposition;
    // Exact for the empirical score; the tolerance covers rounding of four three-decimal numbers.
    if (Math.abs(mcb - dsc + unc - r.scores.brier.value) > 2e-3) issue(["calibration", "corp_decomposition"], "mcb - dsc + unc equals the Brier score");
    if (dsc > unc) issue(["calibration", "corp_decomposition", "dsc"], "dsc <= unc");
  });

export type ReliabilityData = z.infer<typeof Reliability>;

/** The page shows "stale as of <date>" when the export is older than this (plan §4). */
export const STALE_AFTER_DAYS = 7;

/** Clock skew tolerated between the exporting host and the build. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export function parseReliability(raw: unknown, now: Date): { data: ReliabilityData; stale: boolean } {
  const data = Reliability.parse(raw);
  const ageMs = now.getTime() - Date.parse(data.generated_at);
  if (ageMs < -FUTURE_SKEW_MS) throw new Error(`kalshi reliability: generated_at ${data.generated_at} is in the future`);
  return { data, stale: ageMs > STALE_AFTER_DAYS * 24 * 3600 * 1000 };
}

/** The case-study page's guard: the fixture never renders there, even if copied to the live path. */
export function liveOnly<T extends { data: ReliabilityData }>(parsed: T): T {
  if (parsed.data.provenance !== "live") {
    throw new Error('src/data/kalshi/reliability.json is not a live export (provenance must be "live"); the fixture never goes on the case-study page.');
  }
  return parsed;
}

// ---------- Chart geometry (viewBox units) ----------

export const CHART = { w: 360, left: 50, top: 12, plot: 300, histH: 56, gap: 18 } as const;
/** Bottom of the reliability square; the histogram hangs below it. */
export const PLOT_BOTTOM = CHART.top + CHART.plot;
export const HIST_TOP = PLOT_BOTTOM + CHART.gap + 22;
/** Full height of the drawing: the histogram and its label sit inside it. */
export const VIEW_H = HIST_TOP + CHART.histH + 26;

export const sx = (p: number) => CHART.left + p * CHART.plot;
export const sy = (p: number) => PLOT_BOTTOM - p * CHART.plot;
const f = (n: number) => n.toFixed(1);

export function curvePath(c: ReliabilityData["corp_curve"]): string {
  return c.map((k, i) => `${i ? "L" : "M"}${f(sx(k.x))} ${f(sy(k.y))}`).join(" ");
}

export function bandPath(c: ReliabilityData["corp_curve"]): string {
  const upper = c.map((k, i) => `${i ? "L" : "M"}${f(sx(k.x))} ${f(sy(k.hi))}`);
  const lower = [...c].reverse().map((k) => `L${f(sx(k.x))} ${f(sy(k.lo))}`);
  return `${upper.join(" ")} ${lower.join(" ")} Z`;
}

/** Histogram bars: each bin runs from its edge to the next edge (the last one to 1). */
export function histBars(h: ReliabilityData["histogram"]): { x: number; w: number; y: number; hgt: number; count: number; from: number; to: number }[] {
  const max = Math.max(1, ...h.map((b) => b.count));
  return h.map((b, i) => {
    const to = h[i + 1]?.edge ?? 1;
    const hgt = (CHART.histH * b.count) / max;
    return { x: sx(b.edge) + 0.5, w: Math.max(0, sx(to) - sx(b.edge) - 1), y: HIST_TOP + CHART.histH - hgt, hgt, count: b.count, from: b.edge, to };
  });
}

/** "0.071 (0.064 to 0.078)": a value with its interval, at the precision the value needs. */
export function withCi(e: { value: number; ci: [number, number] }, digits = 3): string {
  return `${e.value.toFixed(digits)} (${e.ci[0].toFixed(digits)} to ${e.ci[1].toFixed(digits)})`;
}
