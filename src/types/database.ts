/**
 * Database types for supabase-js, matching supabase/migrations/*_humi_initial_schema.sql.
 * Regenerate after schema changes with:
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRoleDb = "customer" | "host" | "admin";
export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type CallTypeDb = "audio" | "video";
export type PaymentStatus = "demo" | "pending" | "succeeded" | "failed" | "refunded";

type Timestamps = { created_at: string; updated_at: string };

export type ProfileRow = Timestamps & {
  id: string;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  country: string | null;
  city: string | null;
  /** State / province / region. */
  region: string | null;
  languages: string[];
  interests: string[];
  role: UserRoleDb;
  is_sample: boolean;
};

export type HostProfileRow = Timestamps & {
  id: string;
  user_id: string;
  display_name: string;
  tagline: string | null;
  description: string | null;
  experience: string | null;
  session_price: number;
  hourly_rate: number;
  categories: string[];
  call_types: CallTypeDb[];
  timezone: string;
  is_available: boolean;
  is_published: boolean;
  is_verified: boolean;
  average_rating: number;
  review_count: number;
  total_sessions: number;
  /** Last presence heartbeat (server clock). Set only by host_presence(). */
  last_seen_at: string | null;
};

export type HostAvailabilityRow = {
  id: string;
  host_id: string;
  day_of_week: number; // 0 = Sunday
  start_time: string; // "HH:MM:SS"
  end_time: string;
  timezone: string;
  created_at: string;
};

export type BookingRow = Timestamps & {
  id: string;
  customer_id: string;
  host_id: string;
  scheduled_at: string;
  ends_at: string;
  duration_minutes: number;
  call_type: CallTypeDb;
  subtotal: number;
  total_price: number;
  platform_fee: number;
  host_earnings: number;
  currency: string;
  status: BookingStatus;
  cancelled_by: string | null;
};

export type ReviewRow = Timestamps & {
  id: string;
  booking_id: string | null;
  call_id: string | null;
  customer_id: string;
  host_id: string;
  rating: number;
  comment: string | null;
};

export type PaymentRow = Timestamps & {
  id: string;
  booking_id: string;
  customer_id: string;
  amount: number;
  currency: string;
  payment_provider: string;
  provider_payment_id: string | null;
  status: PaymentStatus;
};

export type PublicHostRow = Pick<
  HostProfileRow,
  | "id"
  | "display_name"
  | "tagline"
  | "description"
  | "experience"
  | "session_price"
  | "hourly_rate"
  | "categories"
  | "call_types"
  | "timezone"
  | "is_available"
  | "is_verified"
  | "average_rating"
  | "review_count"
  | "total_sessions"
  | "created_at"
> &
  Pick<ProfileRow, "avatar_url" | "bio" | "country" | "city" | "region" | "languages" | "interests" | "is_sample"> & {
    availability: { day_of_week: number; start_time: string; end_time: string; timezone: string }[];
    /** Switch is on AND a heartbeat arrived in the last 3 minutes. */
    is_online: boolean;
    audio_cents_per_minute: number | null;
    video_cents_per_minute: number | null;
  };

export type PublicReviewRow = {
  id: string;
  host_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  author_name: string;
  author_country: string | null;
};

export type MyHostBookingRow = Pick<
  BookingRow,
  "id" | "host_id" | "scheduled_at" | "ends_at" | "duration_minutes" | "call_type" | "status" | "subtotal" | "host_earnings" | "created_at"
> & { customer_name: string; customer_country: string | null; has_review: boolean };

export type ReportReason =
  | "harassment" | "inappropriate_content" | "sexual_content" | "hate_speech"
  | "spam_or_scam" | "off_platform_payment" | "underage" | "safety_concern" | "other";
export type TopupStatus = "pending" | "approved" | "declined" | "refunded" | "canceled";
export type CallStatus = "ringing" | "connected" | "ended" | "failed";

export type HostPricingRow = {
  host_id: string;
  audio_cents_per_minute: number;
  video_cents_per_minute: number | null;
  currency: string;
  updated_at: string;
};
export type WalletRow = { user_id: string; balance_cents: number; currency: string; updated_at: string };
export type WalletTransactionRow = {
  id: number;
  user_id: string;
  kind: "topup" | "call_charge" | "refund" | "adjustment";
  amount_cents: number;
  balance_after_cents: number;
  reference_id: string | null;
  idempotency_key: string;
  livemode: boolean;
  description: string;
  created_at: string;
};
export type WalletTopupRow = {
  id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  provider: string;
  provider_payment_id: string | null;
  method: string | null;
  status: TopupStatus;
  livemode: boolean;
  failure_reason: string | null;
  created_at: string;
  confirmed_at: string | null;
  updated_at: string;
};
export type CallSessionRow = {
  id: string;
  booking_id: string | null;
  customer_id: string;
  host_id: string;
  call_type: CallTypeDb;
  price_cents_per_minute: number;
  commission_bps: number;
  room_name: string;
  status: CallStatus;
  end_reason: string | null;
  livemode: boolean;
  created_at: string;
  connected_at: string | null;
  last_connected_at: string | null;
  last_tick_at: string | null;
  ended_at: string | null;
  billed_seconds: number;
  charged_cents: number;
  host_earnings_cents: number;
  platform_fee_cents: number;
};
/** Participant view of a call: no commission rate or platform amount; host earnings only for the host. */
export type MyCallRow = Omit<CallSessionRow, "customer_id" | "last_connected_at" | "last_tick_at" | "commission_bps" | "platform_fee_cents" | "host_earnings_cents"> & {
  host_earnings_cents: number | null;
  customer_name: string;
  host_name: string;
  i_am_host: boolean;
};
export type HostEarningRow = {
  id: number;
  host_id: string;
  kind: "call" | "payout" | "refund" | "adjustment";
  amount_cents: number;
  call_id: string | null;
  payout_id: string | null;
  available_at: string;
  livemode: boolean;
  idempotency_key: string;
  created_at: string;
};
export type EarningsSummaryRow = {
  host_id: string;
  total_earned_cents: number;
  available_cents: number;
  pending_cents: number;
  calls_count: number;
  billed_seconds: number;
};
export type PayoutAccountRow = { host_id: string; provider: string | null; provider_account_id: string | null; status: string; updated_at: string };
export type PayoutRecordRow = { id: string; host_id: string; amount_cents: number; status: string; provider: string | null; provider_payout_id: string | null; livemode: boolean; created_at: string; updated_at: string };
export type PlatformSettingRow = { key: string; value: number; description: string; updated_at: string };

