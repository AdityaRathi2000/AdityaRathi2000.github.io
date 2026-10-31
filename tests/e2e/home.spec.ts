// P4 behaviour: the home page answers who / where / what shipped / which numbers with JS off,
// every frame of the hero carries information (freeze test), every number has its context,
// the copy stays short, and the email address is never in the HTML as one string.
import { expect, test } from "@playwright/test";

test("without JavaScript: name, role, systems and their numbers are all there", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Aditya Rathi");
  await expect(page.locator(".role")).toContainText("Machine Learning Engineer at Burning Glass Institute");
  await expect(page.locator("[data-system]")).toHaveCount(5);
  // At least three numbers render (not "pending"), as the plan's no-JS test asks.
  const shown = page.locator("main .metric:not(.metric--pending)");
  expect(await shown.count()).toBeGreaterThanOrEqual(3);
  // The figure is drawn and assembled, not stuck in its first stage.
  await expect(page.locator("html.hero-motion")).toHaveCount(0);
  await expect(page.locator("[data-hero-funnel]")).toBeVisible();
  await expect(page.locator('[data-el="merge"]')).toHaveCSS("opacity", "1");
  await expect(page.locator('[data-el="block"]')).toHaveCSS("opacity", "1");
  const offsets = await page.locator('[data-el="links"] .r-draw').evaluateAll((ps) => [...new Set(ps.map((p) => getComputedStyle(p).strokeDashoffset))]);
  expect(offsets).toEqual(["0px"]);
  const transforms = await page.locator("[data-card]").evaluateAll((cs) => [...new Set(cs.map((c) => getComputedStyle(c).transform))]);
  expect(transforms).toEqual(["none"]);
  await context.close();
});

test("every rendered number has a comparator or a note with its scope", async ({ page }) => {
  await page.goto("/");
  const ids = await page.locator("main [data-metric]").evaluateAll((els) =>
    els.map((el) => ({ id: el.getAttribute("data-metric")!, cmp: !!el.querySelector(".metric-cmp"), pending: el.classList.contains("metric--pending") })),
  );
  expect(ids.length).toBeGreaterThan(0);
  for (const m of ids) {
    expect(m.pending, `${m.id} is a draft on the home page`).toBe(false);
    const note = await page.locator(`[data-metric-note="${m.id}"]`).count();
    expect(m.cmp || note > 0, `${m.id} has neither a comparator nor a note`).toBe(true);
  }
});

test("home copy stays under 350 words", async ({ page }) => {
  await page.goto("/");
  const words = await page.locator("main").evaluate((main) => {
    const clone = main.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("svg, .margin-note, .visually-hidden").forEach((n) => n.remove());
    return (clone.textContent ?? "").split(/\s+/).filter(Boolean).length;
  });
  expect(words).toBeLessThanOrEqual(350);
});

test("the email address is never one string in the HTML, and copies on click", async ({ page, context, request }) => {
  const html = await (await request.get("/")).text();
  expect(html).not.toContain("aditya.rathi2000@gmail.com");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const link = page.locator('#contact a[href^="mailto:"]');
  await expect(link).toHaveText("aditya.rathi2000@gmail.com");
  await page.locator("[data-copy-email]").click();
  await expect(page.locator("#contact .copied")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("aditya.rathi2000@gmail.com");
});

test.describe("hero with motion", () => {
  test.use({ viewport: { width: 1280, height: 820 } });

  test("freeze test: at every quarter of the scroll the figure and the step text carry information", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await page.locator("[data-hero][data-driven]").waitFor();
    const steps = page.locator("[data-hero-steps]");
    for (const [f, stage] of [
      [0.12, "0"],
      [0.37, "1"],
      [0.62, "2"],
      [0.87, "3"],
    ] as const) {
      await page.evaluate((frac) => {
        const s = document.querySelector("[data-hero-steps]")!.getBoundingClientRect();
        window.scrollTo(0, scrollY + s.top + frac * s.height - innerHeight * 0.6);
      }, f);
      await expect(page.locator("[data-hero]")).toHaveAttribute("data-stage", stage);
      // A visible card label, and the current step's text, in every frozen frame.
      const visibleCards = await page.locator("[data-card]").evaluateAll((cs) => cs.filter((c) => Number(getComputedStyle(c).opacity) > 0.5).length);
      expect(visibleCards, `cards visible at stage ${stage}`).toBeGreaterThan(0);
      await expect(steps.locator(`[data-step="${stage}"]`)).toHaveClass(/is-current/);
      await expect(steps.locator(`[data-step="${stage}"]`)).toBeInViewport();
    }
    // The last stage shows the merged provider; the step that says so names the real count.
    await expect(page.locator('[data-el="merge"]')).toHaveCSS("opacity", /^(0\.9\d*|1)$/);
    await expect(steps.locator('[data-step="3"] [data-metric="cvi-providers"]')).toBeVisible();
  });

  test("reduced motion: no scrubbing, the figure is fully drawn", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("html.hero-motion")).toHaveCount(0);
    await page.waitForTimeout(400);
    await expect(page.locator("[data-hero][data-driven]")).toHaveCount(0);
    await expect(page.locator('[data-el="merge"]')).toHaveCSS("opacity", "1");
  });

  test("print shows the assembled figure wherever the reader had scrolled", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await page.locator("[data-hero][data-driven]").waitFor();
    await page.emulateMedia({ media: "print", reducedMotion: "no-preference" });
    await expect(page.locator('[data-el="merge"]')).toHaveCSS("opacity", "1");
    const transforms = await page.locator("[data-card]").evaluateAll((cs) => cs.map((c) => getComputedStyle(c).transform));
    expect(new Set(transforms)).toEqual(new Set(["none"]));
    // Every step prints in full ink, whichever one was current on screen.
    const ink = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--ink)";
      document.body.append(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
    const stepColours = await page.locator("[data-hero-steps] li > p").evaluateAll((ps) => ps.map((p) => getComputedStyle(p).color));
    expect(new Set(stepColours)).toEqual(new Set([ink]));
  });
});
