// Screenshots every style tile at 1440 and 390 px in light and dark (P1.T4 gate).
// Usage: pnpm build && pnpm tiles:shoot   → screenshots/tiles/<tile>-<width>-<scheme>.png
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const PORT = 4329;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "screenshots/tiles";
const TILES = ["a", "b", "c"];
const WIDTHS = [1440, 390];
const SCHEMES = ["light", "dark"];

async function waitForServer(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`preview server did not start at ${url}`);
}

mkdirSync(OUT, { recursive: true });
// Own process group, so killing it also stops the astro child that pnpm spawns.
const server = spawn("pnpm", ["exec", "astro", "preview", "--port", String(PORT), "--host", "127.0.0.1", "--ignore-lock"], {
  stdio: "ignore",
  detached: true,
});

let failed = false;
try {
  await waitForServer(`${BASE}/tiles/a/`);
  const browser = await chromium.launch();
  for (const scheme of SCHEMES) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
        deviceScaleFactor: width === 390 ? 2 : 1,
        colorScheme: scheme,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      for (const tile of TILES) {
        await page.goto(`${BASE}/tiles/${tile}/`, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        const fonts = await page.evaluate(() =>
          [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.style}`),
        );
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        const file = `${OUT}/${tile}-${width}-${scheme}.png`;
        await page.screenshot({ path: file, fullPage: true });
        console.log(`${file}  fonts=[${fonts.join(", ")}]  hscroll=${overflow}`);
        if (overflow) failed = true;
      }
      if (errors.length) {
        console.error(`errors at ${width}/${scheme}:`, errors);
        failed = true;
      }
      await context.close();
    }
  }
  await browser.close();
} finally {
  process.kill(-server.pid, "SIGTERM");
}
process.exit(failed ? 1 : 0);
