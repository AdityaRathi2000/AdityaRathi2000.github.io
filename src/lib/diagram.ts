/*
  Architecture diagrams (plan P3.T1): a declarative spec in src/diagrams/<name>.json is
  validated and laid out here, then drawn with Rough.js by src/components/Diagram.astro.
  Pure functions with no Astro imports, so they are unit-tested directly
  (tests/unit/diagram.test.ts).

  Layout model: rows run top to bottom; each row places nodes on a grid of `columns`
  equal columns (a node takes `col` and `span`). Edges are
    down: to a node in the next row,
    side: to a node in the same row,
    loop: back up to an earlier row, routed along a gutter on the right.
  Text is wrapped by an estimated glyph width; the e2e suite measures the real text in
  a browser and fails if any label leaves its box (tests/e2e/diagrams.spec.ts).
*/

export type Tone = "ink" | "accent" | "muted";

export interface NodeSpec {
  id: string;
  label: string;
  sub?: string;
  /** Registry id. Rendered only when the row is ready; a draft prints nothing. */
  metric?: string;
  tone?: Tone;
  col?: number;
  span?: number;
}

export interface EdgeSpec {
  from: string;
  to: string;
  label?: string;
  dash?: boolean;
}

export interface DiagramSpec {
  title: string;
  desc: string;
  caption?: string;
  seed: number;
  columns?: number;
  /** Synthetic content: dashed frame and the "Synthetic data, real mechanism" caption (veto V2). */
  synthetic?: boolean;
  rows: NodeSpec[][];
  edges: EdgeSpec[];
}

/** The pixel sizes, in viewBox units. Labels stay at 15 or more so they survive a phone (handoff §7). */
export const TYPE = {
  label: { size: 17, line: 21, em: 0.53 },
  sub: { size: 15, line: 19, em: 0.5 },
  metric: { size: 15, line: 20, em: 0.62 },
  edge: { size: 15, line: 19, em: 0.5 },
} as const;

export const GEOMETRY = {
  width: 440,
  pad: 14,
  padX: 12,
  padY: 11,
  colGap: 16,
  sideGap: 40,
  rowGap: 40,
  labelledRowGap: 58,
  loopGutter: 34,
} as const;

type Kind = keyof typeof TYPE;

export interface TextLine {
  text: string;
  kind: Kind;
  /** Baseline, relative to the node's top edge. */
  y: number;
}

export interface PlacedNode {
  id: string;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
  tone: Tone;
  lines: TextLine[];
}

export interface PlacedEdge {
  kind: "down" | "side" | "loop";
  from: string;
  to: string;
  /** Polyline in viewBox units; the arrowhead sits at the last point. */
  points: [number, number][];
  label?: { text: string; x: number; y: number; lines: string[]; rotate?: boolean };
  dash: boolean;
  /** Stage for the draw-on-enter stagger: edges arrive with their target row. */
  stage: number;
}

export interface Layout {
  width: number;
  height: number;
  nodes: PlacedNode[];
  edges: PlacedEdge[];
}

