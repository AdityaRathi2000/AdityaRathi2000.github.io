// Per-route JS and font budgets (plan §4 / P1.T6), measured on dist/ after `astro build`.
//
// size-limit measures files, not routes; Astro hashes chunks and shares them between pages,
// so this walks each page's script graph instead:
//   first-load = inline scripts + <script src> + modulepreload + their static imports
//   lazy       = island component/renderer URLs + dynamic import() targets
// Sizes are gzip, which is what the visitor downloads.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = resolve(process.env.BUDGET_DIST ?? "dist");
const KB = 1024;

// Plan §4: home ≤ 60 KB + ≤ 40 KB lazy; case study ≤ 40 KB + ≤ 60 KB for one island.
const BUDGETS = [
  { match: (r) => r === "/", first: 60 * KB, lazy: 40 * KB, label: "home" },
  { match: (r) => r.startsWith("/work/"), first: 40 * KB, lazy: 60 * KB, label: "case study" },
  { match: () => true, first: 40 * KB, lazy: 60 * KB, label: "other" },
];
const MAX_PRELOADED_FONTS = 2;

const gz = (buf) => gzipSync(buf, { level: 9 }).length;

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return htmlFiles(p);
    return name.endsWith(".html") ? [p] : [];
  });
}

function routeOf(file) {
  const rel = "/" + relative(DIST, file).replace(/\\/g, "/");
  return rel.replace(/index\.html$/, "").replace(/\.html$/, "");
}

function fileFor(url, fromFile) {
  if (/^(https?:)?\/\//.test(url)) throw new Error(`external script ${url} — not allowed`);
  const clean = url.split(/[?#]/)[0];
  return clean.startsWith("/") ? join(DIST, clean) : resolve(dirname(fromFile), clean);
}

// Walks static imports (counted) and collects dynamic imports (returned as lazy roots).
function walk(file, seen, lazyRoots) {
  if (seen.has(file)) return 0;
  seen.add(file);
  const src = readFileSync(file);
  const text = src.toString("utf8");
  let total = gz(src);
  for (const m of text.matchAll(/(?:^|[;\s}])import\s*(?:[^"'()]*?from\s*)?["']([^"']+\.m?js)["']/g)) {
    total += walk(fileFor(m[1], file), seen, lazyRoots);
  }
  for (const m of text.matchAll(/import\(\s*["']([^"']+\.m?js)["']\s*\)/g)) {
    lazyRoots.add(fileFor(m[1], file));
  }
  return total;
}

let failed = false;
const rows = [];

for (const file of htmlFiles(DIST)) {
  const route = routeOf(file);
  const html = readFileSync(file, "utf8");
  const budget = BUDGETS.find((b) => b.match(route));
  const seen = new Set();
  const lazyRoots = new Set();
  let first = 0;

  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1];
    if (/type=["']application\/(ld\+)?json["']/.test(attrs)) continue;
    const src = attrs.match(/\bsrc=["']([^"']+)["']/);
    first += src ? walk(fileFor(src[1], file), seen, lazyRoots) : gz(Buffer.from(m[2]));
  }
  for (const m of html.matchAll(/<link\b[^>]*rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/g)) {
    first += walk(fileFor(m[1], file), seen, lazyRoots);
  }
  for (const m of html.matchAll(/\b(?:component|renderer)-url=["']([^"']+)["']/g)) {
    lazyRoots.add(fileFor(m[1], file));
  }

  let lazy = 0;
  const lazySeen = new Set(seen);
  for (const root of lazyRoots) lazy += walk(root, lazySeen, lazyRoots);

  const fonts = [...html.matchAll(/<link\b[^>]*rel=["']preload["'][^>]*as=["']font["']/g)].length;

  const over = first > budget.first || lazy > budget.lazy || fonts > MAX_PRELOADED_FONTS;
  if (over) failed = true;
  rows.push({
    route,
    budget: budget.label,
    "first-load gz": `${(first / KB).toFixed(1)} / ${budget.first / KB} KB`,
    "lazy gz": `${(lazy / KB).toFixed(1)} / ${budget.lazy / KB} KB`,
    "preloaded fonts": `${fonts} / ${MAX_PRELOADED_FONTS}`,
    status: over ? "OVER" : "ok",
  });
}

rows.sort((a, b) => a.route.localeCompare(b.route));
console.table(rows);
if (failed) {
  console.error("Budget exceeded on at least one route.");
  process.exit(1);
}
console.log(`All ${rows.length} routes within budget.`);
