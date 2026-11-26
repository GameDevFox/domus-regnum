// Umami web analytics (free hosted tier): a single ~1KB cookieless script that auto-tracks
// pageviews — including SPA client-side route changes via the History API, so React Router
// navigations are counted with no per-route wiring. No cookies, no persistent IDs, no consent
// banner needed (country geo is derived from the IP at ingest, then the IP is discarded).
//
// Loaded ONLY in a production build and ONLY when a website ID is configured, so local dev and
// the vitest/e2e runs never pollute the stats or burn the 100k-events/month free allowance.
// The ID comes from the Umami dashboard (Websites → your site → the data-website-id UUID) and is
// injected at build time via VITE_UMAMI_WEBSITE_ID. VITE_UMAMI_SRC overrides the script origin —
// left at the Cloud default now, repointed at a self-hosted instance later without code changes.

const UMAMI_CLOUD_SRC = "https://cloud.umami.is/script.js";

export const initAnalytics = (): void => {
  const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID;
  // Skip in dev/preview and whenever no site is wired up — keeps the hosted stats clean.
  if (!import.meta.env.PROD || !websiteId) return;

  const script = document.createElement("script");
  script.defer = true;
  script.src = import.meta.env.VITE_UMAMI_SRC || UMAMI_CLOUD_SRC;
  script.setAttribute("data-website-id", websiteId);
  document.head.appendChild(script);
};

// Fire a custom Umami event — the engagement/funnel signals pageviews miss (did they start the demo,
// finish the tutorial, how a practice round went). Safe no-op when the script isn't loaded: dev/preview,
// tests (no window), or before umami attaches. Optional `data` becomes event properties you can break
// results down by in the dashboard (strings ≤500 chars, ≤50 props/event).
type UmamiApi = { track: (event: string, data?: Record<string, unknown>) => void };
export const track = (event: string, data?: Record<string, unknown>): void => {
  if (typeof window === "undefined") return;
  (window as unknown as { umami?: UmamiApi }).umami?.track(event, data);
};
