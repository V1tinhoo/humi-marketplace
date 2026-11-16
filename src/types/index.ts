export type CategoryId = "talk" | "play" | "cultures" | "meet";

export type SessionFormat = "audio" | "video";

export type Duration = 20 | 30 | 60;

export interface Category {
  id: CategoryId;
  title: string;
  description: string;
}

export interface Review {
  id: string;
  hostId: string;
  author: string;
  country: string;
  rating: number;
  date: string; // ISO
  text: string;
  category: CategoryId;
}

/** Weekly availability: day index (0 = Monday) → list of start hours (24h, host local time). */
export type WeeklyAvailability = Record<number, number[]>;

export interface Host {
  id: string;
  firstName: string;
  /** Shown only when known. Every host must be an adult (18+). */
  age?: number;
  country: string;
  city: string;
  /** State / province / region (Supabase profiles). */
  region?: string;
  languages: string[];
  interests: string[];
  categories: CategoryId[];
  tagline: string;
  bio: string;
  photo: string;
  rating: number;
  reviewCount: number;
  sessionsCompleted: number;
  online: boolean;
  /** Price in USD for a 30-minute audio session. */
  /** Legacy fixed price (USD per 30 min). Kept for old bookings/demo only; billing uses the per-minute prices. */
  pricePer30: number;
  /** Price per minute in BRL cents for audio calls. */
  priceAudioCents: number;
  /** Price per minute in BRL cents for video calls (null = same as audio / not offered). */
  priceVideoCents: number | null;
  formats: SessionFormat[];
  responseTime?: string;
  /** IANA time zone, e.g. "America/Sao_Paulo". Availability hours are in this zone. */
  timezone: string;
  memberSince: string;
  availability: WeeklyAvailability;
  /** Where the profile came from: bundled demo data or the Supabase database. */
  dataSource: "sample" | "supabase";
  /** Fictional profile (bundled demo data or created by the seed script). */
  isSample: boolean;
  /** True only when the verification provider/admin has verified the host. */
  verified: boolean;
}

export type UserRole = "customer" | "host";

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface DemoBooking {
  id: string;
  hostId: string;
  hostName: string;
  hostPhoto: string;
  format: SessionFormat;
  duration: Duration;
  slot: string; // ISO datetime
  subtotal: number;
  fee: number;
  total: number;
  createdAt: string;
  status: "confirmed-demo";
}
