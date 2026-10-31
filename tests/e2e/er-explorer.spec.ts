// P6.T1 behaviour: the CVI explorer is labelled synthetic and framed apart from the real numbers,
// loads its driver and data only when the reader gets near, starts from exactly the server-rendered
// numbers, responds to its controls without changing height, and degrades to a readable static
// state without JS or without its data.
import { expect, test, type Page } from "@playwright/test";

const PATH = "/work/cvi-entity-resolution/";
const DATA = "/data/er-sample.json";
const OUTS = ["allPairs", "compared", "considered", "autoMerged", "sentToJudge", "judgeMerged", "found", "precision", "recall", "judgeShare", "largestNote"];

const readOuts = (page: Page) =>
  page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, document.querySelector(`[data-er] [data-out="${k}"]`)?.textContent?.trim()])), OUTS);

async function hydrate(page: Page) {
  await page.locator("[data-er]").scrollIntoViewIfNeeded();
  await expect(page.locator("[data-er]")).toHaveAttribute("data-er-ready", "");
}

test("synthetic data is tagged and dashed; the real numbers sit outside the frame", async ({ page }) => {
  await page.goto(PATH);
  const frame = page.locator(".er-frame");
  await expect(frame.locator(".er-tag")).toHaveText("Synthetic data, real mechanism");
  expect(await frame.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe("dashed");
  await expect(frame.locator("[data-metric]")).toHaveCount(0);
  const ledger = page.locator(".er-ledger");
  await expect(ledger.locator('[data-metric="cvi-sources"]')).toHaveCount(1);
  await expect(ledger.locator('[data-metric="cvi-providers"]')).toHaveCount(1);
  expect(await ledger.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe("solid");
});

test("the driver and data load only near the explorer, then start from the server-rendered numbers", async ({ page }) => {
  const fetched: string[] = [];
  page.on("request", (r) => (r.url().endsWith(DATA) || /er-explorer\.[\w-]+\.js$/.test(r.url())) && fetched.push(r.url()));
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(PATH);
  const top = await page.locator("[data-er]").evaluate((el) => el.getBoundingClientRect().top);
  expect(top, "explorer should start well below the first screen on a phone").toBeGreaterThan(800 + 600);
  await page.waitForTimeout(500);
  expect(fetched, "loaded before the reader got near").toEqual([]);
  await expect(page.locator("#er-t")).toBeDisabled();

  const ssr = await readOuts(page);
  await hydrate(page);
  expect(fetched.length).toBe(2);
  await expect(page.locator("#er-t")).toBeEnabled();
  expect(await readOuts(page)).toEqual(ssr);
});

test("the controls change the result without changing the explorer's height", async ({ page }) => {
  await page.goto(PATH);
  await hydrate(page);
  const er = page.locator("[data-er]");
  const height = async () => (await er.boundingBox())!.height;
  const h0 = await height();
  const start = await readOuts(page);

  // Lowest threshold, by keyboard: more merges, providers chain together, precision falls.
  const slider = page.locator("#er-t");
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(page.locator('[data-out="t"]')).toHaveText("0.55");
  await expect(slider).toHaveAttribute("aria-valuetext", "0.55");
  await expect(page.locator('[data-out="bandLow"]')).toHaveText("0.40");
  const low = await readOuts(page);
  expect(Number(low.precision)).toBeLessThan(Number(start.precision));
  expect(low.largestNote).toMatch(/from \d+ true organisations/);
  await expect(page.locator(".er-card:not([data-empty]):not([data-ok])").first()).toBeVisible();
  expect(await height()).toBe(h0);

  // A narrower blocking key compares fewer pairs.
  await page.getByLabel("same state and town").check();
  await expect(page.locator('[data-out="compared"]')).not.toHaveText(low.compared!);
  const town = await readOuts(page);
  expect(Number(town.compared!.replace(/,/g, ""))).toBeLessThan(Number(low.compared!.replace(/,/g, "")));
  expect(await height()).toBe(h0);

  // Screen readers get one summary of the new setting.
  await expect(page.locator('[data-er] [aria-live="polite"]')).toContainText("Same state and town, merging at 0.55");
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("the default setting is readable and the controls say they need JavaScript", async ({ page }) => {
    await page.goto(PATH);
    await expect(page.locator("#er-t")).toBeDisabled();
    await expect(page.locator('[data-out="found"]')).toHaveText(/^\d[\d,]*$/);
    await expect(page.locator('[data-out="precision"]')).toHaveText(/^0\.\d\d$/);
    await expect(page.locator(".er-card:not([data-empty])").first()).toBeVisible();
    // Playwright's no-JS mode still parses <noscript> as scripting-on, so check the served markup.
    expect(await (await page.request.get(PATH)).text()).toMatch(/<noscript><p[^>]*>The controls need JavaScript/);
  });
});

test("if the data cannot load, the explorer says so and keeps the default setting", async ({ page }) => {
  await page.route(`**${DATA}`, (r) => r.abort());
  await page.goto(PATH);
  const ssr = await readOuts(page);
  await page.locator("[data-er]").scrollIntoViewIfNeeded();
  await expect(page.locator("[data-er-status]")).toBeVisible();
  await expect(page.locator("#er-t")).toBeDisabled();
  expect(await readOuts(page)).toEqual(ssr);
});
