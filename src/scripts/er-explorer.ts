/*
  Client driver for the CVI explorer (plan P6.T1). Loaded by ErExplorer.astro when the section
  nears the viewport. Fetches the synthetic sample, refuses it unless it parses as synthetic,
  then re-evaluates on every control change and writes text and sizes into the server-rendered
  markup. All maths and wording live in src/lib/er-explorer.ts; nothing here changes layout.
*/
import {
  HIST,
  HIST_MAX,
  evaluate,
  fmtCount,
  fmtJudgeShare,
  fmtScore,
  histBarHeight,
  histDesc,
  histLabelY,
  largestNote,
  logWidth,
  parseSample,
  placeOf,
  sim,
  summaryText,
  type ErResult,
} from "../lib/er-explorer";

export async function start(root: HTMLElement): Promise<void> {
  const res = await fetch(root.dataset.src!);
  if (!res.ok) throw new Error(`er-sample.json: HTTP ${res.status}`);
  const s = parseSample(await res.json());
  const yMax = Number(root.dataset.ymax) || 1;

  const controls = root.querySelector<HTMLFieldSetElement>("[data-er-controls]")!;
  const slider = root.querySelector<HTMLInputElement>("#er-t")!;
  const radios = [...root.querySelectorAll<HTMLInputElement>('input[name="er-key"]')];
  const out = (k: string) => root.querySelector<HTMLElement>(`[data-out="${k}"]`);
  const cards = [...root.querySelectorAll<HTMLElement>("[data-card]")];

  let queued = false;
  let announce: ReturnType<typeof setTimeout> | undefined;

  function render() {
    queued = false;
    const key = Number(radios.find((r) => r.checked)?.value ?? 0);
    const t = Number(slider.value);
    const r = evaluate(s, key, t);
    paint(r);
    slider.setAttribute("aria-valuetext", sim(t));
    // Screen readers hear one summary once the reader stops moving the slider.
    clearTimeout(announce);
    announce = setTimeout(() => setText("summary", summaryText(s, r)), 450);
  }

  function setText(k: string, v: string) {
    const el = out(k);
    if (el && el.textContent !== v) el.textContent = v;
  }

  function paint(r: ErResult) {
    setText("t", sim(r.threshold));
    setText("bandLow", sim(r.bandLow));
    setText("bandHigh", sim(r.threshold));
    for (const [k, v] of Object.entries(r.funnel)) {
      setText(k, fmtCount(v));
      root.querySelector<HTMLElement>(`[data-bar="${k}"]`)?.style.setProperty("--w", logWidth(v, r.funnel.allPairs).toFixed(1));
    }
    setText("found", fmtCount(r.found));
    setText("precision", fmtScore(r.precision));
    setText("recall", fmtScore(r.recall));
    setText("judgeShare", fmtJudgeShare(r));

    const h = (c: number) => histBarHeight(c, yMax);
    for (let i = 0; i < HIST_MAX; i++) {
      const bar = root.querySelector<SVGRectElement>(`[data-hbar="${i}"]`);
      const label = root.querySelector<SVGTextElement>(`[data-hcount="${i}"]`);
      bar?.setAttribute("y", String(HIST.base - h(r.hist[i])));
      bar?.setAttribute("height", String(h(r.hist[i])));
      if (label) {
        label.setAttribute("y", String(histLabelY(r, i, yMax)));
        label.textContent = String(r.hist[i]);
      }
    }
    setText("histDesc", histDesc(r));

    setText("largestNote", largestNote(r));
    cards.forEach((card, i) => {
      const idx = r.largest.members[i];
      const rec = idx === undefined ? null : s.records[idx];
      card.toggleAttribute("data-empty", !rec);
      card.toggleAttribute("data-ok", !!rec && r.largest.correct[i]);
      card.querySelector("[data-card-name]")!.textContent = rec?.name ?? "";
      card.querySelector("[data-card-place]")!.textContent = rec ? placeOf(rec) : "";
      card.querySelector("[data-card-verdict]")!.textContent = rec ? (r.largest.correct[i] ? "(the main organisation)" : "(a different true organisation)") : "";
    });
    const more = Math.max(0, r.largest.members.length - cards.length);
    const moreEl = out("more");
    if (moreEl) {
      moreEl.toggleAttribute("data-empty", more === 0);
      moreEl.textContent = `and ${more} more`;
    }
  }

  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(render);
  };
  slider.addEventListener("input", schedule);
  for (const r of radios) r.addEventListener("change", schedule);

  controls.disabled = false;
  root.dataset.erReady = "";
  // Re-render in case the reader changed a control before it was enabled (or the browser restored one).
  render();
}