/** Everything wrong with a spec, as readable messages. An empty list means it is valid. */
export function validate(spec: DiagramSpec, knownMetrics?: Set<string>): string[] {
  const errors: string[] = [];
  const columns = spec.columns ?? 1;
  if (!Number.isInteger(columns) || columns < 1 || columns > 3) errors.push(`columns must be 1, 2 or 3 (got ${columns})`);
  if (!spec.title?.trim()) errors.push("title is required (it names the figure for screen readers)");
  if (!spec.desc?.trim()) errors.push("desc is required (it describes the figure for screen readers)");
  if (!Number.isInteger(spec.seed)) errors.push("seed must be an integer");
  if (!spec.rows?.length) errors.push("rows must not be empty");

  const rowOf = new Map<string, number>();
  spec.rows?.forEach((row, r) => {
    if (!row.length) errors.push(`row ${r} is empty`);
    const used = new Set<number>();
    for (const n of row) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(n.id ?? "")) errors.push(`node id "${n.id}" is not kebab-case`);
      if (rowOf.has(n.id)) errors.push(`node id "${n.id}" is used twice`);
      rowOf.set(n.id, r);
      if (!n.label?.trim()) errors.push(`node "${n.id}" has no label`);
      const col = n.col ?? 0;
      const span = n.span ?? (row.length === 1 ? columns : 1);
      if (col < 0 || span < 1 || col + span > columns) errors.push(`node "${n.id}" does not fit the ${columns}-column grid`);
      for (let c = col; c < col + span; c++) {
        if (used.has(c)) errors.push(`node "${n.id}" overlaps another node in row ${r}`);
        used.add(c);
      }
      if (n.metric && knownMetrics && !knownMetrics.has(n.metric)) errors.push(`node "${n.id}" names metric "${n.metric}", which is not in metrics.yaml`);
    }
  });

  const accents = spec.rows?.flat().filter((n) => n.tone === "accent").length ?? 0;
  if (accents > 1) errors.push(`at most one accent per figure (plan §5); found ${accents}`);

  const seen = new Set<string>();
  for (const e of spec.edges ?? []) {
    const a = rowOf.get(e.from);
    const b = rowOf.get(e.to);
    if (a === undefined) errors.push(`edge from unknown node "${e.from}"`);
    if (b === undefined) errors.push(`edge to unknown node "${e.to}"`);
    if (a !== undefined && b !== undefined && b > a + 1) errors.push(`edge ${e.from} -> ${e.to} skips a row; route it through the row between`);
    if (e.from === e.to) errors.push(`edge ${e.from} -> ${e.to} points at itself`);
    const key = `${e.from}->${e.to}`;
    if (seen.has(key)) errors.push(`edge ${key} is listed twice`);
    seen.add(key);
  }
  return errors;
}

