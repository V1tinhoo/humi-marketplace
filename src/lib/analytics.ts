/**
 * Marketing analytics (Google Analytics 4 + Meta Pixel), only after the visitor accepts cookies.
 * - Attribution: the first visit's utm_* / click ids and the referral code (?ref=) are kept in
 *   this browser so the sign-up can record where the person came from.
 * - track(): sends an event to whichever tool is loaded; does nothing without consent.
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";
export const analyticsConfigured = Boolean(GA_ID || META_PIXEL_ID);

const CONSENT_KEY = "humi.consent";
const ATTRIBUTION_KEY = "humi.attribution";
const REF_KEY = "humi.ref";
const TRACKED_KEY = "humi.tracked";
const CONSENT_EVENT = "humi:consent";
const ATTRIBUTION_DAYS = 90;

export type Consent = "granted" | "denied" | null;

const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

export function getConsent(): Consent {
  const v = safeGet(CONSENT_KEY);
  return v === "granted" || v === "denied" ? v : null;
}
export function setConsent(v: "granted" | "denied") {
  safeSet(CONSENT_KEY, v);
  window.dispatchEvent(new Event(CONSENT_EVENT));
}
export function onConsentChange(fn: () => void) {
  window.addEventListener(CONSENT_EVENT, fn);
  return () => window.removeEventListener(CONSENT_EVENT, fn);
}
/** Re-open the cookie choice (footer link). */
export function resetConsent() {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/* ------------------------------------------------------------------ */
/* Attribution                                                         */
/* ------------------------------------------------------------------ */

export type Attribution = Record<string, string>;
const PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "ttclid"];

/** Keeps the FIRST touch (for 90 days) and the referral code from the current URL. */
export function captureAttribution() {
  const url = new URL(window.location.href);
  const ref = url.searchParams.get("ref");
  if (ref && /^[A-Za-z0-9]{4,12}$/.test(ref)) safeSet(REF_KEY, ref.toUpperCase());

  const found: Attribution = {};
  for (const p of PARAMS) {
    const v = url.searchParams.get(p);
    if (v) found[p] = v.slice(0, 120);
  }
  const existing = getAttribution();
  const hasCampaign = Object.keys(found).length > 0;
  // First touch wins: once a campaign/ad click is recorded, later visits don't overwrite it.
  if (existing && (!hasCampaign || PARAMS.some((p) => existing[p]))) return;
  const external = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer.slice(0, 200) : "";
  const data: Attribution = { ...found, landing: url.pathname.slice(0, 100), at: new Date().toISOString() };
  if (external) data.referrer = external;
  safeSet(ATTRIBUTION_KEY, JSON.stringify(data));
}

export function getAttribution(): Attribution | null {
  try {
    const raw = safeGet(ATTRIBUTION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Attribution;
    if (data.at && Date.now() - Date.parse(data.at) > ATTRIBUTION_DAYS * 86_400_000) return null;
    return data;
  } catch {
    return null;
  }
}
export const getReferralCode = () => safeGet(REF_KEY);

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

type Gtag = (...args: unknown[]) => void;
type Fbq = ((...args: unknown[]) => void) & { callMethod?: unknown };
const w = () => window as unknown as { gtag?: Gtag; fbq?: Fbq };

/** Our event names → GA4 recommended events and Meta standard events. */
const META: Record<string, string> = {
  sign_up: "CompleteRegistration",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
  page_view: "PageView",
};

export function track(event: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined" || getConsent() !== "granted") return;
  const { gtag, fbq } = w();
  try {
    gtag?.("event", event, params);
  } catch {
    /* ignore */
  }
  try {
    const metaParams: Record<string, unknown> = {};
    if (typeof params.value === "number") metaParams.value = params.value;
    if (params.currency) metaParams.currency = params.currency;
    if (META[event]) fbq?.("track", META[event], metaParams);
    else fbq?.("trackCustom", event, metaParams);
  } catch {
    /* ignore */
  }
}

/** Sends an event only once per id in this browser (e.g. a purchase per top-up). */
export function trackOnce(id: string, event: string, params: Record<string, unknown> = {}) {
  if (getConsent() !== "granted") return;
  const done = new Set((safeGet(TRACKED_KEY) ?? "").split(",").filter(Boolean));
  if (done.has(id)) return;
  track(event, params);
  done.add(id);
  safeSet(TRACKED_KEY, [...done].slice(-200).join(","));
}
