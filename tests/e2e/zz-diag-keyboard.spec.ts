// TEMPORARY bug-hunt probe round 2 (P8.T1). Records evidence only; removed before merge.
import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "@playwright/test";

test("diag keyboard round 2", async ({ page, browserName }) => {
  const out: Record<string, unknown> = {};
  // Control: a bare page with two links and no script. Where does Tab go after the last one?
  await page.setContent('<a href="#a" id="a">first</a> <a href="#b" id="b">second</a>');
  const control: unknown[] = [];
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    control.push(await page.evaluate(() => ({ hasFocus: document.hasFocus(), active: document.activeElement?.id || document.activeElement?.tagName })));
  }
  out.control = control;
  // The video's focus-related properties as the tagger sees them.
  await page.goto("/work/manifold/");
  out.video = await page.evaluate(() => {
    const v = document.querySelector("video")!;
    const s = getComputedStyle(v);
    return { tabIndex: v.tabIndex, tabindexAttr: v.getAttribute("tabindex"), rects: v.getClientRects().length, visibility: s.visibility, hidden: !!v.closest("[inert], [hidden]") };
  });
  mkdirSync("screenshots/ci", { recursive: true });
  writeFileSync(`screenshots/ci/diag-kb2-${browserName}.json`, JSON.stringify(out, null, 1));
});
