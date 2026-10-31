// scripts/check-budgets.mjs counts a page's lazy chunks: the targets of dynamic import(), in
// every quote style the bundler emits. Regression guard for the bug where Vite's backtick form,
// import(`./x.js`), was missed and every lazy budget read 0 KB (found in P6, 2026-10-31).
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// A fake dist/: one page whose loader dynamically imports a 20 KB (incompressible) chunk.
function lazyKb(quote: string): number {
  const dist = mkdtempSync(join(tmpdir(), "budgets-"));
  mkdirSync(join(dist, "_astro"));
  writeFileSync(join(dist, "index.html"), `<!doctype html><script type="module" src="/_astro/loader.js"></script>`);
  writeFileSync(join(dist, "_astro", "loader.js"), `document.body&&import(${quote}./lazy.js${quote}).then(m=>m.start());`);
  const noise = randomBytes(15 * 1024).toString("base64");
  writeFileSync(join(dist, "_astro", "lazy.js"), `export const start=()=>${JSON.stringify(noise)};`);
  const out = execFileSync("node", ["scripts/check-budgets.mjs"], { env: { ...process.env, BUDGET_DIST: dist }, encoding: "utf8" });
  const m = out.match(/'([\d.]+) \/ \d+ KB'\s*│\s*'\d+ \/ \d+'/);
  assert.ok(m, out);
  return Number(m[1]);
}

for (const [name, q] of [["double quotes", '"'], ["single quotes", "'"], ["backticks", "`"]] as const) {
  test(`a dynamic import in ${name} is counted as lazy`, () => {
    assert.ok(lazyKb(q) > 5, `lazy chunk not counted with ${name}`);
  });
}
