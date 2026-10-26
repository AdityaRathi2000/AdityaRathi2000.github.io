/*
  OpenGraph images (plan P2.T5), rendered at build time: Satori lays out text to SVG,
  resvg rasterises it to PNG. Same paper, ink and Piazzolla as the site, plus one
  hand-drawn underline in the accent (the single accent use, as on the page).
*/
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { sketch } from "./rough";

const W = 1200;
const H = 630;
const PAPER = "#f2eee6";
const INK = "#1e2230";
const INK_2 = "#5a5f70";
const ACCENT = "#2e3a8c";

// Satori reads TTF/OTF/WOFF (not WOFF2), so these come from the static @fontsource package.
const font = (file: string) => readFileSync(`node_modules/@fontsource/piazzolla/files/${file}`);
const fonts = [
  { name: "Piazzolla", data: font("piazzolla-latin-400-normal.woff"), weight: 400 as const, style: "normal" as const },
  { name: "Piazzolla", data: font("piazzolla-latin-600-normal.woff"), weight: 600 as const, style: "normal" as const },
  { name: "Piazzolla", data: font("piazzolla-latin-400-italic.woff"), weight: 400 as const, style: "italic" as const },
];

function underline(seed: number): string {
  const paths = sketch(seed).curve(
    [
      [6, 14],
      [180, 9],
      [360, 13],
      [520, 7],
    ],
    { width: 3.2, roughness: 1.4 },
  );
  const d = paths.map((p) => `<path d="${p.d}" fill="none" stroke="${ACCENT}" stroke-width="${p.width * 1.6}" stroke-linecap="round"/>`).join("");
  return `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="540" height="24" viewBox="0 0 540 24">${d}</svg>`).toString("base64")}`;
}

type Node = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node => ({
  type,
  props: { style, children, ...extra },
});

export async function renderOg({ title, description, seed }: { title: string; description: string; seed: number }): Promise<Buffer> {
  const tree = el(
    "div",
    {
      width: W,
      height: H,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: "72px 84px",
      background: PAPER,
      color: INK,
      fontFamily: "Piazzolla",
    },
    [
      el("div", { fontSize: 30, fontWeight: 600, letterSpacing: "-0.01em" }, "Aditya Rathi"),
      el("div", { display: "flex", flexDirection: "column" }, [
        el("div", { fontSize: title.length > 34 ? 64 : 80, fontWeight: 600, lineHeight: 1.04, letterSpacing: "-0.02em", maxWidth: 1000 }, title),
        el("img", { width: 540, height: 24, marginTop: 18 }, undefined, { src: underline(seed), width: 540, height: 24 }),
        el("div", { fontSize: 34, lineHeight: 1.35, color: INK_2, marginTop: 30, maxWidth: 980 }, description),
      ]),
      el("div", { fontSize: 26, fontStyle: "italic", color: INK_2 }, "adityarathi.com"),
    ],
  );
  const svg = await satori(tree as never, { width: W, height: H, fonts });
  return new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
}
