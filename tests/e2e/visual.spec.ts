// Screenshot grid for the PR receipt: every route x 390/1024/1440 x light/dark.
// Not a pixel diff; the images are reviewed by a person. Also fails on page errors
// and horizontal overflow, which are always bugs.
import { expect, test } from "@playwright/test";
import { LIVE_DATA_SELECTOR, ROUTES, SCHEMES, VIEWPORTS } from "./routes";

for (const route of ROUTES) {
  for (const width of VIEWPORTS) {
    for (const scheme of SCHEMES) {
      test(`${route.name} @${width} ${scheme}`, async ({ page, browserName }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await page.goto(route.path);
        await page.evaluate(() => document.fonts.ready);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);

        await page.screenshot({
          path: `screenshots/ci/${browserName}/${route.name}-${width}-${scheme}.png`,
          fullPage: true,
          mask: [page.locator(LIVE_DATA_SELECTOR)],
        });
        expect(errors).toEqual([]);
      });
    }
  }
}
