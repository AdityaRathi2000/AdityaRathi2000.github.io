// P3 behaviour: architecture figures render legibly, print only ready numbers, and draw once.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { parse } from "yaml";
import { formatValue, type MetricValue } from "../../src/lib/metrics.ts";

type Row = MetricValue & { id: string; status: "ready" | "draft"; label: string };
const registry = parse(readFileSync("src/content/metrics/metrics.yaml", "utf8")) as Row[];
const FIGURES = ["cvi-funnel", "postings-stack", "classifier", "kalshi", "manifold"];

test("every figure renders, and every label stays inside its box and the figure", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/diagrams/");
  await page.evaluate(() => document.fonts.ready);
  for (const name of FIGURES) await expect(page.locator(`[data-diagram="${name}"] svg`)).toHaveCount(1);

  // Screen coordinates throughout, so rotated labels are measured as drawn.
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const rect = (el: Element) => el.getBoundingClientRect();
    const inside = (a: DOMRect, b: DOMRect, slack = 1) =>
      a.left >= b.left - slack && a.top >= b.top - slack && a.right <= b.right + slack && a.bottom <= b.bottom + slack;
    const overlap = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    for (const fig of document.querySelectorAll<HTMLElement>("[data-diagram]")) {
      const svg = fig.querySelector("svg")!;
      const boxes = [...fig.querySelectorAll<SVGRectElement>(".d-box")];
      for (const node of fig.querySelectorAll<SVGGElement>(".d-node")) {
        const box = rect(node.querySelector(".d-box")!);
        for (const t of node.querySelectorAll("text")) {
          if (!inside(rect(t), box)) out.push(`${fig.dataset.diagram}/${node.dataset.node}: "${t.textContent}" leaves its box`);
        }
      }
      for (const t of fig.querySelectorAll(".d-edge text")) {
        if (boxes.some((b) => overlap(rect(t), rect(b)))) out.push(`${fig.dataset.diagram}: edge label "${t.textContent}" crosses a box`);
      }
      for (const t of svg.querySelectorAll("text")) {
        if (!inside(rect(t), rect(svg))) out.push(`${fig.dataset.diagram}: "${t.textContent}" leaves the figure`);
      }
    }
    for (const thumb of document.querySelectorAll("svg.thumb")) {
      for (const t of thumb.querySelectorAll("text")) {
        if (!inside(rect(t), rect(thumb))) out.push(`thumbnail "${thumb.querySelector("title")?.textContent}": "${t.textContent}" leaves it`);
      }
    }
    return out;
  });
  expect(problems).toEqual([]);
});

test("figures print ready numbers and never a draft one", async ({ page }) => {
  await page.goto("/diagrams/");
  // Each wrapped line is its own <text>; join them with spaces, as a reader sees them.
  const text = (await page.locator("[data-diagram] svg text, [data-diagram] figcaption").allTextContents()).join(" ");
  for (const m of registry.filter((r) => r.status === "draft")) {
    expect(text, m.id).not.toContain(formatValue({ value: m.value, unit: m.unit }));
  }
  // Counters bound in the specs: each must show its registry value and label.
  for (const id of ["cvi-sources", "cvi-providers", "cvi-descriptions", "dapt-encoders", "ner-section-types", "edu-predictions", "edu-records", "kalshi-cities", "manifold-latency"]) {
    const m = registry.find((r) => r.id === id)!;
    expect(m.status, `${id} is bound in a spec, so it must be ready`).toBe("ready");
    expect(text, id).toContain(`${formatValue(m)} ${m.label}`);
  }
});

test("a figure below the fold draws once when it scrolls into view", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.goto("/diagrams/");
  const last = page.locator('[data-diagram="manifold"]');
  const offsets = () => last.locator(".stage .r-draw").evaluateAll((ps) => [...new Set(ps.map((p) => getComputedStyle(p).strokeDashoffset))]);
  await expect(last).toHaveClass(/is-armed/);
  await expect(last).not.toHaveClass(/is-drawn/);
  // Armed means hidden right away: every undashed stroke is fully offset, not mid-transition.
  expect(await offsets()).toEqual(["1px"]);
  await last.scrollIntoViewIfNeeded();
  await expect(last).toHaveClass(/is-drawn/);
  // Strokes finish drawn: dash offset back to zero once the transitions end.
  await expect
    .poll(async () => last.locator(".stage .r-draw").evaluateAll((ps) => ps.every((p) => getComputedStyle(p).strokeDashoffset === "0px")), {
      timeout: 5000,
    })
    .toBe(true);
});

test("printing shows every stroke, even of a figure that was armed and never scrolled to", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.goto("/diagrams/");
  const last = page.locator('[data-diagram="manifold"]');
  await expect(last).toHaveClass(/is-armed/);
  await page.emulateMedia({ media: "print", reducedMotion: "no-preference" });
  const offsets = await last.locator(".stage .r-draw").evaluateAll((ps) => [...new Set(ps.map((p) => getComputedStyle(p).strokeDashoffset))]);
  expect(offsets).toEqual(["0px"]);
});

test("reduced motion never hides a stroke", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/diagrams/");
  await expect(page.locator(".diagram.is-armed")).toHaveCount(0);
});

test("without JavaScript every figure is fully drawn", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.goto("/diagrams/");
  await expect(page.locator("[data-diagram] svg")).toHaveCount(FIGURES.length);
  await expect(page.locator(".diagram.is-armed")).toHaveCount(0);
  await context.close();
});
