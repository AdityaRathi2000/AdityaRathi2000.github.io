// P6.T3 behaviour: the postings walkthrough says it is illustrative, shows everything without JS,
// and with JS offers tabs (arrow keys), a tier stepper and play, never fetching data.
import { expect, test, type Page } from "@playwright/test";
import { expectSameLayout } from "./layout";

const PATH = "/work/postings-extraction-stack/";
const visibleTags = (page: Page, tier: string) =>
  page.locator(`[data-panel]:visible .seg[data-tier="${tier}"] .seg-tag`).evaluateAll((els) => els.map((e) => getComputedStyle(e).visibility));

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("every posting and every tier is shown, and the controls stay hidden", async ({ page }) => {
    await page.goto(PATH);
    await expect(page.locator(".ner-chip")).toHaveText("Illustrative: excerpts labelled by hand, not the production model's output. Nothing runs in your browser.");
    await expect(page.locator("[data-panel]:visible")).toHaveCount(4);
    await expect(page.locator("[data-ner-controls]")).toBeHidden();
    // No orphan tab panels: without tabs the postings are plain articles named by their headings (audit B4/B5).
    await expect(page.getByRole("tabpanel")).toHaveCount(0);
    await expect(page.getByRole("article", { name: "Electrician U.S. Coast Guard" })).toBeVisible();
    for (const tier of ["rules", "encoder", "llm"]) expect(new Set(await visibleTags(page, tier))).toEqual(new Set(["visible"]));
  });
});

test("tabs switch postings, by click and by arrow key", async ({ page }) => {
  const json: string[] = [];
  page.on("request", (r) => (r.url().endsWith(".json") || ["fetch", "xhr"].includes(r.resourceType())) && json.push(r.url()));
  await page.goto(PATH, { waitUntil: "networkidle" });
  await expect(page.locator("[data-panel]:visible")).toHaveCount(1);
  await expect(page.locator('[data-panel="data-scientist"]')).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "Data Scientist", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Electrician" }).click();
  await expect(page.locator('[data-panel="electrician"]')).toBeVisible();
  await expect(page.getByRole("tab", { name: "Electrician" })).toBeFocused();
  await expect(page.locator('[data-panel="electrician"] .ner-why')).toHaveText("Rules matched nothing here and the encoder labelled every part; nothing needed the LLM.");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-panel="it-specialist"]')).toBeVisible();
  await expect(page.getByRole("tab", { name: "IT Specialist" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "IT Specialist" })).toHaveAttribute("aria-selected", "true");
  expect(json).toEqual([]);
});

test("the stepper inks tiers in cascade order without moving the text", async ({ page }) => {
  await page.goto(PATH);
  const text = page.locator('[data-panel="data-scientist"] .seg-text').first();
  // Document position (boundingBox is relative to the viewport, which scrolls when a button is clicked).
  const top = () => text.evaluate((el) => el.getBoundingClientRect().top + scrollY);
  const y0 = await top();
  await page.getByRole("button", { name: "Rules", exact: true }).click();
  await expect(page.locator("[data-ner]")).toHaveAttribute("data-step", "1");
  expect(new Set(await visibleTags(page, "rules"))).toEqual(new Set(["visible"]));
  expect(new Set(await visibleTags(page, "encoder"))).toEqual(new Set(["hidden"]));
  expect(new Set(await visibleTags(page, "llm"))).toEqual(new Set(["hidden"]));
  await page.getByRole("button", { name: "+ Encoder" }).click();
  expect(new Set(await visibleTags(page, "encoder"))).toEqual(new Set(["visible"]));
  expect(new Set(await visibleTags(page, "llm"))).toEqual(new Set(["hidden"]));
  expectSameLayout(await top(), y0, "segment text top");
  await expect(page.locator("[data-ner-status]")).toHaveText("Showing rules and the encoder.");
});

test("with reduced motion, play goes straight to all three tiers", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(PATH);
  await page.getByRole("button", { name: "Posting" }).click();
  await expect(page.locator("[data-ner]")).toHaveAttribute("data-step", "0");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator("[data-ner]")).toHaveAttribute("data-step", "3");
  await expect(page.locator("[data-ner]")).not.toHaveAttribute("data-playing", "");
});

test("play steps through the tiers and ends on all three", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(PATH);
  // Record every step the walkthrough shows (audit B6: a loop jumping straight to 3 must fail).
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-ner]")!;
    const w = window as unknown as { __steps: string[] };
    w.__steps = [];
    new MutationObserver(() => w.__steps.push(root.dataset.step!)).observe(root, { attributes: true, attributeFilter: ["data-step"] });
  });
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator("[data-ner]")).toHaveAttribute("data-playing", "");
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(page.locator("[data-ner]")).toHaveAttribute("data-step", "3", { timeout: 5000 });
  await expect(page.locator("[data-ner]")).not.toHaveAttribute("data-playing", "", { timeout: 2000 });
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __steps: string[] }).__steps)).toEqual(["0", "1", "2", "3"]);
});

test("print shows every posting and tier with its colours, and no controls (audit B1/B2)", async ({ page }) => {
  await page.goto(PATH);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-ner-controls]")).toBeHidden();
  await expect(page.locator("[data-panel]:visible")).toHaveCount(4);
  const adjust = await page.locator(".seg-text").first().evaluate((el) => getComputedStyle(el).printColorAdjust);
  expect(adjust).toBe("exact");
});
