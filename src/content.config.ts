/*
  Content model (plan P2.T2). Every number on the site lives in the metrics registry and is
  referenced by id; the rules below are the plan's §4 vetoes made executable:
    - every percent needs a baseline (comparator)
    - an estimated percent also needs evidence: sample size and an interval
    - counts carry scope + as_of, no interval
    - a draft row may omit those, but must say what it still needs, and <Metric> will not
      print its value (src/components/Metric.astro)
*/
import { defineCollection, reference } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";

// YAML reads `2026` as a number and `2026-10-26` as a Date; normalise both to text first.
const asOf = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "number" ? String(v) : v),
  z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "as_of is YYYY, YYYY-MM or YYYY-MM-DD"),
);
const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "ids are kebab-case");

const metrics = defineCollection({
  loader: file("src/content/metrics/metrics.yaml"),
  schema: z
    .object({
      id: kebab,
      status: z.enum(["ready", "draft"]),
      needs: z.string().optional(),
      label: z.string().min(3),
      value: z.number(),
      unit: z.enum(["percent", "count", "usd", "ms", "x"]),
      qualifier: z.enum(["approx", "lt", "gt", "at_least"]).optional(),
      scope: z.string().min(3),
      denominator: z.string().optional(),
      baseline: z.object({ label: z.string().min(3), value: z.number() }).optional(),
      as_of: asOf,
      provenance: z.enum(["measured", "reported", "estimated"]),
      evidence: z
        .object({
          n: z.number().int().positive(),
          ci: z.tuple([z.number(), z.number()]).optional(),
          ci_method: z.string().optional(),
          split: z.string().optional(),
        })
        .optional(),
      group: kebab.optional(),
      caveat: z.string().optional(),
      pdf_text: z.string().optional(),
    })
    .superRefine((m, ctx) => {
      if (m.status === "draft") {
        if (!m.needs) ctx.addIssue({ code: "custom", path: ["needs"], message: "a draft must say what it still needs" });
        return;
      }
      if (m.unit === "percent" && !m.baseline) {
        ctx.addIssue({ code: "custom", path: ["baseline"], message: "every percent needs a baseline (comparator)" });
      }
      if (m.unit === "percent" && m.provenance === "estimated" && !(m.evidence?.n && m.evidence?.ci)) {
        ctx.addIssue({ code: "custom", path: ["evidence"], message: "an estimated percent needs evidence.n and evidence.ci" });
      }
      if (m.evidence?.ci && m.evidence.ci[0] > m.evidence.ci[1]) {
        ctx.addIssue({ code: "custom", path: ["evidence", "ci"], message: "ci is [low, high]" });
      }
    }),
});

const wrongPrompts = ["believed", "measure-first", "still-cannot"] as const;

const caseStudies = defineCollection({
  loader: glob({ base: "./src/content/case-studies", pattern: "*.mdx" }),
  schema: z
    .object({
      title: z.string().min(3).max(90),
      order: z.number().int().min(1),
      kind: z.enum(["production", "personal", "client"]),
      status: z.enum(["draft", "published"]),
      period: z.coerce.string(),
      summary: z.string().max(160),
      stack: z.array(z.string()).min(1),
      headline_metrics: z.array(reference("metrics")).max(4),
      diagram: z.string().optional(),
      interactive: z.enum(["er-funnel", "kalshi-reliability", "ner-walkthrough"]).nullable(),
      what_i_got_wrong: z
        .array(z.object({ prompt: z.enum(wrongPrompts), answer: z.string() }))
        .length(3),
      notes: z
        .object({
          reruns: z.string().optional(),
          cost: z.string().optional(),
          lineage: z.string().optional(),
          gates: z.string().optional(),
        })
        .optional(),
    })
    .superRefine((c, ctx) => {
      if (c.status !== "published") return;
      const words = c.what_i_got_wrong.map((w) => w.answer.trim().split(/\s+/).filter(Boolean).length);
      if (words.some((n) => n === 0)) {
        ctx.addIssue({ code: "custom", path: ["what_i_got_wrong"], message: "a published case study answers all three prompts" });
      }
      if (words.reduce((a, b) => a + b, 0) > 120) {
        ctx.addIssue({ code: "custom", path: ["what_i_got_wrong"], message: "What I got wrong is 120 words at most" });
      }
    }),
});

const profile = defineCollection({
  loader: file("src/content/profile.yaml"),
  schema: z.object({
    name: z.string(),
    job_title: z.string(),
    employer: z.object({ name: z.string(), url: z.url() }),
    location: z.object({ city: z.string(), region: z.string(), country: z.string() }),
    positioning: z.string().refine((s) => s.trim().split(/\s+/).length <= 60, "hero is 60 words at most"),
    email: z.email(),
    phone: z.string(),
    links: z.object({
      github: z.url(),
      linkedin: z.url(),
      huggingface: z.url(),
    }),
    education: z.array(
      z.object({ school: z.string(), degree: z.string(), honors: z.string().optional(), year: z.number().int() }),
    ),
    pending_claims: z.array(z.string()).optional(),
  }),
});

const roles = defineCollection({
  loader: glob({ base: "./src/content/roles", pattern: "*.yaml" }),
  schema: z.object({
    org: z.string(),
    title: z.string(),
    kind: z.enum(["job", "internship", "project", "education"]),
    start: z.coerce.string().nullable(),
    end: z.coerce.string().nullable(),
    location: z.string().optional(),
    summary: z.string().max(240),
    metrics: z.array(reference("metrics")).default([]),
  }),
});

const skills = defineCollection({
  loader: file("src/content/skills.yaml"),
  schema: z
    .object({
      id: kebab,
      label: z.string(),
      case_studies: z.array(reference("caseStudies")).default([]),
      roles: z.array(reference("roles")).default([]),
    })
    .refine((s) => s.case_studies.length + s.roles.length > 0, "orphan skill: list the work that shows it"),
});

export const collections = { metrics, caseStudies, profile, roles, skills };
