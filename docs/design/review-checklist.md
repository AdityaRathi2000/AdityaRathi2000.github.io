# Review checklist

Every PR into `redesign` is checked against this list. Source: plan §4 (agent-swarm vetoes and unanimous conclusions). Each item names how it is enforced; "review" means a human or agent checks it by eye until a CI check exists.

## Vetoes (block the merge)

| # | Veto | Enforced by |
|---|---|---|
| V1 | A metric value typed anywhere except `src/content/metrics/metrics.yaml` | `scripts/check-no-literal-numbers.mjs` (P2.T2) |
| V2 | Synthetic or placeholder data without a permanent "Synthetic data, real mechanism" tag **and** a visibly different (dashed) frame | review; Playwright `numbers.spec.ts` |
| V3 | Kalshi JSON reaching the page without the schema parser (no raw import, no prop spreading, no client fetch at load) | Zod parse in the island; review |
| V4 | A metric without comparator or sample size, including inside the hero animation | metrics Zod `superRefine`; `numbers.spec.ts` |
| V5 | Typing effects, chat bubbles, spinners implying live inference | review |
| V6 | Manifold video autoplaying with sound | review; `<video muted playsinline preload="none">` |

## Three tests (every page with motion)

- **Freeze test:** a paused frame still carries information. `tests/e2e/freeze.spec.ts`.
- **Number test:** every visual traces to a registry metric id.
- **No-JS test:** with JS off, home still answers who / where / what shipped / three best numbers. `tests/e2e/nojs.spec.ts`.

## Content rules

- "What I got wrong" on all five case studies (three prompts, ≤ 120 words).
- Kalshi is an evaluation-methodology story: calibration, CRPS skill vs named baselines, gates, one postmortem. Never PnL, positions, sizes, per-city or per-timestamp granularity.
- BGI: résumé facts and diagrams using résumé numbers only. No code, data, or unpublished numbers.
- Home ≤ 350 words; hero ≤ 60 words.
- Removed: all 2022 course projects, skills grids, logo walls, chat widgets, MCP.

## Design rules (from tokens.md)

- No all-caps labels, eyebrows, middle-dot meta strings, "→" on links, "WORD — fragment" labels.
- Mono only for numerals, code, and chart labels.
- Accent at most once per viewport outside charts; `--data` red only inside charts.
- No gradients, glass, or shadows; only the 1 px hand-drawn figure frame.
- `prefers-reduced-motion`: figures fully drawn, no scrub.

## Budgets

- Home: ≤ 60 KB first-load JS + ≤ 40 KB lazy. Case study: ≤ 40 KB + ≤ 60 KB for one island.
- Lighthouse: perf ≥ 95; a11y, best practices, SEO = 100; LCP ≤ 1.5 s; CLS 0; TBT ≤ 100 ms.
- ≤ 2 font files on first paint.

## Known risks (measured)

- **Home LCP budget is 1.7 s, decided by Aditya (P4, 2026-10-30); every other page stays at 1.5 s.** Measured with
  Lighthouse mobile simulation, median of 3: the home page's LCP element is the hero paragraph (plain text), and its cost
  is the HTML size, not fonts. TCP's first round trip carries about 14 KB; above that the simulated 150 ms RTT adds a
  second. HTML 21.3 KB gzipped → 1.80 s; italic as `font-display: optional` → 1.80 s (no effect, not adopted); without
  the five rows (11.1 KB) → 1.65 s; single-stroke whole-unit thumbnails (`THUMB` in `src/lib/rough.ts`), whole-unit
  hero coordinates and no hatching in two thumbnails → **13.3 KB, 1.655 s**. Aditya accepted 1.65 s; the budget in
  `lighthouserc.json` is 1.7 s for `/` only. **Keep the home HTML under about 14 KB gzipped**: new inline SVG on the
  home page should use `THUMB`, and anything that pushes it over will cost a round trip. Text pages measure 1.35 s.
- **Accepted advisory: `extract-zip` ≤ 2.0.1 (2 high, no patched release), accepted by Aditya 2026-10-26.** Reached only through `@lhci/cli > lighthouse > puppeteer-core > @puppeteer/browsers`, which uses it to unpack a downloaded browser archive. Lighthouse CI here always runs against an installed Chrome, so that path never executes, and the package is a dev dependency that never ships. `tmp`, `uuid`, `basic-ftp` and `zod` advisories from the same tree are fixed with `pnpm.overrides` in package.json. The weekly workflow prints `pnpm audit` so a fix shows up; drop the override block when upstream catches up.
