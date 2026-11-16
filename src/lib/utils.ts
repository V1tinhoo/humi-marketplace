import clsx, { type ClassValue } from "clsx";
import type { Duration, SessionFormat } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatPrice(value: number, opts: { cents?: boolean } = {}) {
  const cents = opts.cents ?? !Number.isInteger(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", opts).format(new Date(iso));
}

/* ------------------------------------------------------------------
   Pricing — DISPLAY ONLY. The authoritative calculation runs in the
   database (public.humi_price_quote, applied by the bookings trigger);
   keep these numbers in sync with the migration.
------------------------------------------------------------------- */
export const PLATFORM_LIMITS = { minPer30: 3, maxPer30: 30 } as const;
export const SERVICE_FEE_RATE = 0.1;
export const DURATIONS: Duration[] = [20, 30, 60];

const DURATION_MULTIPLIER: Record<Duration, number> = { 20: 0.75, 30: 1, 60: 1.85 };
const VIDEO_SURCHARGE_PER_30 = 1;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function sessionPrice(pricePer30: number, duration: Duration, format: SessionFormat) {
  const base = pricePer30 + (format === "video" ? VIDEO_SURCHARGE_PER_30 : 0);
  return round2(base * DURATION_MULTIPLIER[duration]);
}

export function priceBreakdown(pricePer30: number, duration: Duration, format: SessionFormat) {
  const subtotal = sessionPrice(pricePer30, duration, format);
  const fee = round2(subtotal * SERVICE_FEE_RATE);
  return { subtotal, fee, total: round2(subtotal + fee) };
}

/** "New host" badge: only during the first 30 days AND the first 3 sessions, while there are no reviews. */
export const NEW_HOST_DAYS = 30;
export const NEW_HOST_MAX_SESSIONS = 3;
export function isNewHost(h: { reviewCount: number; sessionsCompleted: number; memberSince: string }, now = Date.now()) {
  if (h.reviewCount > 0 || h.sessionsCompleted >= NEW_HOST_MAX_SESSIONS) return false;
  const since = Date.parse(h.memberSince);
  return Number.isNaN(since) || now - since < NEW_HOST_DAYS * 86_400_000;
}

/** "1 session" / "12 sessions" */
export const sessionsLabel = (n: number) => `${n} ${n === 1 ? "session" : "sessions"}`;

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
