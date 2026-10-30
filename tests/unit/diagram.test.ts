// The diagram layout rules (src/lib/diagram.ts): invalid specs are refused with a reason,
// valid ones are placed deterministically inside the figure.
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { GEOMETRY, layout, validate, wrap, type DiagramSpec } from "../../src/lib/diagram.ts";

const base = (over: Partial<DiagramSpec> = {}): DiagramSpec => ({
  title: "A figure",
  desc: "What it shows.",
  seed: 1,
  columns: 2,
  rows: [[{ id: "a", label: "Alpha" }], [{ id: "b", label: "Beta", col: 0 }, { id: "c", label: "Gamma", col: 1 }]],
  edges: [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
  ],
  ...over,
});

test("a valid spec has no errors", () => {
  assert.deepEqual(validate(base()), []);
});

test("invalid specs are refused, each with its reason", () => {
  const cases: [Partial<DiagramSpec>, RegExp][] = [
    [{ edges: [{ from: "a", to: "nope" }] }, /unknown node "nope"/],
    [{ rows: [[{ id: "a", label: "A" }], [{ id: "b", label: "B" }], [{ id: "c", label: "C" }]], edges: [{ from: "a", to: "c" }] }, /skips a row/],
    [{ rows: [[{ id: "a", label: "A", tone: "accent" }, { id: "b", label: "B", tone: "accent", col: 1 }]], edges: [] }, /at most one accent/],
    [{ rows: [[{ id: "a", label: "A" }], [{ id: "a", label: "Again" }]], edges: [] }, /used twice/],
    [{ rows: [[{ id: "a", label: "A", col: 1, span: 2 }]], edges: [] }, /does not fit/],
    [{ rows: [[{ id: "a", label: "A", col: 0, span: 2 }, { id: "b", label: "B", col: 1 }]], edges: [] }, /overlaps/],
    [{ desc: " " }, /desc is required/],
    [{ edges: [{ from: "a", to: "a" }] }, /points at itself/],
  ];
  for (const [over, reason] of cases) assert.match(validate(base(over)).join("\n"), reason);
});

test("a metric id must exist in the registry when the registry is given", () => {
  const spec = base({ rows: [[{ id: "a", label: "A", metric: "no-such-metric" }]], edges: [] });
  assert.match(validate(spec, new Set(["cvi-sources"])).join("\n"), /not in metrics\.yaml/);
  assert.deepEqual(validate(spec), []);
});

test("layout refuses an invalid spec instead of drawing it", () => {
  assert.throws(() => layout(base({ edges: [{ from: "a", to: "zzz" }] })), /unknown node "zzz"/);
});

test("wrap keeps lines within the estimated width and never drops a word", () => {
  const text = "the hardest residuals go to a final tier that uses grounded search";
  const lines = wrap(text, 120, "sub");
  assert.ok(lines.length > 1);
  assert.equal(lines.join(" "), text);
  for (const l of lines.slice(0, -1)) assert.ok(l.length <= Math.floor(120 / (15 * 0.5)), l);
  assert.deepEqual(wrap("Supercalifragilistic", 20, "label"), ["Supercalifragilistic"]);
});

test("nodes stay inside the figure width, rows stack without overlap, edges classify", () => {
  const spec = base({
    rows: [...base().rows, [{ id: "d", label: "Delta" }]],
    edges: [...base().edges, { from: "c", to: "d" }, { from: "d", to: "a", label: "back" }],
  });
  const L = layout(spec);
  for (const n of L.nodes) {
    assert.ok(n.x >= 0 && n.x + n.w <= GEOMETRY.width, `${n.id} fits the width`);
  }
  const byRow = (r: number) => L.nodes.filter((n) => n.row === r);
  for (let r = 1; r < 3; r++) assert.ok(byRow(r)[0].y >= byRow(r - 1)[0].y + byRow(r - 1)[0].h, `row ${r} starts below row ${r - 1}`);
  assert.deepEqual(
    L.edges.map((e) => e.kind),
    ["down", "side", "down", "loop"],
  );
  // A loop reserves the right-hand gutter, so no box reaches into it.
  for (const n of L.nodes) assert.ok(n.x + n.w <= GEOMETRY.width - GEOMETRY.loopGutter);
  assert.equal(L.edges[3].label?.rotate, true);
});

test("a counter adds a line to its node and is the only number source", () => {
  const plain = layout(base());
  const counted = layout(base(), { a: "~20 data sources reconciled" });
  const a = (L: typeof plain) => L.nodes.find((n) => n.id === "a")!;
  assert.ok(a(counted).h > a(plain).h);
  assert.equal(a(counted).lines.at(-1)?.kind, "metric");
});

test("layout is deterministic", () => {
  assert.deepEqual(layout(base()), layout(base()));
});

test("every committed spec in src/diagrams is valid", () => {
  const dir = "src/diagrams";
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 5);
  for (const f of files) assert.deepEqual(validate(JSON.parse(readFileSync(`${dir}/${f}`, "utf8"))), [], f);
});
