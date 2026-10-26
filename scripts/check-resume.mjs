// Fails unless every registry pdf_text string appears in the résumé PDF (plan P2.T4).
// Keeps the site and the PDF saying the same numbers.
// Usage: node scripts/check-resume.mjs [--pdf public/resume.pdf] [--metrics src/content/metrics/metrics.yaml]
//
// Pure JS (unpdf), so CI needs no system packages.
import { readFileSync } from "node:fs";
import { extractText, getDocumentProxy } from "unpdf";
import { parse as parseYaml } from "yaml";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const pdfPath = arg("--pdf", "public/resume.pdf");
const metricsPath = arg("--metrics", "src/content/metrics/metrics.yaml");

// Google Docs exports carry zero-width spaces and curly quotes; line wraps split hyphenated words.
const normalise = (s) =>
  s
    .normalize("NFKC")
    .replace(/[​-‍⁠﻿]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/-\s+/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const pdf = await getDocumentProxy(new Uint8Array(readFileSync(pdfPath)));
const { text } = await extractText(pdf, { mergePages: true });
const haystack = normalise(text);

const rows = parseYaml(readFileSync(metricsPath, "utf8")) ?? [];
const checked = rows.filter((r) => r.pdf_text);
const missing = checked.filter((r) => !haystack.includes(normalise(r.pdf_text)));

if (missing.length) {
  for (const r of missing) console.error(`${r.id}: "${r.pdf_text}" not found in ${pdfPath}`);
  console.error(`\n${missing.length} of ${checked.length} pdf_text strings missing. Update the PDF or the registry so they agree.`);
  process.exit(1);
}
console.log(`All ${checked.length} pdf_text strings found in ${pdfPath}.`);
