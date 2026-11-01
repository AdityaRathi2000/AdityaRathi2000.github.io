// Same layout position or size, across engines. Engines lay out in integer units (Chromium and
// WebKit 1/64 px, Firefox 1/60 px), and reading one unchanged layout back as floats can differ
// below a unit (Firefox: 1817.83343 vs 1817.83342, both 109,070 app units; run 41343883186).
// Half the finest unit tolerates that and still fails on any real reflow.
import { expect } from "@playwright/test";

export const LAYOUT_EPSILON_PX = 1 / 128;

export function expectSameLayout(actual: number, expected: number, what: string) {
  expect(Math.abs(actual - expected), `${what} moved: ${expected} -> ${actual}`).toBeLessThan(LAYOUT_EPSILON_PX);
}
