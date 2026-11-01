// TEMPORARY bug-hunt probe (P8.T1, run 41349226660). Records evidence only, asserts nothing;
// removed before the PR merges. Output: screenshots/ci/diag-kb-<browser>-<route>.json (CI artifact).
import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "@playwright/test";

for (const path of ["/colophon/", "/work/manifold/"]) {
  test(`diag keyboard ${path}`, async ({ page, browserName }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(path);
    await page.evaluate(() => {
      document.querySelectorAll("a[href], button, summary, video[controls]").forEach((el, i) => ((el as HTMLElement).dataset.probe = String(i)));
    });
    const steps: unknown[] = [];
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      steps.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          const videos = [...document.querySelectorAll("video")];
          return {
            hasFocus: document.hasFocus(),
            tag: el?.tagName ?? null,
            probe: el?.dataset.probe ?? null,
            text: (el?.textContent ?? "").trim().slice(0, 25),
            isConnected: el?.isConnected ?? null,
            root: el ? (el.getRootNode() === document ? "document" : String(el.getRootNode())) : null,
            videosInDoc: videos.length,
            isTheDocVideo: el instanceof HTMLVideoElement ? videos.indexOf(el as HTMLVideoElement) : null,
            deepActive: (() => {
              let a: Element | null = document.activeElement;
              while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
              return a ? `${a.tagName}.${a.className}` : null;
            })(),
          };
        }),
      );
    }
    mkdirSync("screenshots/ci", { recursive: true });
    writeFileSync(`screenshots/ci/diag-kb-${browserName}-${path.replace(/\W+/g, "_")}.json`, JSON.stringify(steps, null, 1));
  });
}