type ReadOnly<R> = { Row: R; Insert: never; Update: never; Relationships: [] };

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: never;
        Update: Partial<Pick<ProfileRow, "full_name" | "username" | "avatar_url" | "bio" | "country" | "city" | "region" | "languages" | "interests">>;
        Relationships: [];
      };
      host_profiles: {
        Row: HostProfileRow;
        Insert: never;
        Update: Partial<
          Pick<
            HostProfileRow,
            | "display_name"
            | "tagline"
            | "description"
            | "experience"
            | "session_price"
            | "categories"
            | "call_types"
            | "timezone"
            | "is_available"
            | "is_published"
          >
        >;
        Relationships: [];
      };
      host_availability: {
        Row: HostAvailabilityRow;
        Insert: Omit<HostAvailabilityRow, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<HostAvailabilityRow, "id">>;
        Relationships: [];
      };
      bookings: {
        Row: BookingRow;
        /** Prices, status and ends_at are always set by the database trigger. */
        Insert: Pick<BookingRow, "customer_id" | "host_id" | "scheduled_at" | "duration_minutes" | "call_type">;
        Update: never;
        Relationships: [];
      };
      reviews: {
        Row: ReviewRow;
        Insert: Pick<ReviewRow, "booking_id" | "customer_id" | "host_id" | "rating"> & { comment?: string | null };
        Update: Partial<Pick<ReviewRow, "rating" | "comment">>;
        Relationships: [];
      };
      platform_settings: ReadOnly<PlatformSettingRow>;
      host_pricing: ReadOnly<HostPricingRow>;
      wallets: ReadOnly<WalletRow>;
      wallet_transactions: ReadOnly<WalletTransactionRow>;
      wallet_topups: ReadOnly<WalletTopupRow>;
      call_sessions: ReadOnly<CallSessionRow>;
      host_earnings: ReadOnly<HostEarningRow>;
      payout_accounts: ReadOnly<PayoutAccountRow>;
      payout_records: ReadOnly<PayoutRecordRow>;
      payments: {
        Row: PaymentRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      public_hosts: { Row: PublicHostRow; Relationships: [] };
      public_reviews: { Row: PublicReviewRow; Relationships: [] };
      my_host_bookings: { Row: MyHostBookingRow; Relationships: [] };
      my_calls: { Row: MyCallRow; Relationships: [] };
      my_host_earnings_summary: { Row: EarningsSummaryRow; Relationships: [] };
    };
    Functions: {
      create_topup: { Args: { p_amount_cents: number; p_provider: string; p_method: string }; Returns: WalletTopupRow };
      confirm_topup: {
        Args: { p_topup_id: string; p_provider: string; p_provider_payment_id: string | null; p_amount_cents: number; p_status: TopupStatus; p_method?: string | null; p_reason?: string | null };
        Returns: WalletTopupRow;
      };
      start_call: { Args: { p_host_id: string; p_call_type: CallTypeDb; p_booking_id?: string | null }; Returns: CallSessionRow };
      call_tick: { Args: { p_call_id: string; p_both_connected: boolean }; Returns: CallSessionRow };
      finish_call: { Args: { p_call_id: string; p_reason: string }; Returns: CallSessionRow };
      host_net_cents: { Args: { p_price_cents: number }; Returns: number };
      rate_call: { Args: { p_call_id: string; p_rating: number; p_comment?: string | null }; Returns: "host" | "guest" };
      my_call_rating: { Args: { p_call_id: string }; Returns: { rating: number; comment: string | null }[] };
      report_user: {
        Args: { p_reason: ReportReason; p_details?: string | null; p_call_id?: string | null; p_booking_id?: string | null; p_host_id?: string | null };
        Returns: string;
      };
      set_host_pricing: { Args: { p_audio_cents: number; p_video_cents: number | null }; Returns: HostPricingRow };
      become_host: { Args: Record<string, never>; Returns: string };
      host_presence: { Args: { p_online?: boolean }; Returns: undefined };
      ensure_profile: { Args: Record<string, never>; Returns: ProfileRow };
      confirm_booking: { Args: { p_booking_id: string }; Returns: BookingRow };
      complete_booking: { Args: { p_booking_id: string }; Returns: BookingRow };
      cancel_booking: { Args: { p_booking_id: string }; Returns: BookingRow };
      get_host_busy_slots: {
        Args: { p_host_id: string; p_from: string; p_to: string };
        Returns: { scheduled_at: string; ends_at: string }[];
      };
      humi_price_quote: {
        Args: { p_session_price: number; p_duration: number; p_call_type: CallTypeDb };
        Returns: { subtotal: number; service_fee: number; total_price: number; platform_fee: number; host_earnings: number }[];
      };
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      user_role: UserRoleDb;
      booking_status: BookingStatus;
      call_type: CallTypeDb;
      payment_status: PaymentStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
