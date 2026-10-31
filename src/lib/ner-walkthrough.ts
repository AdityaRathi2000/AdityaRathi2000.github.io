/*
  The postings page's cascade walkthrough (plan P6.T3): which tier of the extraction cascade
  would label each part of a posting. Pure; unit-tested in tests/unit/ner-walkthrough.test.ts.

  The data (src/data/ner-walkthrough.json) is illustrative (Aditya, 2026-10-31): excerpts of
  public USAJOBS announcements, labelled by hand. It is not the production model's output, and
  the NER model is the team's (copy rule, 2026-10-30), so nothing here carries a score.
*/
import { z } from "astro/zod";

export const TIERS = ["rules", "encoder", "llm"] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_NAMES: Record<Tier, string> = { rules: "Rules", encoder: "Encoder", llm: "LLM" };

/** A subset of the section types the page names (education, experience, skills, certifications, responsibilities and more). */
export const LABELS = ["responsibilities", "experience", "skills", "education", "certifications", "conditions"] as const;

const Segment = z.strictObject({
  text: z.string().min(3).max(400),
  label: z.enum(LABELS),
  tier: z.enum(TIERS),
  why: z.string().min(10).max(200),
});

const Posting = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(3).max(80),
  agency: z.string().min(3).max(80),
  announcement: z.string().min(3).max(40),
  opened: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Federal announcements only: works of the US government are public domain. */
  url: z.string().regex(/^https:\/\/www\.usajobs\.gov\/job\/\d+$/),
  blocks: z.array(z.strictObject({ heading: z.string().min(2).max(60), segments: z.array(Segment).min(1) })).min(1),
});

export const Walkthrough = z
  .strictObject({
    meta: z.strictObject({ illustrative: z.literal(true), annotated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().min(20) }),
    postings: z.array(Posting).min(2).max(6),
  })
  .superRefine((w, ctx) => {
    const ids = w.postings.map((p) => p.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["postings"], message: "posting ids are unique" });
  });

export type WalkthroughData = z.infer<typeof Walkthrough>;
export type PostingData = WalkthroughData["postings"][number];

export const parseWalkthrough = (raw: unknown): WalkthroughData => Walkthrough.parse(raw);

/** Segments each tier labels in one posting, in cascade order. */
export function tierCounts(p: PostingData): Record<Tier, number> {
  const c: Record<Tier, number> = { rules: 0, encoder: 0, llm: 0 };
  for (const b of p.blocks) for (const s of b.segments) c[s.tier]++;
  return c;
}

/** Step 0 shows the bare posting; step k inks the first k tiers (the CSS in NerWalkthrough.astro does the inking). */
export const STEPS = TIERS.length;

/** The sidebar line when a posting never needed the LLM, true to which tiers did the work. */
export function noLlmNote(c: Record<Tier, number>): string {
  if (c.llm > 0) throw new Error("noLlmNote: this posting did need the LLM");
  return c.rules ? "Rules and the encoder labelled every part; nothing here needed the LLM." : "Rules matched nothing here and the encoder labelled every part; nothing needed the LLM.";
}
