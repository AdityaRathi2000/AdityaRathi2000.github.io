/*
  The CVI page's entity-resolution explorer (plan P6.T1), as pure maths: shared by the
  server-rendered default state (src/components/er/ErExplorer.astro) and the client driver
  (src/scripts/er-explorer.ts). No DOM here, so it is unit-tested directly
  (tests/unit/er-explorer.test.ts).

  The data is synthetic (public/data/er-sample.json, made by scripts/make-er-sample.mjs);
  the mechanism is the pipeline's:
    blocking     only pairs that share the chosen key are compared
    similarity   pairs at or above the threshold merge on the score alone
    judgement    pairs in the band just below it go to the judge (a rule standing in for the LLM)
    clustering   accepted pairs join records into organisations (connected components, so one
                 wrong link can chain two organisations together)
  The synthetic world holds training providers and some look-alike businesses (a bookstore in
  the same town); together they are the "organisations" the answer key counts.
*/

export interface ErRecord {
  id: string;
  name: string;
  city: string | null;
  state: string;
  src: string;
  /** One value per blocking key, in the order of `keys`; null means the record has no block for that key. */
  block_keys: (string | null)[];
}

/** [i, j, similarity in hundredths, judge verdict 1 or 0]. */
export type ErPair = [number, number, number, 0 | 1];

export interface ErSample {
  meta: { synthetic: true; seed: number; version: number; generator: string; note: string };
  keys: { id: string; label: string }[];
  sim_floor: number;
  band: number;
  records: ErRecord[];
  pairs: ErPair[];
  truth: { cluster_of: number[]; business_clusters: number[] };
}

/** Slider range for the auto-merge threshold, in hundredths. */
export const THRESHOLD = { min: 55, max: 95, step: 1, initial: 85 } as const;
export const INITIAL_KEY = 0;
/** Histogram buckets: organisations holding 1, 2, … records; the last bucket is "this many or more". */
export const HIST_MAX = 6;

/** Rejects anything that is not a well-formed synthetic sample: the page never renders unlabelled data. */
export function parseSample(raw: unknown): ErSample {
  const s = raw as ErSample;
  const fail = (why: string): never => {
    throw new Error(`er-sample.json: ${why}`);
  };
  if (!s || typeof s !== "object") fail("not an object");
  if (s.meta?.synthetic !== true) fail("meta.synthetic must be true");
  if (!Array.isArray(s.keys) || s.keys.length === 0) fail("no blocking keys");
  if (!Array.isArray(s.records) || !Array.isArray(s.pairs)) fail("records and pairs must be arrays");
  const n = s.records.length;
  for (const r of s.records) if (!Array.isArray(r.block_keys) || r.block_keys.length !== s.keys.length) fail(`record ${r.id}: one block key per key`);
  if (s.truth?.cluster_of?.length !== n) fail("truth.cluster_of must have one entry per record");
  if (!Array.isArray(s.truth.business_clusters)) fail("truth.business_clusters must be an array");
  for (const p of s.pairs) {
    const [i, j, sim, v] = p;
    if (!(Number.isInteger(i) && Number.isInteger(j) && i >= 0 && i < j && j < n)) fail(`bad pair ${JSON.stringify(p)}`);
    if (!(Number.isInteger(sim) && sim >= s.sim_floor && sim <= 100) || (v !== 0 && v !== 1)) fail(`bad pair ${JSON.stringify(p)}`);
  }
  if (THRESHOLD.min - s.band < s.sim_floor) fail("the lowest LLM band reaches below sim_floor, where pairs were not stored");
  return s;
}

const pairsOf = (k: number) => (k * (k - 1)) / 2;

