// The CVI explorer (plan P6.T1): the committed sample is exactly what the generator makes, it is
// labelled synthetic and within budget, the judge reads records the way the page says it does,
// and the funnel and scores follow the mechanism (src/lib/er-explorer.ts).
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { judge, makeSample, serialise, similarity } from "../../scripts/make-er-sample.mjs";
import { THRESHOLD, evaluate, histogram, pairwise, parseSample, type ErSample } from "../../src/lib/er-explorer.ts";

const FILE = "public/data/er-sample.json";
const committed = readFileSync(FILE, "utf8");
const sample = parseSample(JSON.parse(committed));

test("the committed sample is what the generator makes (run node scripts/make-er-sample.mjs)", () => {
  assert.equal(committed, serialise(makeSample()));
});

test("the answer key says which organisations are look-alike businesses (audit G3)", () => {
  const clusters = new Set(sample.truth.cluster_of);
  assert.ok(sample.truth.business_clusters.length > 0);
  for (const b of sample.truth.business_clusters) assert.ok(clusters.has(b));
  for (const b of sample.truth.business_clusters) {
    const names = sample.records.filter((_, i) => sample.truth.cluster_of[i] === b).map((r) => r.name.toLowerCase());
    // Its canonical listing names the business (other listings may be acronyms, e.g. "BB").
    assert.ok(names.some((n) => /bookstore|repair|supply|library/.test(n)), names.join(" | "));
  }
});

test("the sample is labelled synthetic and fits the plan's 30 KB gzip budget", () => {
  assert.equal(sample.meta.synthetic, true);
  assert.ok(gzipSync(committed, { level: 9 }).length <= 30 * 1024);
  assert.ok(sample.records.length >= 250 && sample.records.length <= 320, `${sample.records.length} records`);
});

test("parseSample refuses unlabelled or malformed data", () => {
  const copy = () => JSON.parse(committed) as ErSample;
  const unlabelled = copy();
  (unlabelled.meta as { synthetic: boolean }).synthetic = false;
  assert.throws(() => parseSample(unlabelled), /synthetic/);
  const badPair = copy();
  badPair.pairs[0] = [5, 2, 90, 1];
  assert.throws(() => parseSample(badPair), /bad pair/);
  const shortTruth = copy();
  shortTruth.truth.cluster_of.pop();
  assert.throws(() => parseSample(shortTruth), /cluster_of/);
});

const rec = (name: string, city: string | null, state = "OH") => ({ name, city, state });

test("the judge accepts the same provider written differently", () => {
  assert.ok(judge(rec("Larkspur Technical College", "Larkspur"), rec("LARKSPUR TECH COLL.", null)));
  assert.ok(judge(rec("Fernhollow School of Nursing", "Fernhollow"), rec("Fernhollow Sch. of Nurisng", "Fernhollow")));
  assert.ok(judge(rec("Larkspur Welding Institute", "Larkspur"), rec("The Welding Institute, Larksupr LLC", "Larkspur")));
});

test("the judge rejects what a careful reader would", () => {
  // Different kind of provider, different town, different state, a business, a named campus.
  assert.ok(!judge(rec("Larkspur Technical College", "Larkspur"), rec("Larkspur Community College", "Larkspur")));
  assert.ok(!judge(rec("Millbrook Technical College", "Millbrook"), rec("Millbrook Technical College", "Calder")));
  assert.ok(!judge(rec("Millbrook Technical College", "Millbrook", "OH"), rec("Millbrook Technical College", "Millbrook", "TX")));
  assert.ok(!judge(rec("Larkspur Technical College", "Larkspur"), rec("Larkspur Bookstore", "Larkspur")));
  // Two different businesses in one town (audit G2): a bookstore is not an auto supply shop.
  assert.ok(!judge(rec("Larkspur Bookstore", "Larkspur"), rec("Larkspur Auto Supply", "Larkspur")));
  assert.ok(!judge(rec("Brinmoor Community College", "Brinmoor"), rec("Brinmoor Community College North Campus", "Brinmoor")));
  // An acronym with no town gives it nothing to go on.
  assert.ok(!judge(rec("Larkspur Technical College", "Larkspur"), rec("LTC", "Larkspur")));
});

test("similarity is symmetric, in hundredths, and 100 for spellings that normalise alike", () => {
  assert.equal(similarity("Larkspur Tech", "Larkspur Bookstore"), similarity("Larkspur Bookstore", "Larkspur Tech"));
  assert.equal(similarity("The Larkspur Tech, Inc.", "LARKSPUR TECH"), 100);
  assert.ok(similarity("Larkspur Tech", "Halden Coding Academy") < 40);
});

