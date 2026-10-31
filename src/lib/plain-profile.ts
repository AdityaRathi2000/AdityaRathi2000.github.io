/*
  Plain-text views of the profile for machines: /llms.txt and /resume.md (plan P2.T5).
  Built from the same registry as the pages, so every number matches. Draft metrics are
  left out; they appear once Aditya marks them ready.
*/
import { getCollection, getEntry, type CollectionEntry } from "astro:content";
import { formatAsOf, formatValue } from "./metrics";

const SITE = "https://adityarathi.com";

// The hero copy ends by pointing "below" at the case studies; that sentence means nothing out of page.
const standalone = (text: string) =>
  text
    .trim()
    .split(/(?<=\.)\s+/)
    .filter((s) => !/^Below\b/.test(s))
    .join(" ");

// "Jun 2023 to present", "2022", "May 2023": shared by resume.md and the home timeline.
export const span = (start: string | null, end: string | null) => {
  const a = start ? formatAsOf(start) : null;
  const b = end ? formatAsOf(end) : "present";
  if (!a) return b;
  return a === b ? a : `${a} to ${b}`;
};

async function readyMetrics(ids: { id: string }[]) {
  const rows = await Promise.all(ids.map((r) => getEntry("metrics", r.id)));
  return rows.filter((m): m is CollectionEntry<"metrics"> => !!m && m.data.status === "ready");
}

const metricLine = (m: CollectionEntry<"metrics">) => {
  const d = m.data;
  const cmp = d.baseline ? `, vs ${formatValue({ value: d.baseline.value, unit: d.unit })} ${d.baseline.label}` : "";
  return `- ${formatValue(d)} ${d.label}${cmp} (${d.scope}; as of ${formatAsOf(d.as_of)})`;
};

export async function llmsTxt(): Promise<string> {
  const p = (await getEntry("profile", "aditya"))!.data;
  const studies = (await getCollection("caseStudies", (c) => c.data.status === "published")).sort((a, b) => a.data.order - b.data.order);
  const lines = [
    `# ${p.name}`,
    "",
    `> ${p.job_title} at ${p.employer.name}, ${p.location.city}. ${standalone(p.positioning)}`,
    "",
    "## Work",
    "",
    ...(studies.length
      ? studies.map((c) => `- [${c.data.title}](${SITE}/work/${c.id}/): ${c.data.summary}`)
      : ["- Case studies are being written; see the résumé below."]),
    "",
    "## Résumé",
    "",
    `- [Résumé (PDF)](${SITE}/resume.pdf)`,
    `- [Résumé (Markdown)](${SITE}/resume.md): the same facts as plain text`,
    "",
    "## Elsewhere",
    "",
    `- [GitHub](${p.links.github})`,
    `- [LinkedIn](${p.links.linkedin})`,
    `- [Hugging Face](${p.links.huggingface})`,
    "",
  ];
  return lines.join("\n");
}

export async function resumeMd(): Promise<string> {
  const p = (await getEntry("profile", "aditya"))!.data;
  const roles = (await getCollection("roles")).sort((a, b) => String(b.data.end ?? "9999").localeCompare(String(a.data.end ?? "9999")));
  const out = [`# ${p.name}`, "", `${p.job_title}, ${p.employer.name}. ${p.location.city}, ${p.location.region}.`, "", `Site: ${SITE}  `, `GitHub: ${p.links.github}  `, `LinkedIn: ${p.links.linkedin}`, ""];
  for (const kind of ["job", "internship", "project", "education"] as const) {
    const group = roles.filter((r) => r.data.kind === kind);
    if (!group.length) continue;
    out.push(`## ${{ job: "Experience", internship: "Internships", project: "Projects", education: "Education" }[kind]}`, "");
    for (const r of group) {
      const when = span(r.data.start, r.data.end);
      out.push(`### ${r.data.title}, ${r.data.org}`, "", `${when}${r.data.location ? `. ${r.data.location}` : ""}`, "", r.data.summary.trim(), "");
      const ms = await readyMetrics(r.data.metrics);
      if (ms.length) out.push(...ms.map(metricLine), "");
    }
  }
  return out.join("\n");
}