class UnionFind {
  parent: Int32Array;
  constructor(n: number) {
    this.parent = Int32Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

/** Groups of record indices, largest first (ties: lowest first index). */
export function groups(labels: ArrayLike<number>): number[][] {
  const by = new Map<number, number[]>();
  for (let i = 0; i < labels.length; i++) {
    const g = by.get(labels[i]);
    if (g) g.push(i);
    else by.set(labels[i], [i]);
  }
  return [...by.values()].sort((a, b) => b.length - a.length || a[0] - b[0]);
}

/**
 * Pairwise precision and recall of a clustering against the answer key: a pair of records is
 * "predicted" when they share a cluster, "true" when they are the same organisation. Precision is
 * null when nothing merged (no predicted pairs to be right or wrong about).
 */
export function pairwise(pred: ArrayLike<number>, truth: ArrayLike<number>): { precision: number | null; recall: number; tp: number; predicted: number; actual: number } {
  const joint = new Map<string, number>();
  const p = new Map<number, number>();
  const t = new Map<number, number>();
  for (let i = 0; i < pred.length; i++) {
    const key = `${pred[i]}|${truth[i]}`;
    joint.set(key, (joint.get(key) ?? 0) + 1);
    p.set(pred[i], (p.get(pred[i]) ?? 0) + 1);
    t.set(truth[i], (t.get(truth[i]) ?? 0) + 1);
  }
  const sum = (m: Map<unknown, number>) => [...m.values()].reduce((s, c) => s + pairsOf(c), 0);
  const tp = sum(joint);
  const predicted = sum(p);
  const actual = sum(t);
  return { precision: predicted ? tp / predicted : null, recall: actual ? tp / actual : 1, tp, predicted, actual };
}

/** Counts of groups by size: index 0 holds singletons, the last index everything of HIST_MAX or more. */
export function histogram(gs: number[][]): number[] {
  const h = new Array(HIST_MAX).fill(0);
  for (const g of gs) h[Math.min(g.length, HIST_MAX) - 1]++;
  return h;
}

export interface ErResult {
  key: number;
  threshold: number;
  /** The judge's band: [low, threshold). */
  bandLow: number;
  /**
   * Not a straight funnel: the considered pairs split in two. Every row is at most its parent:
   * considered = autoMerged + sentToJudge, and judgeMerged <= sentToJudge.
   */
  funnel: {
    allPairs: number;
    compared: number;
    considered: number;
    autoMerged: number;
    sentToJudge: number;
    judgeMerged: number;
  };
  /** Organisations found (clusters) and in the answer key. */
  found: number;
  trueCount: number;
  /** Of trueCount, how many are look-alike businesses rather than training providers. */
  trueBusinesses: number;
  precision: number | null;
  recall: number;
  /** Judge calls per compared pair: the cost proxy. */
  judgeShare: number;
  hist: number[];
  trueHist: number[];
  /** Record indices of the largest merged group, and which of them belong to its main true organisation. */
  largest: { members: number[]; correct: boolean[]; trueInside: number };
}

export function evaluate(s: ErSample, key: number, threshold: number): ErResult {
  const n = s.records.length;
  const bandLow = threshold - s.band;

  // Compared pairs: every pair inside each block of this key.
  const blockSize = new Map<string, number>();
  for (const r of s.records) {
    const b = r.block_keys[key];
    if (b !== null) blockSize.set(b, (blockSize.get(b) ?? 0) + 1);
  }
  let compared = 0;
  for (const c of blockSize.values()) compared += pairsOf(c);

  const uf = new UnionFind(n);
  let considered = 0;
  let autoMerged = 0;
  let sentToJudge = 0;
  let judgeMerged = 0;
  for (const [i, j, sim, verdict] of s.pairs) {
    const b = s.records[i].block_keys[key];
    if (b === null || b !== s.records[j].block_keys[key] || sim < bandLow) continue;
    considered++;
    if (sim >= threshold) {
      autoMerged++;
      uf.union(i, j);
    } else {
      sentToJudge++;
      if (verdict) {
        judgeMerged++;
        uf.union(i, j);
      }
    }
  }

  const labels = Int32Array.from({ length: n }, (_, i) => uf.find(i));
  const truth = s.truth.cluster_of;
  const gs = groups(labels);
  const trueGs = groups(truth);
  const { precision, recall } = pairwise(labels, truth);

  const members = gs[0] ?? [];
  const main = groups(members.map((i) => truth[i]))[0] ?? [];
  const mainProvider = main.length ? truth[members[main[0]]] : -1;

  return {
    key,
    threshold,
    bandLow,
    funnel: { allPairs: pairsOf(n), compared, considered, autoMerged, sentToJudge, judgeMerged },
    found: gs.length,
    trueCount: trueGs.length,
    trueBusinesses: s.truth.business_clusters.length,
    precision,
    recall,
    judgeShare: compared ? sentToJudge / compared : 0,
    hist: histogram(gs),
    trueHist: histogram(trueGs),
    largest: {
      members,
      correct: members.map((i) => truth[i] === mainProvider),
      trueInside: new Set(members.map((i) => truth[i])).size,
    },
  };
}

/** Similarity in hundredths as shown: 80 -> "0.80". */
export const sim = (h: number) => (h / 100).toFixed(2);

// ---------- Text, shared by the server render and the driver so both print the same ----------

const count = new Intl.NumberFormat("en-US");
export const fmtCount = (n: number) => count.format(n);
export const fmtScore = (x: number | null) => (x === null ? "–" : x.toFixed(2));
export const fmtJudgeShare = (r: ErResult) => (100 * r.judgeShare).toFixed(1);
export const bucketLabel = (i: number) => (i === HIST_MAX - 1 ? `${HIST_MAX}+` : String(i + 1));

/** Funnel bar length, percent of the full width, on a log scale (the stages span four orders of magnitude). */
export const logWidth = (v: number, all: number) => (100 * Math.log10(v + 1)) / Math.log10(all + 1);

export const placeOf = (rec: Pick<ErRecord, "city" | "state" | "src">) => `${rec.city ?? "no town"}, ${rec.state} · ${rec.src}`;

export function largestNote(r: ErResult): string {
  const n = r.largest.members.length;
  const k = r.largest.trueInside;
  return k === 1 ? `${n} records, all one true organisation` : `${n} records from ${k} true organisations`;
}

export const histDesc = (r: ErResult) =>
  r.hist.map((c, i) => `${c} ${c === 1 ? "organisation" : "organisations"} with ${bucketLabel(i)} ${i === 0 ? "record" : "records"}`).join(", ") + ".";

export function summaryText(s: ErSample, r: ErResult): string {
  return `${s.keys[r.key].label}, merging at ${sim(r.threshold)}: ${fmtCount(r.found)} organisations found (${fmtCount(r.trueCount)} true), precision ${fmtScore(r.precision)}, recall ${fmtScore(r.recall)}, ${fmtCount(r.funnel.sentToJudge)} judge calls.`;
}

/** Histogram geometry in viewBox units, shared by the server render and the driver. */
export const HIST = { w: 300, h: 164, base: 120, top: 18 } as const;
export const histBarHeight = (c: number, yMax: number) => ((HIST.base - HIST.top) * c) / yMax;
/** The count sits above whichever is taller, the bar or the truth outline. */
export const histLabelY = (r: ErResult, i: number, yMax: number) => HIST.base - Math.max(histBarHeight(r.hist[i], yMax), histBarHeight(r.trueHist[i], yMax)) - 5;
