// P2.T4/P2.T5 behaviour: résumé route, JSON-LD, OpenGraph image, llms.txt, resume.md.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { parse } from "yaml";
import { formatValue, type MetricValue } from "../../src/lib/metrics.ts";

type Row = MetricValue & { id: string; status: "ready" | "draft" };
const drafts = (parse(readFileSync("src/content/metrics/metrics.yaml", "utf8")) as Row[]).filter((m) => m.status === "draft");

test("/resume points at the PDF, which is served", async ({ page, request }) => {
  await page.goto("/resume/");
  await expect(page.locator('meta[http-equiv="refresh"]')).toHaveAttribute("content", "0; url=/resume.pdf");
  const pdf = await request.get("/resume.pdf");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
});

test("home carries ProfilePage + Person JSON-LD without contact details", async ({ page }) => {
  await page.goto("/");
  const raw = await page.locator('script[type="application/ld+json"]').textContent();
  const data = JSON.parse(raw!);
  const types = data["@graph"].map((n: { "@type": string }) => n["@type"]);
  expect(types).toEqual(["ProfilePage", "Person"]);
  const person = data["@graph"][1];
  expect(person.sameAs).toContain("https://github.com/AdityaRathi2000");
  expect(raw).not.toMatch(/@gmail|930-6153/);
});

test("OpenGraph image exists and is 1200 x 630", async ({ page, request }) => {
  await page.goto("/");
  const url = new URL((await page.locator('meta[property="og:image"]').getAttribute("content"))!);
  const png = await request.get(url.pathname);
  expect(png.status()).toBe(200);
  const buf = await png.body();
  // PNG IHDR: width and height are big-endian u32 at bytes 16 and 20.
  expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([1200, 630]);
});

test("llms.txt and resume.md are served and never show a draft number", async ({ request }) => {
  const llms = await (await request.get("/llms.txt")).text();
  expect(llms).toMatch(/^# Aditya Rathi/);
  expect(llms).not.toMatch(/\bBelow\b/);
  const md = await (await request.get("/resume.md")).text();
  expect(md).toContain("Machine Learning Engineer");
  // No draft row in metrics.yaml may leak its value. Read from the registry, so a row that
  // becomes ready is allowed through and a new draft is covered without editing this test.
  for (const m of drafts) {
    const shown = formatValue({ value: m.value, unit: m.unit });
    expect(llms, m.id).not.toContain(shown);
    expect(md, m.id).not.toContain(shown);
  }
});