test("pairwise precision and recall count pairs of records", () => {
  // Predicted {0,1} {2,3}; true {0,1,2} {3}: 2 predicted pairs, 3 true pairs, 1 in common.
  const r = pairwise([0, 0, 1, 1], [0, 0, 0, 1]);
  assert.deepEqual([r.tp, r.predicted, r.actual], [1, 2, 3]);
  assert.equal(r.precision, 0.5);
  assert.equal(r.recall, 1 / 3);
  assert.equal(pairwise([0, 1, 2], [0, 0, 1]).precision, null);
});

test("histogram buckets by size, with the last bucket open-ended", () => {
  assert.deepEqual(histogram([[0], [1, 2], [3, 4, 5, 6, 7, 8, 9]]), [1, 1, 0, 0, 0, 1]);
});

// Four records: 0-1 same provider (score 90), 1-2 a look-alike (score 75, judge says no),
// 2-3 same provider (score 72, judge says yes), 0-3 in different blocks under key 1.
const toy: ErSample = {
  meta: { synthetic: true, seed: 1, version: 1, generator: "test", note: "" },
  keys: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  sim_floor: 40,
  band: 15,
  records: [
    { id: "r1", name: "", city: null, state: "OH", src: "", block_keys: ["x", "p"] },
    { id: "r2", name: "", city: null, state: "OH", src: "", block_keys: ["x", "p"] },
    { id: "r3", name: "", city: null, state: "OH", src: "", block_keys: ["x", "q"] },
    { id: "r4", name: "", city: null, state: "OH", src: "", block_keys: ["x", null] },
  ],
  pairs: [
    [0, 1, 90, 1],
    [1, 2, 75, 0],
    [2, 3, 72, 1],
  ],
  truth: { cluster_of: [0, 0, 1, 1], business_clusters: [] },
};

test("evaluate: above the threshold merges, the band asks the judge, below the band is dropped", () => {
  const r = evaluate(parseSample(toy), 0, 85);
  assert.deepEqual(r.funnel, { allPairs: 6, compared: 6, considered: 3, autoMerged: 1, sentToJudge: 2, judgeMerged: 1 });
  assert.equal(r.found, 2);
  assert.equal(r.precision, 1);
  assert.equal(r.recall, 1);
  // Threshold 95: the band is [80, 95): only 0-1 is considered, and the judge merges it.
  const high = evaluate(toy, 0, 95);
  assert.deepEqual(high.funnel, { allPairs: 6, compared: 6, considered: 1, autoMerged: 0, sentToJudge: 1, judgeMerged: 1 });
  assert.equal(high.recall, 0.5);
});

test("evaluate: only pairs inside a block are compared", () => {
  // Key b: blocks p = {0, 1}, q = {2}, and record 3 has no block: one comparison.
  const r = evaluate(toy, 1, 85);
  assert.equal(r.funnel.compared, 1);
  assert.equal(r.funnel.considered, 1);
  assert.equal(r.found, 3);
});

test("evaluate: a low threshold chains providers together; the largest group says so", () => {
  const r = evaluate(toy, 0, 70);
  assert.equal(r.funnel.autoMerged + r.funnel.judgeMerged, 3);
  assert.equal(r.found, 1);
  assert.equal(r.largest.trueInside, 2);
  assert.equal(r.precision, 2 / 6);
});

test("on the sample, every row is at most its parent, and lowering the threshold chains more", () => {
  // Audit G1: the rows are a tree, not a straight funnel; considered splits into its two children.
  for (let k = 0; k < sample.keys.length; k++) {
    for (let t = THRESHOLD.min; t <= THRESHOLD.max; t++) {
      const { funnel: f } = evaluate(sample, k, t);
      assert.ok(f.allPairs >= f.compared && f.compared >= f.considered, `${k} ${t}`);
      assert.equal(f.considered, f.autoMerged + f.sentToJudge, `${k} ${t}`);
      assert.ok(f.judgeMerged <= f.sentToJudge, `${k} ${t}`);
    }
    const low = evaluate(sample, k, THRESHOLD.min);
    const high = evaluate(sample, k, THRESHOLD.max);
    assert.ok(low.largest.members.length > high.largest.members.length);
    assert.ok((low.precision ?? 1) < (high.precision ?? 1));
  }
});
