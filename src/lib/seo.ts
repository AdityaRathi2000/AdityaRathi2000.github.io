/*
  Machine-readable profile (plan P2.T5): JSON-LD and OpenGraph data from profile.yaml.
  Email and phone are deliberately absent: the contact block obfuscates the email (P4.T4),
  and plain-text structured data would undo that.
*/
import type { CollectionEntry } from "astro:content";

type Profile = CollectionEntry<"profile">["data"];

export function personJsonLd(p: Profile, site: URL) {
  return {
    "@type": "Person",
    "@id": new URL("/#person", site).href,
    name: p.name,
    jobTitle: p.job_title,
    url: site.href,
    worksFor: { "@type": "Organization", name: p.employer.name, url: p.employer.url },
    address: { "@type": "PostalAddress", addressLocality: p.location.city, addressRegion: p.location.region, addressCountry: p.location.country },
    alumniOf: [...new Set(p.education.map((e) => e.school))].map((name) => ({ "@type": "CollegeOrUniversity", name })),
    sameAs: [p.links.github, p.links.linkedin, p.links.huggingface],
  };
}

export function pageJsonLd(p: Profile, site: URL, page: { url: URL; title: string; description: string; isHome: boolean }) {
  const person = personJsonLd(p, site);
  const graph = page.isHome
    ? [{ "@type": "ProfilePage", "@id": page.url.href, url: page.url.href, name: page.title, description: page.description, mainEntity: { "@id": person["@id"] } }, person]
    : [{ "@type": "WebPage", "@id": page.url.href, url: page.url.href, name: page.title, description: page.description, author: { "@id": person["@id"] } }, person];
  return { "@context": "https://schema.org", "@graph": graph };
}

/** JSON for an inline <script type="application/ld+json">, safe against "</script>" in any field. */
export function serialiseJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
