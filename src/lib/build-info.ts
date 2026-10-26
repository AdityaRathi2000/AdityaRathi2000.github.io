/*
  Build stamp for the footer. Evaluated once at build time.
  CI sets GITHUB_SHA; local builds ask git (fixed argv, no shell). If neither works,
  the footer simply omits the commit rather than showing a fake one.
*/
import { execFileSync } from "node:child_process";

const REPO = "https://github.com/AdityaRathi2000/AdityaRathi2000.github.io";

function commitSha(): string | null {
  const fromCi = process.env.GITHUB_SHA;
  if (fromCi && /^[0-9a-f]{40}$/.test(fromCi)) return fromCi;
  try {
    const local = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return /^[0-9a-f]{40}$/.test(local) ? local : null;
  } catch {
    return null;
  }
}

const sha = commitSha();
const builtAt = new Date();

export const buildInfo = {
  date: builtAt.toISOString().slice(0, 10),
  dateLabel: builtAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "America/New_York" }),
  shortSha: sha ? sha.slice(0, 7) : null,
  commitUrl: sha ? `${REPO}/commit/${sha}` : null,
};
