/*
  Client driver for the home hero figure (plan P4.T2). Loaded lazily by Hero.astro only when
  motion is allowed. Reads scroll position once per animation frame and writes the frame
  computed by src/lib/hero-funnel.ts as inline styles; all maths lives in that pure module.
*/
import { frameAt, progress } from "../lib/hero-funnel";

export function start(root: HTMLElement): void {
  const svg = root.querySelector<SVGSVGElement>("[data-hero-funnel]");
  const steps = root.querySelector<HTMLElement>("[data-hero-steps]");
  if (!svg || !steps) return;

  const q = <T extends Element>(sel: string) => svg.querySelector<T>(sel);
  const cards = [...svg.querySelectorAll<SVGGElement>("[data-card]")];
  const marks = [...svg.querySelectorAll<SVGGElement>("[data-mark]")];
  const linksGroup = q<SVGGElement>('[data-el="links"]');
  const links = [...svg.querySelectorAll<SVGPathElement>('[data-el="links"] .r-draw')];
  const block = q<SVGGElement>('[data-el="block"]');
  const judged = q<SVGGElement>('[data-el="judged"]');
  const llmNote = q<SVGGElement>('[data-el="llm-note"]');
  const merge = q<SVGGElement>('[data-el="merge"]');
  const stepItems = [...steps.querySelectorAll<HTMLElement>("[data-step]")];

  for (const l of links) l.style.strokeDasharray = "1";
  let lastStage = -1;

  function render() {
    queued = false;
    const r = steps!.getBoundingClientRect();
    const f = frameAt(progress(r.top, r.height, innerHeight));
    for (const el of cards) {
      const c = f.cards[el.dataset.card!];
      el.style.transform = `translate(${c.dx.toFixed(1)}px, ${c.dy.toFixed(1)}px) rotate(${c.rot.toFixed(2)}deg) scale(${c.scale.toFixed(3)})`;
      el.style.opacity = c.opacity.toFixed(3);
    }
    if (block) block.style.opacity = f.block.toFixed(3);
    if (judged) judged.style.opacity = f.judged.toFixed(3);
    for (const l of links) l.style.strokeDashoffset = f.linksOffset.toFixed(3);
    // Dashed strokes (the rejected link) cannot draw in, so the group fades in as the rest draw.
    if (linksGroup) linksGroup.style.opacity = Math.min(1, (1 - f.linksOffset) * 3).toFixed(3);
    marks.forEach((m, i) => (m.style.opacity = (f.marks[i] * f.judged).toFixed(3)));
    if (llmNote) llmNote.style.opacity = (f.marks[0] * f.judged).toFixed(3);
    if (merge) merge.style.opacity = f.merge.toFixed(3);
    if (f.stage !== lastStage) {
      lastStage = f.stage;
      root.dataset.stage = String(f.stage);
      stepItems.forEach((s, i) => s.classList.toggle("is-current", i === f.stage));
    }
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(render);
  };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule, { passive: true });
  root.dataset.driven = "";
  render();
}
