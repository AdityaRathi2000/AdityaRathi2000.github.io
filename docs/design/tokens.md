# Design tokens

Source: approved redesign plan §5 (2026-10-26). `src/styles/tokens.css` is the implementation; if the two disagree, fix the CSS, or change this file in the same commit with a reason.

## Concept

An annotated engineering notebook, rendered as an illustrated essay. Hand-drawn diagrams carry the argument; numbers are set in mono with their denominators in the margin, as in a lab notebook; one scroll-driven figure on the home page explains the system Aditya is proudest of. Everything else is quiet.

## Colour

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#F2EEE6` | `#1A1D27` | page background (slightly grey warm paper, not cream / slate) |
| `--paper-2` | `#E8E2D6` | `#232736` | recessed figure band, code blocks |
| `--ink` | `#1E2230` | `#E8E3D8` | text, diagram strokes (iron-gall blue-black) |
| `--ink-2` | `#5A5F70` | `#A9ADBB` | captions, margin notes |
| `--accent` | `#2E3A8C` | `#9DB0FF` | links, live badge, the one highlighted stroke per figure |
| `--accent-wash` | `#DCE0F5` | `#2B3561` | hover/selection fill, chart bands |
| `--data` | `#B5443C` | `#F08C84` | comparator/baseline series, **inside charts only** |

Rules
- The accent appears at most once per viewport outside charts.
- No gradients, no glass, no shadows. The only frame is a 1 px hand-drawn (Rough.js) stroke around figures.
- Dark mode follows `prefers-color-scheme`; `[data-theme="light"|"dark"]` on `<html>` overrides it.

## Type

- Display + body: **Piazzolla** (OFL, variable weight + optical size), chosen at the P1.T4 tile gate on 2026-10-26 over Literata and Castoro. Body 1.125→1.25 rem fluid, line-height 1.55, measure ≤ 68ch. Italic is used for diagram annotations. No handwriting font.
- Numerals, code, chart labels: IBM Plex Mono, tabular lining figures. Mono is **not** used for UI labels or eyebrows.
- Fluid scale (Utopia-style `clamp()`, 390 → 1440 px): body 1.125→1.25 rem; h2 1.6→2.2 rem; h1/hero 2.4→4.5 rem.
- Sentence case everywhere. Banned: all-caps labels, tracked-out eyebrows, "WORD — fragment" labels, "→" on links, middle-dot meta strings.

## Layout

- Left-aligned single text column (max 68ch) with a wider figure band (max ~1100 px) that diagrams break out into.
- ≥ 1200 px: margin notes to the right of the text hold n / CI / baseline for the adjacent claim. Below that they collapse into expandable footnotes.
- Home rows are deliberately not identical cards: each row has a different figure and its own height.

## Motion

One orchestrated moment: the home hero figure assembles once (≈1.2 s), then scrubs with scroll through three stages. Case-study figures draw their strokes once on entering the viewport. Hover on a metric reveals its margin note. Nothing else moves. Under `prefers-reduced-motion`, figures render fully drawn with no scrub.

## Illustration

Rough.js at build time (`roughness 1.2`, `bowing 0.8`, stroke `--ink`, hachure fill in `--accent-wash`), generated from declarative specs in the repo so diagrams are reproducible and theme-aware (`currentColor` strokes). Zero client JS for diagrams.
