// P6.T2 behaviour (Aditya, 2026-10-31): until phase 7 delivers live data, the weather model's
// case-study page has no reliability chart and no Result section; the chart appears only on the
// noindex /diagrams/ page, on its fixture, labelled so it cannot be read as a result.
import { expect, test } from "@playwright/test";

test("the case-study page shows no fixture, no chart and no Result yet", async ({ page }) => {
  const json: string[] = [];
  page.on("request", (r) => r.url().endsWith(".json") && json.push(r.url()));
  await page.goto("/work/kalshi-weather-model/");
  await expect(page.locator(".kr")).toHaveCount(0);
  await expect(page.locator("[data-provenance]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Result" })).toHaveCount(0);
  expect(await page.locator("main").innerText()).not.toMatch(/fixture|SmoothECE/i);
  expect(json, "the chart never fetches data in the browser").toEqual([]);
});

test("on /diagrams/, the fixture is tagged, dashed, watermarked and never marked live", async ({ page }) => {
  // The page that renders the chart is the one to watch for a client fetch (audit C6).
  const json: string[] = [];
  page.on("request", (r) => (r.url().endsWith(".json") || ["fetch", "xhr"].includes(r.resourceType())) && json.push(r.url()));
  const res = await page.goto("/diagrams/", { waitUntil: "networkidle" });
  expect(await res!.text()).toContain('<meta name="robots" content="noindex"');
  const fig = page.locator('.kr[data-provenance="fixture"]');
  await expect(fig).toHaveCount(1);
  await expect(fig.locator(".kr-tag")).toHaveText("Fixture: made-up numbers for building this chart, not a result");
  expect(await fig.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe("dashed");
  await expect(fig.locator(".kr-watermark")).toHaveText("FIXTURE");
  await expect(fig.locator("svg title").first()).toContainText("fixture, made-up numbers");
  await expect(page.locator("[data-live]")).toHaveCount(0);
  // The curve, its band and one bar per histogram bin are drawn.
  await expect(fig.locator(".kr-curve")).toHaveAttribute("d", /^M[\d.]+ [\d.]+( L[\d.]+ [\d.]+)+$/);
  await expect(fig.locator(".kr-band")).toHaveAttribute("d", / Z$/);
  expect(await fig.locator(".kr-bar").count()).toBeGreaterThan(1);
  // Static SVG: no script inside the chart and no data requests from the page.
  await expect(fig.locator("script")).toHaveCount(0);
  expect(json, "the chart never fetches data in the browser").toEqual([]);
});
