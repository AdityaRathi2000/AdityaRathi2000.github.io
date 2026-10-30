// Fails when a number appears in case-study prose outside <Metric> (plan §4, veto V1), or in the
// text of a diagram spec, where numbers come only from a node's `metric` binding.
// Usage: node scripts/check-no-literal-numbers.mjs [dir ...]   (default: src/content/case-studies src/diagrams)
//
// Checked: the MDX body, plus the frontmatter fields shown to readers (title, summary,
// what_i_got_wrong[].answer); in diagram specs (*.json), every string except the ids and
// metric references (keys: id, from, to, metric).
// Ignored: JSX/HTML tags (so <Metric id="..."/> passes), MDX comments, code, link URLs,
// ordered-list markers, four-digit years, and tokens that are part of a name
// (FP8, K-12, RTX 5090s, Qwen3.5-9B, FlashAttention-2).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

const dirs = process.argv.slice(2);
const targets = dirs.length ? dirs : ["src/content/case-studies", "src/diagrams"];

// Blank out a region but keep newlines, so reported line numbers stay true.
const blank = (s) => s.replace(/[^\n]/g, " ");

const STRIP = [
  /```[\s\S]*?```/g, // fenced code
  /`[^`\n]*`/g, // inline code
  /\{\/\*[\s\S]*?\*\/\}/g, // MDX comments
  /<[A-Za-z/][^>]*>/g, // JSX / HTML tags, including <Metric ... />
  /\]\([^)]*\)/g, // markdown link targets
  /^\s*(import|export)\s.*$/gm, // MDX import/export lines
  /^\s*\d+\.\s/gm, // ordered-list markers
];

// A number that stands alone: not glued to letters, digits, '-', '_', '.', or '/' on either side.
// A magnitude suffix (600M, 282K, 1.2B) still counts as a number; other letters make it a name.
const NUMBER = /(?<![\p{L}\p{N}_\-./])[~<>+]?\d[\d,]*(?:\.\d+)?(?:[kKMB](?![\p{L}\p{N}]))?(?:\s?(?:%|percent\b|per cent\b|×))?\+?(?![\p{L}\p{N}_\-/]|\.\d)/gu;
const YEAR = /^(19|20)\d{2}$/;

function findings(text, file, lineOffset) {
  const out = [];
  let clean = text;
  for (const re of STRIP) clean = clean.replace(re, blank);
  const lines = clean.split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(NUMBER)) {
      if (YEAR.test(m[0])) continue;
      out.push(`${file}:${i + 1 + lineOffset}:${m.index + 1}  "${m[0].trim()}" — use <Metric id="..."/> from metrics.yaml`);
    }
  });
  return out;
}

const problems = [];
let files = 0;
// Diagram specs: walk every string, keeping its JSON path for the report.
const NOT_TEXT = new Set(["id", "from", "to", "metric"]);
function jsonStrings(value, path, out) {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => jsonStrings(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) if (!NOT_TEXT.has(k)) jsonStrings(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

for (const dir of targets) {
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    files++;
    const file = join(dir, name);
    for (const [path, text] of jsonStrings(JSON.parse(readFileSync(file, "utf8")), "", [])) {
      problems.push(...findings(text, `${file} (${path})`, 0));
    }
  }
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".mdx") || n.endsWith(".md"))) {
    files++;
    const file = join(dir, name);
    const src = readFileSync(file, "utf8");
    const fm = src.match(/^---\n([\s\S]*?)\n---\n/);
    const bodyStart = fm ? fm[0].split("\n").length - 1 : 0;
    if (fm) {
      const data = parseYaml(fm[1]) ?? {};
      const shown = ["title", "summary"].filter((f) => typeof data[f] === "string").map((f) => [f, data[f]]);
      (Array.isArray(data.what_i_got_wrong) ? data.what_i_got_wrong : []).forEach((w, i) => {
        if (typeof w?.answer === "string") shown.push([`what_i_got_wrong[${i}].answer`, w.answer]);
      });
      for (const [field, text] of shown) {
        for (const f of findings(text, `${file} (frontmatter ${field})`, 0)) problems.push(f);
      }
    }
    problems.push(...findings(fm ? src.slice(fm[0].length) : src, file, bodyStart));
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} literal number(s) in ${files} file(s).`);
  process.exit(1);
}
console.log(`No literal numbers in ${files} file(s).`);
