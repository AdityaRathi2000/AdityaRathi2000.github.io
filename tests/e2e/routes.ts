// Every built route the e2e suite visits. Add case studies here as they land (P5).
export const ROUTES = [
  { path: "/", name: "home" },
  { path: "/colophon/", name: "colophon" },
  { path: "/tiles/", name: "tile" },
] as const;

export const VIEWPORTS = [390, 1024, 1440] as const;
export const SCHEMES = ["light", "dark"] as const;

// Regions fed by live data (Kalshi reliability, P6/P7) are masked in screenshots.
export const LIVE_DATA_SELECTOR = "[data-live]";
