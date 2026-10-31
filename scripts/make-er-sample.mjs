// Synthetic records for the CVI page's entity-resolution explorer (plan P6.T1).
//
// Every provider, town and record here is invented: the data is synthetic, the mechanism is
// real (veto V2). The output is deterministic for a seed, and a unit test regenerates it and
// compares with the committed file (tests/unit/er-explorer.test.ts), so it cannot drift.
//
//   node scripts/make-er-sample.mjs            writes public/data/er-sample.json
//
// What it models:
//   - providers in a few states, some sharing a place name (a college and a bookstore in the
//     same town), some branch campuses, and some with the same name in two states;
//   - each provider listed by one to five sources, each spelling it its own way
//     (abbreviations, acronyms, upper case, legal suffixes, typos, missing towns);
//   - a similarity score, a character-trigram cosine standing in for embedding similarity;
//   - three blocking keys, and a judge rule that stands in for the LLM: it reads the whole
//     record (name, town, state), not just the score, and makes the mistakes such a reader
//     makes (a branch campus listed without its campus name looks like the parent).
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SEED = 20261031;
export const VERSION = 1;
/** Pairs below this similarity can never reach the LLM band, so they are not stored. */
export const SIM_FLOOR = 40;
/** Width of the LLM band below the auto-merge threshold, in hundredths of similarity. */
export const BAND = 15;

// mulberry32: small, seedable, and the same in every JS engine.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates with the seeded rng: one draw per position, the same in every engine.
 * (Never sort(() => r() - 0.5): with an inconsistent comparator the order is engine-defined, and
 * V8's short-array sort differs between Node 24 and Node 26, which broke the committed sample on CI.)
 */
function shuffle(xs, r) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const STATES = {
  OH: ["Larkspur", "Fernhollow", "Calder", "Millbrook", "Vantry"],
  PA: ["Ashby", "Brinmoor", "Halden", "Quarry Hill", "Osgood"],
  TX: ["Redfern", "Corliss", "Millbrook", "Kestrel Point", "Sallow Creek"],
  WA: ["Oakmere", "Thistle Bay", "Penhallow", "Aldergrove", "Larkspur"],
  GA: ["Wren Valley", "Stonebridge", "Marlow", "Ellery", "Dunmore"],
  MN: ["Halvorsen", "Pine Ledge", "Ashby", "Torrin"],
};

const PROVIDER_TYPES = [
  "Technical College",
  "Community College",
  "School of Nursing",
  "Welding Institute",
  "Coding Academy",
  "Beauty Academy",
  "Truck Driving School",
  "Career Institute",
  "College of Allied Health",
  "Workforce Center",
];
// Not training providers, but some sources list them anyway (web crawls, job boards).
const BUSINESS_TYPES = ["Bookstore", "Tech Repair", "Auto Supply", "Public Library"];
const CAMPUSES = ["North Campus", "South Campus", "East Campus", "West Campus"];
export const SOURCES = ["state list", "federal list", "program catalog", "job board", "web crawl"];

const ABBREV = [
  [/\bTechnical\b/, "Tech"],
  [/\bCommunity\b/, "Comm."],
  [/\bCollege\b/, "Coll."],
  [/\bInstitute\b/, "Inst."],
  [/\bAcademy\b/, "Acad."],
  [/\bSchool\b/, "Sch."],
  [/\bCenter\b/, "Ctr."],
  [/\bNorth\b/, "N."],
  [/\bSouth\b/, "S."],
];

/** Build the providers (the answer key) and their records. */
export function makeWorld(seed = SEED) {
  const r = rng(seed);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const entities = [];
  const add = (e) => entities.push({ campus: null, parentTown: null, ...e });

  for (const [state, towns] of Object.entries(STATES)) {
    for (const town of towns) {
      // Two or three providers named after the town, so a shared place name is common.
      const types = shuffle(PROVIDER_TYPES, r).slice(0, 2 + Math.floor(r() * 2));
      for (const type of types) add({ name: `${town} ${type}`, type, state, town, kind: "provider" });
      // A look-alike that is not a provider at all.
      if (r() < 0.55) add({ name: `${town} ${pick(BUSINESS_TYPES)}`, type: null, state, town, kind: "business" });
      // A branch campus of the town's first provider: sometimes in the same town, sometimes not.
      if (r() < 0.45) {
        const parent = entities.find((e) => e.town === town && e.state === state && e.kind === "provider" && !e.campus);
        const where = r() < 0.5 ? town : pick(towns.filter((t) => t !== town));
        add({ name: `${parent.name} ${pick(CAMPUSES)}`, type: parent.type, state, town: where, kind: "provider", campus: parent.name, parentTown: town });
      }
    }
  }

  const records = [];
  entities.forEach((e, cluster) => {
    // One to five listings; businesses rarely appear more than twice.
    const n = e.kind === "business" ? 1 + (r() < 0.3 ? 1 : 0) : 1 + Math.floor(r() ** 0.85 * 5);
    const srcs = shuffle(SOURCES, r).slice(0, n);
    srcs.forEach((src, k) => records.push({ name: k === 0 ? e.name : variant(e, r), city: cityFor(e, src, r), state: e.state, src, cluster }));
  });
  return { entities, records };
}

function variant(e, r) {
  let s = e.name;
  const roll = r();
  if (roll < 0.14 && !e.campus) {
    // Acronym, sometimes with the town: "LTC", "LTC Larkspur".
    const ac = s.split(/\s+/).filter((w) => w !== "of").map((w) => w[0]).join("").toUpperCase();
    return r() < 0.5 ? ac : `${ac} ${e.town}`;
  }
  // Type first, town last: "Technical College, Larkspur" (defeats first-word blocking).
  if (roll < 0.24 && e.type && !e.campus) s = `${e.type}, ${e.town}`;
  for (const [re, short] of ABBREV) if (re.test(s) && r() < 0.45) s = s.replace(re, short);
  if (e.campus && r() < 0.35) s = s.replace(/ (North|South|East|West|N\.|S\.) Campus$/, ""); // the campus gets dropped
  if (r() < 0.12) s = s.toUpperCase();
  if (r() < 0.12) s += pick2(r, e.campus ? [", Inc.", " LLC"] : [", Inc.", " LLC", " (main)"]);
  if (r() < 0.15) s = typo(s, r);
  if (r() < 0.06) s = `The ${s}`;
  return s;
}

const pick2 = (r, xs) => xs[Math.floor(r() * xs.length)];

function typo(s, r) {
  const i = 1 + Math.floor(r() * (s.length - 3));
  if (!/[a-z]{2}/.test(s.slice(i, i + 2))) return s;
  return r() < 0.5 ? s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2) : s.slice(0, i) + s.slice(i + 1);
}

