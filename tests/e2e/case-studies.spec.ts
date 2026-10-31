// P5 behaviour: every published case study has a page that never shows a draft number, its
// evidence strip holds only ready numbers with context, What I got wrong has all three
// answers, the pages chain together, and the Manifold teaser never plays by itself.
import { readFileSync, readdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { parse } from "yaml";
import { formatValue, type MetricValue } from "../../src/lib/metrics.ts";

type Row = MetricValue & { id: string; status: "ready" | "draft" };
const registry = parse(readFileSync("src/content/metrics/metrics.yaml", "utf8")) as Row[];
const drafts = registry.filter((r) => r.status === "draft");

// Published case studies, in order, read the same way the route does.
const studies = readdirSync("src/content/case-studies")
  .filter((f) => f.endsWith(".mdx"))
  .map((f) => {
    const fm = parse(readFileSync(`src/content/case-studies/${f}`, "utf8").split("---")[1]) as { status: string; order: number; title: string };
    return { slug: f.replace(/\.mdx$/, ""), ...fm };
  })
  .filter((s) => s.status === "published")
  .sort((a, b) => a.order - b.order);

test("every published case study has a page", async ({ request }) => {
  expect(studies.length).toBeGreaterThan(0);
  for (const s of studies) expect((await request.get(`/work/${s.slug}/`)).status(), s.slug).toBe(200);
});

for (const s of studies) {
  test(`${s.slug}: no draft number, evidence in context, three answers`, async ({ page }) => {
    await page.goto(`/work/${s.slug}/`);
    await expect(page.locator("h1")).toHaveText(s.title);
    // No pending marker, and no draft value anywhere in the page text.
    await expect(page.locator(".metric--pending")).toHaveCount(0);
    const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    for (const d of drafts) expect(text, `${d.id} leaked`).not.toContain(formatValue({ value: d.value, unit: d.unit }));
    // Evidence strip: ready numbers only, each with its note.
    for (const id of await page.locator(".evidence [data-metric]").evaluateAll((els) => els.map((e) => e.getAttribute("data-metric")!))) {
      expect(registry.find((r) => r.id === id)?.status, id).toBe("ready");
      await expect(page.locator(`.evidence [data-metric-note="${id}"]`)).toHaveCount(1);
    }
    await expect(page.locator(".wrong dd")).toHaveCount(3);
    for (const dd of await page.locator(".wrong dd").allInnerTexts()) expect(dd.trim().length).toBeGreaterThan(0);
  });
}

test("the case studies chain in order, and the home rows link to them", async ({ page }) => {
  for (let i = 0; i < studies.length; i++) {
    await page.goto(`/work/${studies[i].slug}/`);
    if (i > 0) await expect(page.locator('.pager a[rel="prev"]')).toHaveAttribute("href", `/work/${studies[i - 1].slug}/`);
    if (i < studies.length - 1) await expect(page.locator('.pager a[rel="next"]')).toHaveAttribute("href", `/work/${studies[i + 1].slug}/`);
  }
  await page.goto("/");
  for (const s of studies) await expect(page.locator(`[data-system="${s.slug}"] h3 a`)).toHaveAttribute("href", `/work/${s.slug}/`);
});

test("the Manifold teaser never plays or downloads by itself", async ({ page }) => {
  const media: string[] = [];
  page.on("request", (r) => r.url().endsWith(".mp4") && media.push(r.url()));
  await page.goto("/work/manifold/");
  const v = page.locator("video");
  await expect(v).toHaveAttribute("preload", "none");
  expect(await v.evaluate((el: HTMLVideoElement) => ({ autoplay: el.autoplay, muted: el.muted, paused: el.paused }))).toEqual({ autoplay: false, muted: true, paused: true });
  await page.waitForTimeout(500);
  expect(media, "video fetched before the reader pressed play").toEqual([]);
});
