/**
 * Demo hosts (internal preview). Types and helpers shared by the preview pages,
 * the simulated call and the admin. All data lives in separate demo_* tables;
 * nothing here touches the real marketplace or real money.
 */
import { windowsToWeekly } from "@/lib/availability";
import { canonicalLanguages } from "@/lib/languages";
import type { Host, SessionFormat } from "@/types";

export type DemoHostRow = {
  id: string;
  is_demo: true;
  display_name: string;
  age: number | null;
  country: string;
  city: string;
  timezone: string;
  languages: string[];
  interests: string[];
  categories: string[];
  tagline: string;
  bio: string;
  photo_url: string | null;
  audio_cents_per_minute: number;
  video_cents_per_minute: number | null;
  call_types: SessionFormat[];
  is_active: boolean;
  show_in_preview: boolean;
  is_online: boolean;
  availability: { day_of_week: number; start_time: string; end_time: string; timezone: string }[];
  rating_avg: number;
  review_count: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type DemoReviewRow = {
  id: string;
  demo_host_id: string;
  reviewer_name: string;
  reviewer_avatar_url: string | null;
  rating: number;
  comment: string;
  language: string;
  review_date: string;
};

export type DemoSessionRow = {
  id: string;
  demo_host_id: string | null;
  host_name: string;
  call_type: "audio" | "video";
  price_cents_per_minute: number;
  commission_bps: number;
  status: "ringing" | "connected" | "reconnecting" | "ended" | "failed";
  end_reason: string | null;
  start_balance_cents: number;
  billed_seconds: number;
  charged_cents: number;
  host_cents: number;
  platform_cents: number;
  created_at: string;
  connected_at: string | null;
  last_tick_at: string | null;
  ended_at: string | null;
};

export type PreviewStatus = {
  allowed: boolean;
  is_admin: boolean;
  demo_enabled: boolean;
  calls_enabled: boolean;
  commission_bps: number | null;
  balance_cents: number | null;
};

export type HostCategory = { slug: string; label_en: string; label_pt: string; sort_order: number; is_active: boolean };

/** Demo host → the app's Host shape, so the real Explore / card components can show it unchanged. */
export function demoToHost(r: DemoHostRow): Host {
  return {
    id: r.id,
    firstName: r.display_name,
    age: r.age ?? undefined,
    country: r.country,
    city: r.city,
    languages: canonicalLanguages(r.languages),
    interests: r.interests ?? [],
    categories: (r.categories ?? []) as Host["categories"],
    tagline: r.tagline,
    bio: r.bio,
    photo: r.photo_url ?? "",
    rating: Number(r.rating_avg) || 0,
    reviewCount: r.review_count,
    sessionsCompleted: 0,
    online: r.is_online,
    pricePer30: 0,
    priceAudioCents: r.audio_cents_per_minute,
    priceVideoCents: r.video_cents_per_minute,
    formats: r.call_types,
    timezone: r.timezone,
    memberSince: r.created_at,
    availability: windowsToWeekly(r.availability ?? []),
    dataSource: "supabase",
    isSample: false, // no demo badge in the preview (the database still marks it is_demo)
    verified: false,
  };
}

/**
 * Same rule as the database (commission_split): host = floor(total × (1 − commission)),
 * HUMI gets the rest, so both parts always add up to the total.
 */
export function splitCents(total: number, commissionBps: number) {
  const host = Math.floor((total * (10000 - commissionBps)) / 10000);
  return { host, platform: total - host };
}

/** Amount due for a number of seconds: per second, never rounding a started minute up. */
export const dueCents = (pricePerMinute: number, seconds: number) => Math.floor((pricePerMinute * seconds) / 60);

export const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