function cityFor(e, src, r) {
  // The federal list often has no town; a branch is sometimes filed under its parent's town.
  if (src === "federal list" && r() < 0.5) return null;
  if (e.campus && r() < 0.25) return e.parentTown;
  return e.town;
}

// ---------- Similarity and blocking ----------

export function normalise(name) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|inc|llc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(s) {
  const p = `  ${s} `;
  const m = new Map();
  for (let i = 0; i < p.length - 2; i++) {
    const g = p.slice(i, i + 3);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Cosine of character-trigram counts, in hundredths (0-100). */
export function similarity(a, b) {
  const ga = trigrams(normalise(a));
  const gb = trigrams(normalise(b));
  let dot = 0;
  for (const [g, c] of ga) dot += c * (gb.get(g) ?? 0);
  const norm = (m) => Math.sqrt([...m.values()].reduce((s, c) => s + c * c, 0));
  return Math.round((100 * dot) / (norm(ga) * norm(gb) || 1));
}

export const KEYS = [
  { id: "state", label: "Same state" },
  { id: "town", label: "Same state and town" },
  { id: "word", label: "Same first word of the name" },
];

export function blockKeys(rec) {
  const first = normalise(rec.name).split(" ")[0] ?? "";
  return [rec.state, rec.city ? `${rec.state}|${rec.city}` : null, first || null];
}

// ---------- The judge that stands in for the LLM ----------

const BUSINESS = /\b(bookstore|books|repair|supply|library)\b/;
const businessKind = (normalised) => {
  const k = normalised.match(BUSINESS)?.[1] ?? null;
  return k === "books" ? "bookstore" : k;
};
const CAMPUS = /\b(north|south|east|west|n|s)\s+campus\b/;
// Words that say what kind of provider it is, with their abbreviations folded together.
const TYPE_WORD = {
  technical: "technical", tech: "technical", community: "community", comm: "community",
  college: "college", coll: "college", institute: "institute", inst: "institute",
  academy: "academy", acad: "academy", school: "school", sch: "school", center: "center", ctr: "center",
  nursing: "nursing", welding: "welding", coding: "coding", beauty: "beauty", truck: "truck",
  driving: "driving", career: "career", allied: "allied", health: "health", workforce: "workforce",
};
const FILLER = new Set(["of", "and", "campus", "main", "north", "south", "east", "west", "n", "s"]);

function words(name) {
  const ws = normalise(name).split(" ");
  return {
    type: new Set(ws.filter((w) => TYPE_WORD[w]).map((w) => TYPE_WORD[w])),
    place: new Set(ws.filter((w) => !TYPE_WORD[w] && !FILLER.has(w))),
  };
}

const subset = (a, b) => [...a].every((x) => b.has(x));

// Same word, or one slip apart (a dropped or swapped letter): "Larksupr" is "Larkspur".
function near(a, b) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const d = [...a].flatMap((c, i) => (c === b[i] ? [] : [i]));
    return d.length === 2 && d[1] === d[0] + 1 && a[d[0]] === b[d[1]] && a[d[1]] === b[d[0]];
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 0; i < l.length; i++) if (l.slice(0, i) + l.slice(i + 1) === s) return true;
  return false;
}

