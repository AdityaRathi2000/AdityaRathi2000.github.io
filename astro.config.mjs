// @ts-check
import { defineConfig } from "astro/config";
import expressiveCode from "astro-expressive-code";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://adityarathi.com",
  trailingSlash: "ignore",
  integrations: [
    // expressive-code must come before mdx so it can handle fenced code in MDX.
    expressiveCode(),
    mdx(),
    sitemap({
      // Diagram specimens are a design reference (noindex), not content.
      filter: (page) => !page.includes("/diagrams/"),
    }),
  ],
});
