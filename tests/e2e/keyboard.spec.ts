// P8.T1 keyboard pass: on every route, Tab alone reaches every focusable control in order, each one
// shows a focus ring (WCAG 2.4.7) and is visible, not off-screen or behind other content such as the
// sticky hero (2.4.11), and focus is never trapped (2.1.2).
// Limits: the covered check uses elementFromPoint, which looks through pointer-events: none layers
// and reports an ancestor's ::before/::after overlay as the ancestor itself (the site has neither).
import { expect, test, type Page } from "@playwright/test";
import { ROUTES } from "./routes";

type Stop = { id: string; ring: boolean; covered: string | null; media: boolean };

// Tags every element Tab should land on with data-kb, in DOM order, and returns the ids. Each also
// keeps its unfocused outline and shadow in data-kb-base, so a ring must be something focus adds.
// Radios take one stop per group (the checked one, else the first); tabindex="-1" is skipped.
// A media element with controls counts once: its native buttons are several stops (the number
// varies by engine) that all report the <video> as document.activeElement.
function tagTabStops(page: Page) {
  return page.evaluate(() => {
    const sel = 'a[href], button, input, select, textarea, summary, video[controls], audio[controls], [tabindex]:not([tabindex="-1"])';
    const seenRadioGroups = new Set<string>();
    const ids: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled || el.closest("[inert], [hidden]")) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || el.getClientRects().length === 0) continue;
      if (el instanceof HTMLInputElement && el.type === "radio") {
        if (seenRadioGroups.has(el.name)) continue;
        const group = [...document.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${el.name}"]`)];
        if ((group.find((r) => r.checked) ?? group[0]) !== el) continue;
        seenRadioGroups.add(el.name);
      }
      el.dataset.kb = String(ids.length);
      el.dataset.kbBase = JSON.stringify({ outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`, shadow: style.boxShadow });
      ids.push(el.dataset.kb);
    }
    return ids;
  });
}

function describeFocus(page: Page): Promise<Stop | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    const base = JSON.parse(el.dataset.kbBase ?? "{}") as { outline?: string; shadow?: string };
    const transparent = (c: string) => c === "transparent" || /^rgba\(.*,\s*0\)$/.test(c);
    const outline = `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`;
    // A shadow layer shows only with a colour and some size; unparsed formats count as no ring.
    const shadowShows = [...s.boxShadow.matchAll(/(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?/g)].some(
      ([, c, x, y, blur, spread = "0"]) => !transparent(c) && Math.abs(+x) + Math.abs(+y) + +blur + Math.max(+spread, 0) > 0,
    );
    const ring =
      (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 && !transparent(s.outlineColor) && outline !== base.outline) ||
      (shadowShows && s.boxShadow !== base.shadow);
    // Judge the part of the control inside the viewport; none at all means it is off-screen.
    const r = el.getBoundingClientRect();
    const left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth);
    const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight);
    let covered: string | null = "nothing: off-screen";
    if (right > left && bottom > top) {
      const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      covered = hit && hit !== el && !el.contains(hit) && !hit.contains(el) ? `${hit.tagName.toLowerCase()}.${hit.className}` : null;
    }
    return { id: el.dataset.kb ?? `untagged ${el.tagName.toLowerCase()}#${el.id}`, ring, covered, media: el instanceof HTMLMediaElement };
  });
}

for (const route of ROUTES) {
  for (const width of [390, 1280]) {
    test(`keyboard: ${route.name} @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(route.path);
      await page.evaluate(() => document.fonts.ready);
      // The explorer's controls stay disabled until it loads, 600px before it scrolls into view. A
      // Tab-only reader gets there in time (12/12 runs, it loads 4-16 stops early); loading it here
      // keeps a slow CI runner from turning that margin into a flake.
      const er = page.locator("[data-er]");
      if (await er.count()) {
        await er.scrollIntoViewIfNeeded();
        await expect(er).toHaveAttribute("data-er-ready", "");
        await page.evaluate(() => scrollTo(0, 0));
      }
      const expected = await tagTabStops(page);

      const stops: Stop[] = [];
      for (let i = 0; i < expected.length + 15; i++) {
        await page.keyboard.press("Tab");
        const stop = await describeFocus(page);
        if (!stop || (stops.length && stop.id === stops[0].id)) break; // left the page or wrapped
        if (stop.media && stops.at(-1)?.id === stop.id) continue; // another native button of the same player
        stops.push(stop);
      }

      expect(stops.map((s) => s.id), "Tab order vs DOM order").toEqual(expected);
      // A player's ring is drawn by the browser inside its native controls, out of reach of page styles.
      expect(stops.filter((s) => !s.ring && !s.media).map((s) => s.id), "stops without a visible focus ring").toEqual([]);
      expect(stops.filter((s) => s.covered).map((s) => `${s.id} under ${s.covered}`), "focused control hidden or off-screen").toEqual([]);
    });
  }
}
