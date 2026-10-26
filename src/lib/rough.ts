/*
  Build-time Rough.js. Runs in Node during `astro build`, emits plain SVG path data,
  ships zero client JS. Colours are never baked in: each path gets a class
  (r-stroke / r-fill / r-accent / r-muted) and global.css maps classes to tokens,
  so the same SVG works in light and dark.

  Deterministic: every shape takes the next seed from the sketch's counter,
  so a diagram renders identically on every build.
*/
import rough from "roughjs";
import type { Options } from "roughjs/bin/core";

export interface RoughPath {
  d: string;
  cls: string;
  width: number;
  dash?: string;
}

type Tone = "ink" | "accent" | "muted";

interface ShapeOpts {
  tone?: Tone;
  hachure?: boolean;
  dash?: [number, number];
  width?: number;
  roughness?: number;
}

// Plan §5: roughness 1.2, bowing 0.8, hachure fill in --accent-wash.
const BASE: Options = {
  roughness: 1.2,
  bowing: 0.8,
  strokeWidth: 1.3,
  fillStyle: "hachure",
  hachureAngle: -41,
  hachureGap: 5.5,
  fillWeight: 1.1,
  preserveVertices: false,
};

// Rough.js copies `fill` into the hachure strokes; a sentinel lets us tell them apart.
const FILL_SENTINEL = "#00f111";

export function sketch(seed: number) {
  const gen = rough.generator();
  let next = seed;

  function opts(o: ShapeOpts): Options {
    return {
      ...BASE,
      seed: next++,
      strokeWidth: o.width ?? BASE.strokeWidth,
      roughness: o.roughness ?? BASE.roughness,
      fill: o.hachure ? FILL_SENTINEL : undefined,
    };
  }

  function toPaths(drawable: ReturnType<typeof gen.rectangle>, o: ShapeOpts): RoughPath[] {
    const tone = o.tone && o.tone !== "ink" ? ` r-${o.tone}` : "";
    return gen.toPaths(drawable).map((p) => ({
      d: p.d,
      cls: p.stroke === FILL_SENTINEL ? "r-fill" : `r-stroke${tone}`,
      width: p.strokeWidth,
      dash: o.dash && p.stroke !== FILL_SENTINEL ? o.dash.join(" ") : undefined,
    }));
  }

  return {
    rect: (x: number, y: number, w: number, h: number, o: ShapeOpts = {}) =>
      toPaths(gen.rectangle(x, y, w, h, opts(o)), o),
    ellipse: (cx: number, cy: number, w: number, h: number, o: ShapeOpts = {}) =>
      toPaths(gen.ellipse(cx, cy, w, h, opts(o)), o),
    line: (x1: number, y1: number, x2: number, y2: number, o: ShapeOpts = {}) =>
      toPaths(gen.line(x1, y1, x2, y2, opts(o)), o),
    curve: (points: [number, number][], o: ShapeOpts = {}) =>
      toPaths(gen.curve(points, opts(o)), o),
    path: (d: string, o: ShapeOpts = {}) => toPaths(gen.path(d, opts(o)), o),
  };
}
