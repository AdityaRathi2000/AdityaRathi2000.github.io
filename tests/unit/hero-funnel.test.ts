// The home hero's stage maths (src/lib/hero-funnel.ts): each scroll position gives a frame that
// tells its part of the story, and the frames move one way as the reader scrolls.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CARDS, MARK_COUNT, frameAt, progress, ramp, stageAt } from "../../src/lib/hero-funnel.ts";

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

test("progress is clamped to [0, 1] and rises as the steps scroll up", () => {
  assert.equal(progress(2000, 1000, 800), 0);
  assert.equal(progress(-5000, 1000, 800), 1);
  assert.equal(progress(0, 0, 800), 1);
  const ps = [600, 300, 0, -300].map((top) => progress(top, 1000, 800));
  for (let i = 1; i < ps.length; i++) assert.ok(ps[i] > ps[i - 1]);
});

test("stages split the scroll into four equal parts", () => {
  assert.deepEqual([0, 0.24, 0.25, 0.5, 0.74, 0.75, 1].map(stageAt), [0, 0, 1, 2, 2, 3, 3]);
});

test("ramp is 0 before, 1 after, and monotonic between", () => {
  assert.equal(ramp(0.2, 0.4, 0.1), 0);
  assert.equal(ramp(0.2, 0.4, 0.5), 1);
  let last = -1;
  for (let x = 0.2; x <= 0.4; x += 0.01) {
    const v = ramp(0.2, 0.4, x);
    assert.ok(v >= last);
    last = v;
  }
});

test("frame 0: records scattered, nothing blocked, judged or merged", () => {
  const f = frameAt(0);
  assert.equal(f.stage, 0);
  assert.equal(f.block, 0);
  assert.equal(f.linksOffset, 1);
  assert.ok(f.marks.every((m) => m === 0));
  assert.equal(f.merge, 0);
  for (const c of CARDS) {
    const s = f.cards[c.id];
    assert.ok(near(s.dx, c.scatter[0]) && near(s.dy, c.scatter[1]) && near(s.rot, c.scatter[2]), `${c.id} scattered`);
    assert.equal(s.opacity, 1);
  }
});

test("end of judgement: blocked and judged, every record still on screen", () => {
  // The last mark lands at 0.72; the merge starts at 0.74.
  const f = frameAt(0.73);
  assert.equal(f.stage, 2);
  assert.equal(f.block, 1);
  assert.equal(f.linksOffset, 0);
  assert.equal(f.marks.length, MARK_COUNT);
  assert.ok(f.marks.every((m) => m === 1));
  for (const c of CARDS) assert.equal(f.cards[c.id].opacity, 1, `${c.id} visible`);
});

test("frame 1: accepted records merged away, the rejected look-alike still there", () => {
  const f = frameAt(1);
  assert.equal(f.stage, 3);
  assert.equal(f.merge, 1);
  assert.equal(f.judged, 0);
  for (const c of CARDS) {
    const s = f.cards[c.id];
    if (c.accepted) assert.equal(s.opacity, 0, `${c.id} merged`);
    else assert.ok(s.opacity > 0.5 && near(s.dx, 0) && near(s.dy, 0), `${c.id} stays put`);
  }
  assert.ok(CARDS.some((c) => !c.accepted), "the figure keeps one rejected record");
});

test("the story only moves forward: block, links and merge never go backwards before the merge", () => {
  let prev = frameAt(0);
  for (let p = 0.01; p <= 0.74; p += 0.01) {
    const f = frameAt(p);
    assert.ok(f.block >= prev.block - 1e-12, `block at ${p}`);
    assert.ok(f.linksOffset <= prev.linksOffset + 1e-12, `links at ${p}`);
    assert.ok(f.merge >= prev.merge - 1e-12, `merge at ${p}`);
    prev = f;
  }
});
