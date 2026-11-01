// TEMPORARY bug-hunt probe (P8.T2, run 41343883186). Records evidence only, asserts nothing;
// removed before the PR merges. Output: screenshots/ci/diag-<browser>.json (CI artifact).
import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "@playwright/test";

const out: Record<string, unknown> = {};
const save = (browser: string) => {
  mkdirSync("screenshots/ci", { recursive: true });
  writeFileSync(`screenshots/ci/diag-${browser}.json`, JSON.stringify(out, null, 2));
};

test.describe.configure({ mode: "serial" });

// F4: which <video> configurations make this engine fetch the file without a play press?
test("diag F4: video fetches under preload=none", async ({ page, browserName }) => {
  test.skip(browserName === "chromium", "probe is for firefox/webkit");
  const reqs: { url: string; range: string | null; type: string }[] = [];
  page.on("request", (r) => r.url().includes(".mp4") && reqs.push({ url: r.url(), range: r.headers()["range"] ?? null, type: r.resourceType() }));
  const done: Record<string, unknown> = {};
  page.on("requestfinished", async (r) => {
    if (!r.url().includes(".mp4")) return;
    const res = await r.response();
    done[r.url()] = { status: res?.status(), sizes: await r.sizes().catch((e) => String(e)) };
  });
  page.on("requestfailed", (r) => r.url().includes(".mp4") && (done[r.url()] = { failed: r.failure()?.errorText }));

  await page.goto("/work/manifold/");
  await page.waitForTimeout(2000);
  const original = await page.locator("video").evaluate((v: HTMLVideoElement) => ({ networkState: v.networkState, readyState: v.readyState, buffered: v.buffered.length, preload: v.preload }));

  // Variants inserted into the same page, each with its own query string so requests are attributable.
  const variants: Record<string, string> = {
    asIs: '<video src="/media/manifold-teaser.mp4?v=asIs" poster="/media/manifold-teaser-poster.webp" controls muted playsinline preload="none"></video>',
    noControls: '<video src="/media/manifold-teaser.mp4?v=noControls" poster="/media/manifold-teaser-poster.webp" muted playsinline preload="none"></video>',
    noPoster: '<video src="/media/manifold-teaser.mp4?v=noPoster" controls muted playsinline preload="none"></video>',
    notMuted: '<video src="/media/manifold-teaser.mp4?v=notMuted" poster="/media/manifold-teaser-poster.webp" controls playsinline preload="none"></video>',
    sourceChild: '<video poster="/media/manifold-teaser-poster.webp" controls muted playsinline preload="none"><source src="/media/manifold-teaser.mp4?v=sourceChild" type="video/mp4"></video>',
    metadataControl: '<video src="/media/manifold-teaser.mp4?v=metadataControl" controls muted playsinline preload="metadata"></video>',
  };
  for (const [name, html] of Object.entries(variants)) {
    await page.evaluate(([n, h]) => {
      const d = document.createElement("div");
      d.id = `diag-${n}`;
      d.innerHTML = h;
      document.body.append(d);
    }, [name, html]);
  }
  await page.waitForTimeout(3000);
  const states = await page.evaluate((names) => Object.fromEntries(names.map((n) => {
    const v = document.querySelector<HTMLVideoElement>(`#diag-${n} video`)!;
    return [n, { networkState: v.networkState, readyState: v.readyState, buffered: v.buffered.length, preload: v.preload }];
  })), Object.keys(variants));
  out.F4 = { original, states, requests: reqs, finished: done };
  save(browserName);
});

// F2: which clipboard permission names does this engine accept, and can the copy be observed?
test("diag F2: clipboard", async ({ browser, browserName }) => {
  test.skip(browserName === "chromium", "probe is for firefox/webkit");
  const accepted: Record<string, string> = {};
  for (const p of ["clipboard-read", "clipboard-write"]) {
    const c = await browser.newContext();
    accepted[p] = await c.grantPermissions([p]).then(() => "ok", (e) => String(e).split("\n")[0]);
    await c.close();
  }
  const ctx = await browser.newContext();
  const grantable = Object.keys(accepted).filter((p) => accepted[p] === "ok");
  if (grantable.length) await ctx.grantPermissions(grantable);
  const page = await ctx.newPage();
  await page.goto("/");
  await page.locator("[data-copy-email]").click();
  const copiedText = await page.locator("#contact .copied").textContent({ timeout: 3000 }).catch((e) => `ERR ${String(e).split("\n")[0]}`);
  const readText = await Promise.race([
    page.evaluate(() => navigator.clipboard.readText().then((t) => `ok:${t}`, (e) => `rejected:${e}`)),
    new Promise<string>((r) => setTimeout(() => r("timeout"), 3000)),
  ]);
  // Paste into a fresh textarea with the keyboard (a trusted user gesture, no clipboard API).
  await page.evaluate(() => {
    const t = document.createElement("textarea");
    t.id = "diag-paste";
    document.body.append(t);
  });
  await page.locator("#diag-paste").focus();
  await page.keyboard.press("ControlOrMeta+V");
  const pasted = await page.locator("#diag-paste").inputValue();
  out.F2 = { accepted, granted: grantable, copiedText, readText, pastedLength: pasted.length, pastedMatches: pasted === "aditya.rathi2000@gmail.com" };
  save(browserName);
  await ctx.close();
});

// F1/F3: does the measured box change with no interaction at all, and by how much in app units?
test("diag F1/F3: measurement jitter without interaction", async ({ page, browserName }) => {
  test.skip(browserName === "chromium", "probe is for firefox/webkit");
  await page.goto("/work/cvi-entity-resolution/");
  await page.locator("#er-t").isEnabled();
  await page.waitForTimeout(1000);
  const er = page.locator("[data-er]");
  const heights = [];
  for (let i = 0; i < 5; i++) heights.push((await er.boundingBox())!.height);
  const rect = await er.evaluate((el) => ({ rectHeight: el.getBoundingClientRect().height, offsetHeight: (el as HTMLElement).offsetHeight }));
  out.F1F3 = { boundingBoxHeights: heights, rect, x60: heights.map((h) => h * 60) };
  save(browserName);
});
