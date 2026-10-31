// Every built route the e2e suite visits.
export const ROUTES = [
  { path: "/", name: "home" },
  { path: "/colophon/", name: "colophon" },
  { path: "/diagrams/", name: "diagrams" },
  { path: "/resume/", name: "resume" },
  { path: "/work/cvi-entity-resolution/", name: "case-cvi" },
  { path: "/work/postings-extraction-stack/", name: "case-postings" },
  { path: "/work/education-classifier/", name: "case-education" },
  { path: "/work/kalshi-weather-model/", name: "case-kalshi" },
  { path: "/work/manifold/", name: "case-manifold" },
] as const;

export const VIEWPORTS = [390, 1024, 1440] as const;
export const SCHEMES = ["light", "dark"] as const;

// Regions fed by live data (Kalshi reliability, P6/P7) are masked in screenshots.
export const LIVE_DATA_SELECTOR = "[data-live]";
