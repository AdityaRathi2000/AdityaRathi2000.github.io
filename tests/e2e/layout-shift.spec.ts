// Layout shift on a slow first visit (P4): the web font arrives after first paint, so text
// swaps from the metric-matched fallback (src/styles/fonts.css) to Piazzolla. Lighthouse in CI
// only sees that swap when the font loses the race, so this test forces it: throttled network,
// phone viewport, every route. Budget 0.035, the same as lighthouserc.json (Aditya, 2026-10-31;
// raised from 0.025 when the Manifold title, 0.029, showed any heading can re-wrap at some width).
// Before the matched fallbacks: home 0.038, colophon 0.139.
import { expect, test } from "@playwright/test";
import { ROUTES } from "./routes";

const BUDGET = 0.035;

for (const route of ROUTES) {
  test(`layout shift on a slow first visit: ${route.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 823 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(route.path, { waitUntil: "load" });
    // Fonts, then a beat for any late layout.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    expect(cls, `CLS ${cls.toFixed(5)}`).toBeLessThanOrEqual(BUDGET);
  });
}
