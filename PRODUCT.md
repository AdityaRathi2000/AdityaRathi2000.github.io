# Product

Source: the approved redesign plan (Q&A with Aditya, 2026-10-26), §1–2. No facts here were inferred beyond that plan.

## Platform

web

## Stack

Astro (content collections, islands), MDX, plain CSS custom properties, build-time Rough.js SVG, D3 sub-packages for one chart. GitHub Actions to GitHub Pages; custom domain adityarathi.com.

## Users

Recruiters and hiring managers at AI-native startups, big-tech MLE / Applied Scientist teams, and AI labs (equal weight); quant and trading firms second. They scan for about 90 seconds before deciding whether to read a case study.

## Product Purpose

Personal site of Aditya Rathi, Machine Learning Engineer at Burning Glass Institute, New York. It has to make the 90-second scan land: a production ML engineer who owns systems end to end and is honest about his numbers.

## Positioning

Five production systems, each shown with its baseline and what went wrong. It is not a researcher's text archive and not a templated developer portfolio.

## Operating Context

Read on laptops during recruiter screening and on phones from LinkedIn links. Updated twice a year by Aditya alone, so updates must be cheap: edit metrics.yaml, an MDX file, or resume.pdf, then push.

## Capabilities and Constraints

- Home plus five case studies: CVI entity resolution, postings extraction stack, 600M-record classifier, Kalshi weather model, Manifold. Sophos and BrainAI are short entries.
- Every number is typed once in a metrics registry with a comparator or scope.
- BGI: résumé facts only. Kalshi: calibration and methodology only, never PnL, positions, or sizes.
- Lighthouse perf ≥ 95; home ≤ 60 KB first-load JS.

## Brand Commitments

Warm grey paper, iron-gall ink, fountain-pen indigo accent; serif display and body with IBM Plex Mono for numbers; hand-drawn diagrams; one cinematic hero moment; dark mode. Full system in docs/design/tokens.md.

## Evidence on Hand

Résumé (Oct 2026), formal headshot, Manifold 30-second teaser video and poster, live Kalshi calibration data (sanitized nightly export, phase 7).

## Product Principles

- Proof over adjectives: every claim carries a number with its comparator.
- Candour is a feature: each case study ends with "What I got wrong".
- One memorable thing per page; everything else quiet.

## Accessibility & Inclusion

WCAG AA contrast in both themes, full keyboard access, `prefers-reduced-motion` respected, works without JavaScript.
