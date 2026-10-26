// P1.T5 behaviour: theme toggle, persistence, no-JS fallback, footer build stamp.
import { expect, test } from "@playwright/test";

const PAPER_LIGHT = "rgb(242, 238, 230)";
const PAPER_DARK = "rgb(26, 29, 39)";
const bodyBg = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("follows the OS theme when nothing is saved", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  expect(await bodyBg(page)).toBe(PAPER_DARK);
  await expect(page.locator("[data-theme-toggle]")).toHaveAttribute("aria-pressed", "true");
});

test("toggle switches theme and the choice survives a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const toggle = page.locator("[data-theme-toggle]");

  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(await bodyBg(page)).toBe(PAPER_LIGHT);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await bodyBg(page)).toBe(PAPER_LIGHT);

  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bodyBg(page)).toBe(PAPER_DARK);
});

test("?theme= overrides the OS and ignores unknown values", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/?theme=dark");
  expect(await bodyBg(page)).toBe(PAPER_DARK);
  await page.goto("/?theme=%3Cscript%3E");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  expect(await bodyBg(page)).toBe(PAPER_LIGHT);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("toggle is hidden and the OS theme still applies", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("[data-theme-toggle]")).toBeHidden();
    expect(await bodyBg(page)).toBe(PAPER_DARK);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Aditya Rathi");
  });
});

test("footer carries the deploy date and a commit link", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  await expect(footer.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}$/);
  const commit = footer.locator('a[href*="/commit/"]');
  await expect(commit).toHaveText(/^[0-9a-f]{7}$/);
  await expect(commit).toHaveAttribute("href", /\/commit\/[0-9a-f]{40}$/);
  await expect(footer.getByRole("link", { name: "Colophon" })).toHaveAttribute("href", "/colophon/");
});
