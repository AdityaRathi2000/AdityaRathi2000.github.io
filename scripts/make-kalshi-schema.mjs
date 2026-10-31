// Writes schemas/kalshi-reliability.schema.json from the site's parser (src/lib/kalshi-reliability.ts),
// so the contract the phase-7 exporter validates against is the one the site enforces.
// Cross-field rules (isotonic curve, value inside ci, 48-hour lag, counts summing to n) are not
// expressible here; the site's parser still applies them at build time.
//   node scripts/make-kalshi-schema.mjs
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "astro/zod";
import { Reliability } from "../src/lib/kalshi-reliability.ts";

export function schemaText() {
  const schema = {
    $id: "https://adityarathi.com/schemas/kalshi-reliability.schema.json",
    title: "Weather-model reliability summary",
    description: "Generated from src/lib/kalshi-reliability.ts. Evaluation only: no profit, positions, sizes, or per-city / per-forecast detail.",
    ...z.toJSONSchema(Reliability, { io: "input" }),
  };
  return JSON.stringify(schema, null, 2) + "\n";
}

// Run as a script (pathToFileURL: the module URL is percent-encoded, a raw argv path is not; argv[1] is
// undefined under node -e).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync("schemas/kalshi-reliability.schema.json", schemaText());
  console.log("schemas/kalshi-reliability.schema.json written");
}
