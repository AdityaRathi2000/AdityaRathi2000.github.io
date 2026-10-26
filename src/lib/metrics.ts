/*
  Number formatting for the metrics registry (src/content/metrics/metrics.yaml).
  Pure functions with no Astro imports, so they are unit-tested directly
  (tests/unit/metrics.test.ts). Every number on the site goes through here.
*/

export type Unit = "percent" | "count" | "usd" | "ms" | "x";
export type Qualifier = "approx" | "lt" | "gt" | "at_least";

export interface MetricValue {
  value: number;
  unit: Unit;
  qualifier?: Qualifier;
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const compactLong = new Intl.NumberFormat("en-US", { notation: "compact", compactDisplay: "long", maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

function core(value: number, unit: Unit): string {
  switch (unit) {
    case "percent":
      return `${plain.format(value)}%`;
    case "count":
      return value >= 1000 ? compact.format(value) : plain.format(value);
    case "usd":
      return usd.format(value);
    case "ms":
      return value >= 1000 ? `${plain.format(value / 1000)} s` : `${plain.format(value)} ms`;
    case "x":
      return `${plain.format(value)}×`;
  }
}

/** Visual form, as set in mono: "~35%", "< 2 s", "8+", "4.3M". */
export function formatValue({ value, unit, qualifier }: MetricValue): string {
  const text = core(value, unit);
  switch (qualifier) {
    case "approx":
      return `~${text}`;
    case "lt":
      return `< ${text}`;
    case "gt":
      return `> ${text}`;
    case "at_least":
      return `${text}+`;
    default:
      return text;
  }
}

/** Spoken form for aria-label: "about 35 percent", "under 2 seconds", "at least 8", "4.3 million". */
export function spokenValue({ value, unit, qualifier }: MetricValue): string {
  let text: string;
  switch (unit) {
    case "percent":
      text = `${plain.format(value)} percent`;
      break;
    case "count":
      text = value >= 1000 ? compactLong.format(value) : plain.format(value);
      break;
    case "usd":
      text = `${compactLong.format(value)} dollars`;
      break;
    case "ms":
      text = value >= 1000 ? `${plain.format(value / 1000)} seconds` : `${plain.format(value)} milliseconds`;
      break;
    case "x":
      text = `${plain.format(value)} times`;
      break;
  }
  const lead = { approx: "about ", lt: "under ", gt: "over ", at_least: "at least " } as const;
  return qualifier ? `${lead[qualifier]}${text}` : text;
}

/** "Mar 2026" / "2026" from an as_of of YYYY, YYYY-MM or YYYY-MM-DD. */
export function formatAsOf(asOf: string): string {
  const [y, m] = asOf.split("-");
  if (!m) return y;
  const month = new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ${y}`;
}
