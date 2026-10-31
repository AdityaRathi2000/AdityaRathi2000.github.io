// The postings page's cascade walkthrough (plan P6.T3): the data stays illustrative, sourced from
// public federal postings, within budget, and carries no score of any kind; tier counts and the
// sidebar note stay true to the data (src/lib/ner-walkthrough.ts). Stepping is tested end to end.
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { TIERS, noLlmNote, parseWalkthrough, tierCounts } from "../../src/lib/ner-walkthrough.ts";

const RAW = readFileSync("src/data/ner-walkthrough.json", "utf8");
const fresh = () => JSON.parse(RAW);
const data = parseWalkthrough(fresh());

test("the walkthrough is illustrative, within the 20 KB budget, and every source is a public USAJOBS posting", () => {
  assert.equal(data.meta.illustrative, true);
  assert.ok(Buffer.byteLength(RAW) <= 20 * 1024);
  for (const p of data.postings) assert.match(p.url, /^https:\/\/www\.usajobs\.gov\/job\/\d+$/);
});

test("the parser refuses unlabelled data, other sources, unknown tiers, and any extra field (a score, a confidence)", () => {
  const cases: [(d: any) => void, RegExp][] = [
    [(d) => (d.meta.illustrative = false), /illustrative/],
    [(d) => (d.postings[0].url = "https://www.example.com/job/1"), /url/],
    [(d) => (d.postings[0].blocks[0].segments[0].tier = "regex"), /tier/],
    [(d) => (d.postings[0].blocks[0].segments[0].confidence = 0.93), /confidence/],
    [(d) => (d.postings[0].f1 = 0.88), /f1/],
    [(d) => (d.postings[1].id = d.postings[0].id), /unique/],
  ];
  for (const [mutate, why] of cases) {
    const d = fresh();
    mutate(d);
    assert.throws(() => parseWalkthrough(d), why);
  }
});

test("tier counts cover every segment, and the postings between them use all three tiers", () => {
  const used = new Set<string>();
  for (const p of data.postings) {
    const c = tierCounts(p);
    const total = p.blocks.reduce((s, b) => s + b.segments.length, 0);
    assert.equal(c.rules + c.encoder + c.llm, total);
    // The encoder does most of the work in every posting; rules and the LLM are the exceptions.
    assert.ok(c.encoder > c.rules && c.encoder > c.llm, `${p.id}: ${JSON.stringify(c)}`);
    for (const t of TIERS) if (c[t]) used.add(t);
  }
  assert.deepEqual([...used].sort(), [...TIERS].sort());
});

test("the no-LLM note names only the tiers that did the work (audit: rules matched nothing for the electrician)", () => {
  assert.match(noLlmNote({ rules: 0, encoder: 5, llm: 0 }), /^Rules matched nothing here/);
  assert.match(noLlmNote({ rules: 1, encoder: 4, llm: 0 }), /^Rules and the encoder labelled every part/);
  assert.throws(() => noLlmNote({ rules: 1, encoder: 3, llm: 1 }), /did need the LLM/);
  // The two postings that never reach the LLM, as the page shows them.
  const counts = (id: string) => tierCounts(data.postings.find((p) => p.id === id)!);
  assert.deepEqual(counts("electrician"), { rules: 0, encoder: 5, llm: 0 });
  assert.deepEqual(counts("it-specialist"), { rules: 1, encoder: 5, llm: 0 });
  assert.match(noLlmNote(counts("it-specialist")), /^Rules and the encoder labelled every part/);
});