/** Greedy word wrap by estimated glyph width. A word longer than the line keeps its own line. */
export function wrap(text: string, maxWidth: number, kind: Kind): string[] {
  const perChar = TYPE[kind].size * TYPE[kind].em;
  const maxChars = Math.max(1, Math.floor(maxWidth / perChar));
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Place every node and edge. `counters` maps node id to the text of its metric counter
 * (only for ready metrics; the caller leaves drafts out).
 */
export function layout(spec: DiagramSpec, counters: Record<string, string> = {}): Layout {
  const errors = validate(spec);
  if (errors.length) throw new Error(`diagram "${spec.title}": ${errors.join("; ")}`);

  const G = GEOMETRY;
  const columns = spec.columns ?? 1;
  const rowOf = new Map(spec.rows.flatMap((row, r) => row.map((n) => [n.id, r] as const)));
  const kindOf = (e: EdgeSpec) => {
    const a = rowOf.get(e.from)!;
    const b = rowOf.get(e.to)!;
    return b === a ? "side" : b < a ? "loop" : "down";
  };
  const hasLoop = spec.edges.some((e) => kindOf(e) === "loop");
  const usable = G.width - (hasLoop ? G.loopGutter : 0);

  const nodes: PlacedNode[] = [];
  const byId = new Map<string, PlacedNode>();
  let y = 0;
  const rowBottoms: number[] = [];

  spec.rows.forEach((row, r) => {
    const sides = spec.edges.filter((e) => kindOf(e) === "side" && rowOf.get(e.from) === r);
    // A labelled side edge sits in the gap between its boxes, so the gap grows to hold the label.
    const labelW = Math.max(0, ...sides.map((e) => (e.label ? e.label.length * TYPE.edge.size * TYPE.edge.em + 20 : 0)));
    const gap = sides.length ? Math.max(G.sideGap, Math.ceil(labelW)) : G.colGap;
    const colW = (usable - (columns - 1) * gap) / columns;

    const placed = row.map((n) => {
      const col = n.col ?? 0;
      const span = n.span ?? (row.length === 1 ? columns : 1);
      const w = span * colW + (span - 1) * gap;
      return { n, x: col * (colW + gap), w, ...nodeText(n, w, counters[n.id]) };
    });

    const h = Math.max(...placed.map((p) => p.height));
    for (const p of placed) {
      // Centre the text block vertically when this node is shorter than its row.
      const shift = (h - p.height) / 2;
      const node: PlacedNode = {
        id: p.n.id,
        row: r,
        x: p.x,
        y,
        w: p.w,
        h,
        tone: p.n.tone ?? "ink",
        lines: p.lines.map((l) => ({ ...l, y: l.y + shift })),
      };
      nodes.push(node);
      byId.set(node.id, node);
    }
    y += h;
    rowBottoms.push(y);
    const labelled = spec.edges.some((e) => e.label && kindOf(e) === "down" && rowOf.get(e.from) === r);
    if (r < spec.rows.length - 1) y += labelled ? G.labelledRowGap : G.rowGap;
  });

  const edges: PlacedEdge[] = spec.edges.map((e) => {
    const a = byId.get(e.from)!;
    const b = byId.get(e.to)!;
    const kind = kindOf(e);
    let points: [number, number][];
    if (kind === "down") {
      // Leave and arrive at the horizontal overlap of the two boxes when there is one, so
      // stacked boxes get a straight arrow; otherwise go centre to centre.
      const lo = Math.max(a.x, b.x);
      const hi = Math.min(a.x + a.w, b.x + b.w);
      const x1 = hi - lo > 24 ? (lo + hi) / 2 : a.x + a.w / 2;
      const x2 = hi - lo > 24 ? (lo + hi) / 2 : b.x + b.w / 2;
      points = [
        [x1, a.y + a.h + 4],
        [x2, b.y - 5],
      ];
    } else if (kind === "side") {
      const ltr = a.x < b.x;
      const cy = a.y + a.h / 2;
      points = ltr
        ? [
            [a.x + a.w + 4, cy],
            [b.x - 5, cy],
          ]
        : [
            [a.x - 4, cy],
            [b.x + b.w + 5, cy],
          ];
    } else {
      const gx = usable + G.loopGutter / 2 + 2;
      points = [
        [a.x + a.w + 4, a.y + a.h / 2],
        [gx, a.y + a.h / 2],
        [gx, b.y + b.h / 2],
        [b.x + b.w + 5, b.y + b.h / 2],
      ];
    }
    let label: PlacedEdge["label"];
    if (e.label) {
      const [p, q] = kind === "loop" ? [points[1], points[2]] : [points[0], points[points.length - 1]];
      if (kind === "side") {
        // Above the arrow, inside the gap the row made wide enough for it.
        const lines = [e.label];
        label = { text: e.label, x: (p[0] + q[0]) / 2, y: p[1] - 8, lines };
      } else if (kind === "down") {
        const lines = wrap(e.label, Math.max(120, usable - Math.max(p[0], q[0]) - 14), "edge");
        label = { text: e.label, x: Math.max(p[0], q[0]) + 10, y: (p[1] + q[1]) / 2 + 5 - ((lines.length - 1) * TYPE.edge.line) / 2, lines };
      } else {
        // Loop labels run up the gutter beside the line (rotated a quarter turn), clear of the boxes.
        const lines = [e.label];
        label = { text: e.label, x: p[0] + 13, y: (p[1] + q[1]) / 2, lines, rotate: true };
      }
    }
    const stage = kind === "loop" ? spec.rows.length : Math.max(rowOf.get(e.from)!, rowOf.get(e.to)!);
    return { kind, from: e.from, to: e.to, points, label, dash: !!e.dash, stage };
  });

  return { width: G.width, height: y, nodes, edges };
}

/** A node's wrapped text lines (baselines relative to its top) and the height they need. */
function nodeText(n: NodeSpec, w: number, counter?: string): { lines: TextLine[]; height: number } {
  const G = GEOMETRY;
  const inner = w - 2 * G.padX;
  const lines: TextLine[] = [];
  let cursor = G.padY;
  const push = (text: string, kind: Kind) => {
    for (const t of wrap(text, inner, kind)) {
      cursor += TYPE[kind].line;
      lines.push({ text: t, kind, y: cursor - (TYPE[kind].line - TYPE[kind].size) / 2 - 2 });
    }
  };
  push(n.label, "label");
  if (n.sub) push(n.sub, "sub");
  if (counter) {
    cursor += 4;
    push(counter, "metric");
  }
  return { lines, height: cursor + G.padY };
}

/** Arrowhead: a small open V at the end of a polyline, as SVG path data. */
export function arrowhead(points: [number, number][], size = 7): string {
  const [x2, y2] = points[points.length - 1];
  const [x1, y1] = points[points.length - 2];
  const a = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  const p = (t: number) => [x2 - size * Math.cos(a - t), y2 - size * Math.sin(a - t)].map((v) => Math.round(v * 10) / 10);
  const [l, r] = [p(spread), p(-spread)];
  return `M${l[0]} ${l[1]} L${x2} ${y2} L${r[0]} ${r[1]}`;
}
