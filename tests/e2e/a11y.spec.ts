// axe-core WCAG 2.1 A/AA scan of every route in both themes.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ROUTES, SCHEMES } from "./routes";

for (const route of ROUTES) {
  for (const scheme of SCHEMES) {
    test(`axe: ${route.name} ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(route.path);
      await page.evaluate(() => document.fonts.ready);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
    });
  }
}
