/**
 * Marketplace data access. Reads from Supabase when configured, otherwise
 * from the bundled sample data, and always returns the app's `Host` shape
 * so UI components don't care where data came from.
 */
import { hosts as sampleHosts, getHost as getSampleHost } from "@/data/hosts";
import { reviewsForHost } from "@/data/reviews";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabasePublicClient } from "@/lib/supabase/server";
import type { CategoryId, Host, Review, SessionFormat, WeeklyAvailability } from "@/types";
import type { PublicHostRow, PublicReviewRow } from "@/types/database";

export type DataSource = "demo" | "supabase";
export interface Result<T> {
  data: T;
  source: DataSource;
  error?: string;
}

const CATEGORY_IDS: CategoryId[] = ["talk", "play", "cultures", "meet"];

/** DB windows (0 = Sunday, "HH:MM:SS") → app hours keyed 0 = Monday. */
export function windowsToWeekly(windows: PublicHostRow["availability"]): WeeklyAvailability {
  const out: WeeklyAvailability = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const w of windows) {
    const key = (w.day_of_week + 6) % 7;
    const [sh, sm] = w.start_time.split(":").map(Number);
    const [eh, em] = w.end_time.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    for (let h = Math.ceil(startMin / 60); (h + 1) * 60 <= endMin; h++) out[key].push(h);
  }
  for (const k of Object.keys(out)) out[Number(k)] = Array.from(new Set(out[Number(k)])).sort((a, b) => a - b);
  return out;
}

export function rowToHost(r: PublicHostRow): Host {
  return {
    id: r.id,
    firstName: r.display_name,
    country: r.country ?? "",
    city: r.city ?? "",
    region: r.region ?? "",
    languages: r.languages ?? [],
    interests: r.interests ?? [],
    categories: (r.categories ?? []).filter((c): c is CategoryId => CATEGORY_IDS.includes(c as CategoryId)),
    tagline: r.tagline ?? "",
    bio: r.description || r.bio || "",
    photo: r.avatar_url ?? "",
    rating: Number(r.average_rating) || 0,
    reviewCount: r.review_count,
    sessionsCompleted: r.total_sessions,
    // Real presence: switch on AND seen in the last 3 minutes (computed in the database).
    online: r.is_online ?? false,
    pricePer30: Number(r.session_price),
    priceAudioCents: r.audio_cents_per_minute ?? 100,
    priceVideoCents: r.video_cents_per_minute ?? null,
    formats: (r.call_types ?? []) as SessionFormat[],
    timezone: r.timezone,
    memberSince: r.created_at,
    availability: windowsToWeekly(r.availability ?? []),
    dataSource: "supabase",
    isSample: r.is_sample,
    verified: r.is_verified,
  };
}

function friendly(error: { message: string } | null) {
  if (!error) return undefined;
  console.error("[humi] Supabase query failed:", error.message);
  if (/fetch|network|ENOTFOUND|ECONNREFUSED/i.test(error.message)) return "We couldn't reach the server. Please try again in a moment.";
  return "Something went wrong while loading hosts. Please try again.";
}

export async function getHosts(): Promise<Result<Host[]>> {
  if (!isSupabaseConfigured) return { data: sampleHosts, source: "demo" };
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("public_hosts")
    .select("*")
    .order("is_available", { ascending: false })
    .order("average_rating", { ascending: false })
    .limit(200);
  return { data: (data ?? []).map(rowToHost), source: "supabase", error: friendly(error) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getHostById(id: string): Promise<Result<Host | null>> {
  if (!isSupabaseConfigured) return { data: getSampleHost(id) ?? null, source: "demo" };
  if (!UUID.test(id)) return { data: null, source: "supabase" };
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase.from("public_hosts").select("*").eq("id", id).maybeSingle();
  return { data: data ? rowToHost(data) : null, source: "supabase", error: friendly(error) };
}

export async function getHostReviews(hostId: string, limit = 6): Promise<Review[]> {
  if (!isSupabaseConfigured) return reviewsForHost(hostId);
  const supabase = createSupabasePublicClient();
  const { data } = await supabase
    .from("public_reviews")
    .select("*")
    .eq("host_id", hostId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: PublicReviewRow) => ({
    id: r.id,
    hostId: r.host_id,
    author: r.author_name || "Member",
    country: r.author_country ?? "",
    rating: r.rating,
    date: r.created_at,
    text: r.comment ?? "",
    category: "talk",
  }));
}