/**
 * Reads both records the way a careful reader would: same state, same kind of organisation,
 * no conflicting campus or town, and a place name in common (allowing a typo). Its blind spot
 * is the real one: a branch campus listed without its campus name reads as the parent, and an
 * acronym with no town gives it nothing to go on.
 */
export function judge(a, b) {
  if (a.state !== b.state) return false;
  const na = normalise(a.name);
  const nb = normalise(b.name);
  // A provider is not a business, and a bookstore is not a repair shop.
  if (businessKind(na) !== businessKind(nb)) return false;
  // A named campus is its own provider unless the other record names the same campus.
  if (na.match(CAMPUS)?.[1][0] !== nb.match(CAMPUS)?.[1][0]) return false;
  if (a.city && b.city && a.city !== b.city) return false;
  const wa = words(a.name);
  const wb = words(b.name);
  // They say different things about what they are: a technical college is not a community college.
  if (!subset(wa.type, wb.type) && !subset(wb.type, wa.type)) return false;
  return [...wa.place].some((w) => [...wb.place].some((v) => near(w, v)));
}

// ---------- The sample ----------

export function makeSample(seed = SEED) {
  const { entities, records } = makeWorld(seed);
  const out = records.map((rec, i) => ({
    id: `r${String(i + 1).padStart(3, "0")}`,
    name: rec.name,
    city: rec.city,
    state: rec.state,
    src: rec.src,
    block_keys: blockKeys(rec),
  }));
  const pairs = [];
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const shared = out[i].block_keys.some((k, x) => k !== null && k === out[j].block_keys[x]);
      if (!shared) continue;
      const sim = similarity(out[i].name, out[j].name);
      if (sim >= SIM_FLOOR) pairs.push([i, j, sim, judge(out[i], out[j]) ? 1 : 0]);
    }
  }
  return {
    meta: {
      synthetic: true,
      seed,
      version: VERSION,
      generator: "scripts/make-er-sample.mjs",
      note: "Invented providers and records. Similarity is a character-trigram cosine standing in for embedding similarity; the judge is a rule standing in for the LLM.",
    },
    keys: KEYS,
    sim_floor: SIM_FLOOR,
    band: BAND,
    records: out,
    // [i, j, similarity in hundredths, judge verdict 1/0]; only pairs sharing a block and at or above sim_floor.
    pairs,
    // One cluster per invented organisation; business_clusters lists the look-alikes that are not training providers.
    truth: {
      cluster_of: records.map((rec) => rec.cluster),
      business_clusters: entities.flatMap((e, i) => (e.kind === "business" ? [i] : [])),
    },
  };
}

export const serialise = (sample) => JSON.stringify(sample) + "\n";

// Run as a script (pathToFileURL: the module URL is percent-encoded, a raw argv path is not; argv[1] is
// undefined under node -e).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = makeSample();
  writeFileSync("public/data/er-sample.json", serialise(s));
  console.log(`er-sample.json: ${s.records.length} records, ${s.pairs.length} stored pairs, ${new Set(s.truth.cluster_of).size} organisations (${s.truth.business_clusters.length} of them businesses).`);
}
