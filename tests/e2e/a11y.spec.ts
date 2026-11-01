// axe-core WCAG 2.2 A/AA scan of every route in both themes, at phone and desktop widths
// (P8.T1 added 2.2 and the phone width; interactive states measured clean, 2026-11-01).
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ROUTES, SCHEMES } from "./routes";

for (const route of ROUTES) {
  for (const scheme of SCHEMES) {
    for (const width of [390, 1280]) {
      test(`axe: ${route.name} ${scheme} @${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(route.path);
        await page.evaluate(() => document.fonts.ready);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
      });
    }
  }
}
