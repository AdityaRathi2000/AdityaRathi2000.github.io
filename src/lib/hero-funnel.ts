/*
  The home hero's scroll-driven figure (plan P4.T2), as pure maths: geometry shared by the
  server-rendered SVG (src/components/home/HeroFunnel.astro) and the client driver
  (src/scripts/hero-funnel.ts), and the frame for any scroll position. No DOM here, so it is
  unit-tested directly (tests/unit/hero-funnel.test.ts).

  One fictional provider, four stages, scrubbed by scroll progress p in [0, 1]:
    0 records arrive   cards scattered, each source spelling the name its own way
    1 blocking         the shared blocking key gathers them
    2 judgement        candidate links draw; the LLM accepts close calls, rejects the bookstore
    3 merge            accepted cards collapse into one canonical provider
  Synthetic data, real mechanism: the frame is dashed and captioned (veto V2); real counts
  appear only in the step text beside the figure, never inside it.
*/

export interface Card {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  /** Resting tilt, degrees. */
  rot: number;
  /** Merged into the canonical provider in stage 3 (false: the rejected look-alike). */
  accepted: boolean;
  /** Stage-0 displacement from the resting position: dx, dy, extra tilt in degrees. */
  scatter: [number, number, number];
}

export const W = 420;
export const H = 440;
export const PAD = 14;
export const CARD_H = 40;

export const CARDS: Card[] = [
  { id: "c1", label: "Larkspur Technical College", x: 14, y: 20, w: 220, rot: -2, accepted: true, scatter: [-10, -8, -7] },
  { id: "c2", label: "Larkspur Tech", x: 276, y: 28, w: 124, rot: 3, accepted: true, scatter: [8, -12, 9] },
  { id: "c3", label: "LTC Workforce Ed.", x: 250, y: 118, w: 156, rot: -2, accepted: true, scatter: [10, 22, -8] },
  { id: "c4", label: "Larkspur Comm. & Tech.", x: 24, y: 110, w: 200, rot: 1.5, accepted: true, scatter: [-12, 18, 6] },
  { id: "c5", label: "Larkspur Technical Coll.", x: 10, y: 204, w: 206, rot: -1, accepted: true, scatter: [-4, 34, -6] },
  { id: "c6", label: "Larkspur Bookstore", x: 252, y: 212, w: 164, rot: 2.5, accepted: false, scatter: [12, 30, 8] },
];

/** The canonical provider's box; accepted cards collapse into its centre. */
export const CANONICAL = { x: 70, y: 348, w: 280, h: 50 };
export const MARK_COUNT = 5;

export const STAGE_NAMES = ["Records arrive", "Blocking", "Judgement", "Merge"] as const;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

/** 0 before a, 1 after b, an eased ramp between. */
export function ramp(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/**
 * Scroll progress through the steps: 0 when the first step's top reaches the reading line,
 * 1 when the last step's bottom does. The reading line sits a little below mid-screen.
 */
export function progress(stepsTop: number, stepsHeight: number, viewport: number): number {
  const line = viewport * 0.6;
  return stepsHeight <= 0 ? 1 : clamp((line - stepsTop) / stepsHeight);
}

export function stageAt(p: number): 0 | 1 | 2 | 3 {
  return p < 0.25 ? 0 : p < 0.5 ? 1 : p < 0.75 ? 2 : 3;
}

export interface CardState {
  dx: number;
  dy: number;
  rot: number;
  scale: number;
  opacity: number;
}

export interface Frame {
  stage: 0 | 1 | 2 | 3;
  cards: Record<string, CardState>;
  /** Opacity of the blocking wash and its label. */
  block: number;
  /** Stroke dash offset of the candidate links: 1 hidden, 0 fully drawn. */
  linksOffset: number;
  /** Opacity of the links and the judgement marks as a group (they fade during the merge). */
  judged: number;
  marks: number[];
  /** Opacity of the arrow and the canonical provider. */
  merge: number;
}

export function frameAt(p: number): Frame {
  const scatter = 1 - ramp(0.04, 0.3, p);
  const block = ramp(0.22, 0.36, p);
  const linksOffset = 1 - ramp(0.48, 0.62, p);
  const marks = Array.from({ length: MARK_COUNT }, (_, i) => ramp(0.56 + i * 0.03, 0.6 + i * 0.03, p));
  const collapse = ramp(0.76, 0.94, p);
  const merge = ramp(0.74, 0.86, p);
  const cx = CANONICAL.x + CANONICAL.w / 2;
  const cy = CANONICAL.y + CANONICAL.h / 2;

  const cards: Record<string, CardState> = {};
  for (const c of CARDS) {
    const [sx, sy, sr] = c.scatter;
    const toX = cx - (c.x + c.w / 2);
    const toY = cy - (c.y + CARD_H / 2);
    const m = c.accepted ? collapse : 0;
    cards[c.id] = {
      dx: sx * scatter + toX * m,
      dy: sy * scatter + toY * m,
      rot: sr * scatter,
      scale: 1 - 0.45 * m,
      opacity: c.accepted ? 1 - m : 1 - 0.45 * collapse,
    };
  }
  return { stage: stageAt(p), cards, block: block * (1 - 0.6 * collapse), linksOffset, judged: 1 - collapse, marks, merge };
}
