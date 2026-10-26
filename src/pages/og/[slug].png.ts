// One OpenGraph PNG per page, at /og/<slug>.png. Case studies join when they are published.
import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection, getEntry } from "astro:content";
import { renderOg } from "../../lib/og";

export const getStaticPaths = (async () => {
  const profile = (await getEntry("profile", "aditya"))!.data;
  const pages = [
    { slug: "index", title: profile.name, description: `${profile.job_title} at ${profile.employer.name}, ${profile.location.city}.` },
    { slug: "colophon", title: "Colophon", description: "How this site is built: type, hand-drawn diagrams, and hosting." },
  ];
  const studies = await getCollection("caseStudies", (c) => c.data.status === "published");
  for (const c of studies) pages.push({ slug: c.id, title: c.data.title, description: c.data.summary });
  return pages.map((p, i) => ({ params: { slug: p.slug }, props: { ...p, seed: 7000 + i } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOg(props as { title: string; description: string; seed: number });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
