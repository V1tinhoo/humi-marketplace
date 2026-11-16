"use client";

import { useIntlLocale, useLocale, useT } from "@/i18n/client";
import { countryLabel } from "@/data/places";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Banknote,
  CalendarClock,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock,
  Eye,
  LayoutGrid,
  MessageSquareQuote,
  Mic,
  Star,
  TrendingUp,
  UserRoundPen,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { DemoNotice, Skeleton } from "@/components/ui/primitives";
import { FormError } from "@/components/ui/FormError";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { ReportButton } from "@/components/safety/ReportButton";
import { BlockButton } from "@/components/safety/BlockButton";
import { CountrySelect, RegionSelect, TagPicker } from "@/components/ui/ProfileFields";
import { INTEREST_SUGGESTIONS } from "@/data/places";
import { Field } from "@/components/auth/AuthShell";
import { Toggle } from "@/components/explore/ExploreView";
import { Panel, Stat } from "./HostDashboard";
import { Withdrawals } from "./Withdrawals";
import { ErrorPanel, StatusBadge, parseList } from "@/components/account/shared";
import { categories as CATEGORY_LIST } from "@/data/categories";
import { cn, formatPrice } from "@/lib/utils";
import { formatBRL, formatDuration, parseReaisToCents } from "@/lib/money";
import { describeInZone, isValidTimeZone, tzLabel, viewerTimeZone } from "@/lib/time";
import type { EarningsSummaryRow, HostEarningRow, MyCallRow, PayoutAccountRow, PayoutRecordRow, Database, CallTypeDb, HostAvailabilityRow, HostProfileRow, MyHostBookingRow, ProfileRow, PublicReviewRow } from "@/types/database";

type Tab = "overview" | "bookings" | "availability" | "profile" | "pricing" | "reviews" | "payouts";
const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "bookings", label: "Bookings", icon: CalendarClock },
  { id: "availability", label: "Availability", icon: CalendarDays },
  { id: "profile", label: "Profile", icon: UserRoundPen },
  { id: "pricing", label: "Pricing", icon: CircleDollarSign },
  { id: "reviews", label: "Reviews", icon: MessageSquareQuote },
  { id: "payouts", label: "Finance", icon: Banknote },
];

interface DashData {
  host: HostProfileRow;
  profile: ProfileRow;
  availability: HostAvailabilityRow[];
  bookings: MyHostBookingRow[];
}

export function LiveHostDashboard() {
  const tr = useT();
  const { user } = useAuth();
  const supabase = getSupabaseBrowserClient()!;
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("tab");
    if (want === "finance") setTab("payouts");
    else if (want && tabs.some((t) => t.id === want)) setTab(want as Tab);
  }, []);
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [hp, pr] = await Promise.all([
      supabase.from("host_profiles").select("*").eq("user_id", user!.id).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", user!.id).single(),
    ]);
    if (hp.error || pr.error) return setError(tr("We couldn't load your dashboard."));
    if (!hp.data) return setError(tr("No host profile found for this account."));
    const [av, bk] = await Promise.all([
      supabase.from("host_availability").select("*").eq("host_id", hp.data.id),
      supabase.from("my_host_bookings").select("*").order("scheduled_at", { ascending: true }),
    ]);
    if (av.error || bk.error) return setError(tr("We couldn't load your bookings or availability."));
    setData({ host: hp.data, profile: pr.data, availability: av.data ?? [], bookings: bk.data ?? [] });
  }, [supabase, user, tr]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  /** Updates editable host_profiles columns (column privileges block anything else). */
  /** Reload dashboard data and refresh the cached public pages (Explore, profile). */
  const refresh = useCallback(async () => {
    await load();
    fetch("/api/revalidate-host", { method: "POST" }).catch(() => {});
  }, [load]);

  /** Optimistic update of editable host_profiles columns; rolls back if the save fails. */
  const updateHost = async (patch: Database["public"]["Tables"]["host_profiles"]["Update"], msg = "Saved") => {
    const before = data!.host;
    setData((d) => (d ? { ...d, host: { ...d.host, ...patch } } : d));
    // .select() makes the save report how many rows changed: RLS can silently skip a row without an error.
    const { data: rows, error: err } = await supabase.from("host_profiles").update(patch).eq("id", before.id).select("id");
    if (err || !rows?.length) {
      setData((d) => (d ? { ...d, host: before } : d));
      setToast(err ? tr("Couldn't save: {error}", { error: err.message }) : tr("Couldn't save — please log in again and retry."));
      return false;
    }
    setToast(msg);
    // Turning "Online now" on: send a heartbeat right away so others see it immediately.
    if (patch.is_available === true) await supabase.rpc("host_presence", { p_online: true });
    fetch("/api/revalidate-host", { method: "POST" }).catch(() => {});
    return true;
  };

  // Hosts created before the zone was saved at sign-up still have the 'UTC' default,
  // which silently shifts their availability. Offer the device's zone instead.
  const [deviceTz, setDeviceTz] = useState<string | null>(null);
  useEffect(() => setDeviceTz(viewerTimeZone()), []);
  const useDeviceTimezone = async () => {
    if (!deviceTz || !data) return;
    const ok = await updateHost({ timezone: deviceTz }, tr("Time zone set to {zone}", { zone: deviceTz.replace(/_/g, " ") }));
    // Same local hours, now interpreted in the right zone.
    if (ok && data.availability.length) await supabase.from("host_availability").update({ timezone: deviceTz }).eq("host_id", data.host.id);
    await refresh();
  };

  if (error) return <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><ErrorPanel message={error} onRetry={load} /></div>;
  if (!data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <Skeleton className="h-10 w-72" />
        <div className="mt-8 grid gap-4 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
        <Skeleton className="mt-6 h-72" />
      </div>
    );
  }

  const { host } = data;
  const checklist = [
    { ok: !!host.tagline && !!host.description, label: tr("Tagline and description") },
    { ok: host.categories.length > 0, label: tr("At least one session category") },
    { ok: data.availability.length > 0, label: tr("Weekly availability") },
    { ok: !!data.profile.avatar_url, label: tr("Profile photo") },
  ];
  const ready = checklist.every((c) => c.ok);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8 lg:pt-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-plum-soft">{tr("Host dashboard")}</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">{tr("Welcome back, {name}", { name: host.display_name })}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <ToggleChip
            label={tr("Listed in Explore")}
            status={host.is_published ? tr("Public") : tr("Hidden")}
            checked={host.is_published}
            onChange={(v) => updateHost({ is_published: v }, v ? tr("Your profile is now public") : tr("Your profile is hidden"))}
          />
          <ToggleChip
            label={tr("Online now")}
            status={host.is_available ? tr("Online") : tr("Away")}
            checked={host.is_available}
            onChange={(v) => updateHost({ is_available: v }, v ? tr("You're shown as online") : tr("You're shown as away"))}
          />
        </div>
      </div>

      {host.timezone === "UTC" && deviceTz && deviceTz !== "UTC" && (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-dashed border-rose bg-blush p-5 sm:flex-row sm:items-center">
          <AlertCircle className="size-5 shrink-0" />
          <p className="flex-1 text-sm">
            <strong>{tr("Your time zone is set to UTC.")}</strong> {tr("Your device is in")} <strong>{deviceTz.replace(/_/g, " ")}</strong> ({tzLabel(deviceTz)}).{" "}
            {tr("Your availability and bookings are shown in your time zone, so guests may see the wrong hours until this is fixed.")}
          </p>
          <Button size="sm" onClick={useDeviceTimezone}>{tr("Use {zone} time", { zone: deviceTz.split("/").pop()?.replace(/_/g, " ") })}</Button>
        </div>
      )}

      {!host.is_published && (
        <div className="mt-6 rounded-2xl border border-dashed border-lavender bg-lilac/40 p-5">
          <p className="flex items-center gap-2 font-semibold"><AlertCircle className="size-4" /> {tr("Your profile isn't public yet")}</p>
          <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
            {checklist.map((c) => (
              <li key={c.label} className={cn("flex items-center gap-2", c.ok ? "text-plum" : "text-plum-soft")}>
                <span className={cn("grid size-5 place-items-center rounded-full", c.ok ? "bg-plum text-white" : "ring-1 ring-plum-soft/40")}>{c.ok && <Check className="size-3" />}</span>
                {c.label}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => updateHost({ is_published: true }, tr("Your profile is now public in Explore"))}>
              <Eye className="size-4" /> {tr("Publish my profile")}
            </Button>
            <p className="text-xs text-plum-soft">
              {ready ? tr("All set — publish to appear in Explore for everyone.") : tr("You can publish now, but complete profiles get more bookings.")}
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label={tr("Dashboard sections")} className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:self-start lg:px-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition",
                tab === t.id ? "bg-plum text-white" : "text-plum-soft hover:bg-white hover:text-plum",
              )}
            >
              <t.icon className="size-4" /> {tr(t.label)}
              {t.id === "bookings" && data.bookings.some((b) => b.status === "pending") && <span className="size-2 rounded-full bg-rose" aria-label={tr("pending requests")} />}
            </button>
          ))}
          {host.is_published && (
            <Link href={`/hosts/${host.id}`} className="flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-plum-soft hover:bg-white hover:text-plum">
              <Eye className="size-4" /> {tr("View public profile")}
            </Link>
          )}
        </nav>

        <div key={tab} className="min-w-0 animate-fade-up">
          {tab === "overview" && <Overview data={data} />}
          {tab === "bookings" && <Bookings data={data} reload={load} setToast={setToast} />}
          {tab === "availability" && <AvailabilityEditor data={data} reload={refresh} setToast={setToast} />}
          {tab === "profile" && <ProfileEditor data={data} reload={refresh} setToast={setToast} />}
          {tab === "pricing" && <PricingEditor host={host} setToast={setToast} />}
          {tab === "reviews" && <ReviewsList hostId={host.id} />}
          {tab === "payouts" && <Finance hostId={host.id} />}
        </div>
      </div>

      {toast && (
        <div role="status" className="fixed bottom-8 left-1/2 z-[70] -translate-x-1/2 animate-fade-up rounded-full bg-plum px-5 py-2.5 text-sm font-medium text-white shadow-lift">
          {toast}
        </div>
      )}
    </div>
  );
}

function ToggleChip({
  label,
  status,
  checked,
  onChange,
}: {
  label: string;
  status: string;
  checked: boolean;
  onChange: (v: boolean) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-full bg-white py-2 pl-4 pr-2 ring-1 ring-line">
      <span className={cn("size-2.5 rounded-full transition-colors", checked ? "bg-online" : "bg-plum-soft/40")} aria-hidden />
      <span className="text-sm font-semibold">
        {label} <span className={cn("font-medium", checked ? "text-online" : "text-plum-soft")}>· {status}</span>
      </span>
      <Toggle
        checked={checked}
        label={label}
        disabled={saving}
        onChange={async (v) => {
          setSaving(true);
          await onChange(v);
          setSaving(false);
        }}
      />
    </div>
  );
}

/* ------------------------------ Overview ------------------------------ */
function Overview({ data }: { data: DashData }) {
  const tr = useT();
  const loc = useIntlLocale();
  const now = Date.now();
  // Per-minute model: earnings come from billed calls (server ledger), price from host_pricing.
  const supabase = getSupabaseBrowserClient()!;
  const [money, setMoney] = useState<{ earned: number; audio: number | null } | null>(null);
  useEffect(() => {
    Promise.all([
      supabase.from("my_host_earnings_summary").select("total_earned_cents").maybeSingle(),
      supabase.from("host_pricing").select("audio_cents_per_minute").eq("host_id", data.host.id).maybeSingle(),
    ]).then(([e, p]) => setMoney({ earned: Number(e.data?.total_earned_cents ?? 0), audio: p.data?.audio_cents_per_minute ?? null }));
  }, [supabase, data.host.id]);
  const completed = data.bookings.filter((b) => b.status === "completed");
  const last30 = completed.filter((b) => now - Date.parse(b.scheduled_at) < 30 * 86_400_000);
  const upcoming = data.bookings.filter((b) => (b.status === "pending" || b.status === "confirmed") && Date.parse(b.ends_at) > now).slice(0, 4);

  // Earnings per week (last 8 weeks) from completed sessions.
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = now - (7 - i) * 7 * 86_400_000;
    const start = end - 7 * 86_400_000;
    const value = completed.filter((b) => { const t = Date.parse(b.scheduled_at); return t >= start && t < end; }).reduce((a, b) => a + Number(b.host_earnings), 0);
    return { label: new Date(end).toLocaleDateString(loc, { month: "short", day: "numeric" }), value };
  });
  const max = Math.max(1, ...weeks.map((w) => w.value));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={tr("Call earnings")} value={money ? formatBRL(money.earned) : "…"} sub={tr("From your calls · see Finance")} icon={TrendingUp} tone="bg-lilac" />
        <Stat label={tr("Completed sessions")} value={String(data.host.total_sessions)} sub={tr("{n} in the last 30 days", { n: last30.length })} icon={Check} tone="bg-blush" />
        <Stat label={tr("Average rating")} value={data.host.review_count ? Number(data.host.average_rating).toFixed(1) : "—"} sub={tr(data.host.review_count === 1 ? "{n} review" : "{n} reviews", { n: data.host.review_count })} icon={Star} tone="bg-white ring-1 ring-line" />
        <Stat label={tr("Your price")} value={money?.audio != null ? formatBRL(money.audio) : "…"} sub={tr("per minute, audio")} icon={CircleDollarSign} tone="bg-white ring-1 ring-line" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title={tr("Weekly earnings")} action={<span className="text-xs text-plum-soft">{tr("Last 8 weeks")}</span>}>
          {completed.length === 0 ? (
            <p className="grid h-56 place-items-center rounded-2xl bg-cream text-sm text-plum-soft">{tr("Your earnings will appear here after your first completed session.")}</p>
          ) : (
            <div className="flex h-56 items-end gap-2 sm:gap-3" role="img" aria-label={tr("Bar chart of weekly earnings over the last 8 weeks")}>
              {weeks.map((w, i) => (
                <div key={w.label} className="group flex flex-1 flex-col items-center gap-2">
                  <span className="text-[11px] font-semibold text-plum opacity-0 transition group-hover:opacity-100">{formatPrice(w.value)}</span>
                  <div className={cn("w-full rounded-t-lg", i === 7 ? "bg-plum" : "bg-lavender")} style={{ height: `${Math.max(4, (w.value / max) * 170)}px` }} />
                  <span className="text-[10px] text-plum-soft sm:text-[11px]">{w.label}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title={tr("Next up")}>
          {upcoming.length === 0 ? (
            <p className="rounded-2xl bg-cream p-6 text-center text-sm text-plum-soft">{tr("No upcoming sessions yet.")}</p>
          ) : (
            <ul className="space-y-3">{upcoming.map((b) => <BookingRow key={b.id} b={b} tz={data.host.timezone} compact />)}</ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function BookingRow({ b, tz, compact, actions }: { b: MyHostBookingRow; tz: string; compact?: boolean; actions?: React.ReactNode }) {
  const tr = useT();
  const locale = useLocale();
  const Icon = b.call_type === "audio" ? Mic : Video;
  // Host sees every booking in their own zone, with the zone named.
  const when = describeInZone(new Date(b.scheduled_at), tz);
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-cream p-3.5 sm:flex-row sm:items-center sm:p-4">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white font-bold ring-1 ring-line">{b.customer_name?.[0] ?? "?"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{b.customer_name || tr("Member")} {b.customer_country && <span className="font-normal text-plum-soft">· {countryLabel(b.customer_country, locale)}</span>}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-plum-soft">
            <Icon className="size-3.5 shrink-0" /> {b.duration_minutes} min · {when} ·{" "}
            {Number(b.host_earnings) > 0 ? tr("{amount} to you", { amount: formatPrice(Number(b.host_earnings), { cents: true }) }) : tr("per-minute call")}
          </p>
          {!compact && (
            <span className="mt-1 flex gap-3">
              <ReportButton target={{ bookingId: b.id }} name={b.customer_name || "this guest"} />
              <BlockButton target={{ bookingId: b.id }} name={b.customer_name || "this guest"} />
            </span>
          )}
        </div>
        {!compact && <StatusBadge status={b.status} className="hidden sm:inline" />}
      </div>
      {compact ? <StatusBadge status={b.status} className="self-start sm:self-center" /> : actions}
    </li>
  );
}

/* ------------------------------ Bookings ------------------------------ */
function Bookings({ data, reload, setToast }: { data: DashData; reload: () => Promise<void>; setToast: (s: string) => void }) {
  const tr = useT();
  const supabase = getSupabaseBrowserClient()!;
  const [busy, setBusy] = useState<string | null>(null);
  const now = Date.now();
  const act = async (id: string, fn: "confirm_booking" | "cancel_booking" | "complete_booking", msg: string) => {
    setBusy(id + fn);
    const { error } = await supabase.rpc(fn, { p_booking_id: id });
    setBusy(null);
    setToast(error ? error.message : msg);
    if (!error) reload();
  };
  const upcoming = data.bookings.filter((b) => (b.status === "pending" || b.status === "confirmed") && Date.parse(b.ends_at) > now);
  const toComplete = data.bookings.filter((b) => b.status === "confirmed" && Date.parse(b.ends_at) <= now);
  const history = data.bookings.filter((b) => b.status === "completed" || b.status === "cancelled" || (b.status === "pending" && Date.parse(b.ends_at) <= now)).reverse();
  const tz = data.host.timezone;

  return (
    <div className="space-y-6">
      <Panel title={tr("Incoming & upcoming")} action={<span className="text-xs text-plum-soft">Times in {tzLabel(tz)}</span>}>
        {upcoming.length === 0 ? (
          <p className="rounded-2xl bg-cream p-6 text-center text-sm text-plum-soft">{tr("No upcoming bookings. Make sure your profile is listed and your availability is set.")}</p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((b) => (
              <BookingRow
                key={b.id}
                b={b}
                tz={tz}
                actions={
                  <div className="flex gap-2">
                    {b.status === "pending" && (
                      <Button size="sm" loading={busy === b.id + "confirm_booking"} onClick={() => act(b.id, "confirm_booking", tr("Booking confirmed"))}>{tr("Confirm")}</Button>
                    )}
                    <Button size="sm" variant="secondary" loading={busy === b.id + "cancel_booking"} onClick={() => confirm(tr("Decline / cancel this booking?")) && act(b.id, "cancel_booking", tr("Booking cancelled"))}>
                      {b.status === "pending" ? tr("Decline") : tr("Cancel")}
                    </Button>
                  </div>
                }
              />
            ))}
          </ul>
        )}
      </Panel>
      {toComplete.length > 0 && (
        <Panel title={tr("Mark as completed")}>
          <p className="-mt-2 mb-4 text-sm text-plum-soft">{tr("Sessions that have ended. Marking them complete lets the guest leave a review.")}</p>
          <ul className="space-y-3">
            {toComplete.map((b) => (
              <BookingRow key={b.id} b={b} tz={tz} actions={<Button size="sm" loading={busy === b.id + "complete_booking"} onClick={() => act(b.id, "complete_booking", tr("Marked as completed"))}>{tr("Complete")}</Button>} />
            ))}
          </ul>
        </Panel>
      )}
      <Panel title={tr("History")}>
        {history.length === 0 ? <p className="text-sm text-plum-soft">{tr("Nothing here yet.")}</p> : <ul className="space-y-3">{history.map((b) => <BookingRow key={b.id} b={b} tz={tz} actions={null} />)}</ul>}
      </Panel>
    </div>
  );
}

/* ------------------------------ Availability ------------------------------ */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const toDb = (uiDay: number) => (uiDay + 1) % 7; // UI 0 = Monday → DB 0 = Sunday

function AvailabilityEditor({ data, reload, setToast }: { data: DashData; reload: () => Promise<void>; setToast: (s: string) => void }) {
  const tr = useT();
  const supabase = getSupabaseBrowserClient()!;
  const initial = useMemo(() => {
    const s = new Set<string>();
    for (const w of data.availability) {
      const ui = (w.day_of_week + 6) % 7;
      const sh = Number(w.start_time.slice(0, 2));
      const eh = w.end_time.startsWith("24") ? 24 : Number(w.end_time.slice(0, 2)) + (Number(w.end_time.slice(3, 5)) > 0 ? 1 : 0);
      for (let h = sh; h < eh; h++) s.add(`${ui}-${h}`);
    }
    return s;
  }, [data.availability]);
  const [grid, setGrid] = useState<Set<string>>(initial);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const dirty = grid.size !== initial.size || [...grid].some((k) => !initial.has(k));
  const hours = showAll ? HOURS : HOURS.filter((h) => h >= 7 && h <= 22);

  const toggle = (k: string) => setGrid((g) => { const n = new Set(g); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const save = async () => {
    setSaving(true);
    // Merge contiguous hours into windows per day.
    const rows: { host_id: string; day_of_week: number; start_time: string; end_time: string; timezone: string }[] = [];
    for (let d = 0; d < 7; d++) {
      let start: number | null = null;
      for (let h = 0; h <= 24; h++) {
        const on = h < 24 && grid.has(`${d}-${h}`);
        if (on && start === null) start = h;
        if (!on && start !== null) {
          rows.push({ host_id: data.host.id, day_of_week: toDb(d), start_time: `${String(start).padStart(2, "0")}:00`, end_time: h === 24 ? "24:00" : `${String(h).padStart(2, "0")}:00`, timezone: data.host.timezone });
          start = null;
        }
      }
    }
    const del = await supabase.from("host_availability").delete().eq("host_id", data.host.id);
    const ins = del.error || rows.length === 0 ? { error: del.error } : await supabase.from("host_availability").insert(rows);
    setSaving(false);
    if (ins.error) return setToast(ins.error.message);
    setToast(tr("Availability saved"));
    reload();
  };

  return (
    <Panel title={tr("Weekly availability")} action={<Button size="sm" onClick={save} loading={saving} disabled={!dirty}>{dirty ? tr("Save changes") : <><Check className="size-4" /> {tr("Saved")}</>}</Button>}>
      <p className="-mt-2 mb-5 text-sm text-plum-soft">
        {tr("Click hours to open or close them. Times are in your time zone ({zone}).", { zone: `${tzLabel(data.host.timezone)} · ${data.host.timezone}` })} {tr("{n} hours open per week.", { n: grid.size })}
      </p>
      <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
        <div className="grid min-w-[560px] grid-cols-[48px_repeat(7,1fr)] gap-1.5 text-xs">
          <span />
          {DAYS.map((d) => <span key={d} className="pb-1 text-center font-semibold text-plum-soft">{d}</span>)}
          {hours.map((h) => (
            <div key={h} className="contents">
              <span className="flex items-center text-plum-soft">{String(h).padStart(2, "0")}:00</span>
              {DAYS.map((_, d) => {
                const k = `${d}-${h}`;
                const on = grid.has(k);
                return (
                  <button key={k} onClick={() => toggle(k)} aria-pressed={on} aria-label={`${tr(DAYS[d])} ${h}:00 ${on ? tr("open") : tr("closed")}`}
                    className={cn("h-7 rounded-md transition", on ? "bg-lavender hover:bg-lavender-strong" : "bg-cream ring-1 ring-line hover:bg-lilac")} />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <button onClick={() => setShowAll(!showAll)} className="mt-4 text-sm font-semibold text-plum-soft hover:text-plum">
        {showAll ? "Show 07:00–23:00 only" : "Show all 24 hours"}
      </button>
    </Panel>
  );
}

/* ------------------------------ Profile ------------------------------ */
const TIMEZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
})();

function ProfileEditor({ data, reload, setToast }: { data: DashData; reload: () => Promise<void>; setToast: (s: string) => void }) {
  const tr = useT();
  const supabase = getSupabaseBrowserClient()!;
  const { host, profile } = data;
  const { refreshProfile } = useAuth();
  const [f, setF] = useState({
    display_name: host.display_name,
    tagline: host.tagline ?? "",
    description: host.description ?? "",
    experience: host.experience ?? "",
    timezone: host.timezone,
    categories: host.categories,
    call_types: host.call_types,
    country: profile.country ?? "",
    region: profile.region ?? "",
    languages: profile.languages.join(", "),
    interests: profile.interests.join(", "),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const toggleIn = <T extends string>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!f.display_name.trim() || f.display_name.length > 40) n.display_name = "1–40 characters.";
    if (f.tagline.length > 140) n.tagline = "Max 140 characters.";
    if (f.description.length > 2000) n.description = "Max 2000 characters.";
    if (f.call_types.length === 0) n.call_types = tr("Offer at least one format.");
    if (!isValidTimeZone(f.timezone)) n.timezone = tr("Pick a valid time zone.");
    setErrors(n);
    if (Object.keys(n).length) return;
    setSaving(true);
    const tzChanged = f.timezone !== host.timezone;
    const [a, b] = await Promise.all([
      supabase.from("host_profiles").update({
        display_name: f.display_name.trim(),
        tagline: f.tagline.trim() || null,
        description: f.description.trim() || null,
        experience: f.experience.trim() || null,
        timezone: f.timezone,
        categories: f.categories,
        call_types: f.call_types,
      }).eq("id", host.id),
      supabase.from("profiles").update({
        country: f.country.trim() || null,
        region: f.region.trim() || null,
        languages: parseList(f.languages, 10),
        interests: parseList(f.interests, 20),
      }).eq("id", profile.id),
    ]);
    // Keep availability windows in the host's zone.
    if (!a.error && tzChanged && data.availability.length) {
      await supabase.from("host_availability").update({ timezone: f.timezone }).eq("host_id", host.id);
    }
    setSaving(false);
    const err = a.error ?? b.error;
    if (err) return setErrors({ form: err.message });
    setToast(tr("Profile saved"));
    reload();
  };

  return (
    <Panel title={tr("Public profile")}>
      <form className="grid gap-5 lg:grid-cols-2" onSubmit={submit} noValidate>
        <div className="lg:col-span-2"><FormError message={errors.form} /></div>
        {/* Saves immediately on upload — independent of the "Save profile" button. */}
        <AvatarUpload className="lg:col-span-2" value={profile.avatar_url} name={host.display_name} onChange={() => { reload(); refreshProfile(); }} />
        <Field label={tr("Display name")} name="display_name" value={f.display_name} onChange={set("display_name")} error={errors.display_name} />
        <Field label={tr("Tagline")} name="tagline" value={f.tagline} onChange={set("tagline")} error={errors.tagline} placeholder={tr("One line about you")} />
        <div className="lg:col-span-2">
          <label htmlFor="desc" className="text-sm font-semibold">{tr("About you")}</label>
          <textarea id="desc" rows={5} maxLength={2000} value={f.description} onChange={set("description")} className="mt-2 w-full rounded-xl bg-white p-4 text-[15px] ring-1 ring-line outline-none focus:ring-2 focus:ring-lavender" placeholder={tr("What do you love talking about? What's a conversation with you like?")} />
          {errors.description && <p className="mt-1.5 text-xs font-medium text-[#a3324a]">{errors.description}</p>}
        </div>
        <Field label={tr("Experience (optional)")} name="experience" value={f.experience} onChange={set("experience")} placeholder={tr("e.g. Language exchange organiser for 3 years")} />
        <Field label={tr("Languages")} name="languages" value={f.languages} onChange={set("languages")} placeholder={tr("English, Portuguese")} />
        <CountrySelect value={f.country} onChange={(v) => setF((p) => ({ ...p, country: v, region: v === p.country ? p.region : "" }))} />
        <RegionSelect country={f.country} value={f.region} onChange={(v) => setF((p) => ({ ...p, region: v }))} />
        <div className="lg:col-span-2">
          <TagPicker
            label={tr("Interests")}
            value={parseList(f.interests, 20)}
            onChange={(v) => setF((p) => ({ ...p, interests: v.join(", ") }))}
            suggestions={INTEREST_SUGGESTIONS}
            max={20}
          />
        </div>
        <div>
          <label htmlFor="tz" className="text-sm font-semibold">{tr("Time zone")}</label>
          <select id="tz" value={f.timezone} onChange={set("timezone")} className="mt-2 h-12 w-full rounded-xl bg-white px-3 text-[15px] ring-1 ring-line outline-none focus:ring-2 focus:ring-lavender">
            {(TIMEZONES.includes(f.timezone) ? TIMEZONES : [f.timezone, ...TIMEZONES]).map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
          {errors.timezone && <p className="mt-1.5 text-xs font-medium text-[#a3324a]">{errors.timezone}</p>}
        </div>
        <div>
          <p className="text-sm font-semibold">{tr("Formats")}</p>
          <div className="mt-2 flex gap-2">
            {(["audio", "video"] as CallTypeDb[]).map((c) => (
              <button key={c} type="button" aria-pressed={f.call_types.includes(c)} onClick={() => setF({ ...f, call_types: toggleIn(f.call_types, c) })}
                className={cn("flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold capitalize transition", f.call_types.includes(c) ? "bg-plum text-white" : "bg-cream ring-1 ring-line")}>
                {c === "audio" ? <Mic className="size-4" /> : <Video className="size-4" />} {c}
              </button>
            ))}
          </div>
          {errors.call_types && <p className="mt-1.5 text-xs font-medium text-[#a3324a]">{errors.call_types}</p>}
        </div>
        <div className="lg:col-span-2">
          <p className="text-sm font-semibold">{tr("Session categories")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATEGORY_LIST.map((c) => (
              <button key={c.id} type="button" aria-pressed={f.categories.includes(c.id)} onClick={() => setF({ ...f, categories: toggleIn(f.categories, c.id) })}
                className={cn("rounded-full px-3.5 py-2 text-sm font-medium transition", f.categories.includes(c.id) ? "bg-plum text-white" : "bg-cream ring-1 ring-line hover:ring-lavender")}>
                {c.title}
              </button>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2"><Button type="submit" loading={saving}>{tr("Save profile")}</Button></div>
      </form>
    </Panel>
  );
}

/* ------------------------------ Reviews ------------------------------ */
function ReviewsList({ hostId }: { hostId: string }) {
  const tr = useT();
  const supabase = getSupabaseBrowserClient()!;
  const [reviews, setReviews] = useState<PublicReviewRow[] | null>(null);
  useEffect(() => {
    supabase.from("public_reviews").select("*").eq("host_id", hostId).order("created_at", { ascending: false }).limit(50).then(({ data }) => setReviews(data ?? []));
  }, [supabase, hostId]);
  return (
    <Panel title={tr("Reviews")}>
      {!reviews ? (
        <Skeleton className="h-40" />
      ) : reviews.length === 0 ? (
        <p className="rounded-2xl bg-cream p-6 text-center text-sm text-plum-soft">{tr("No reviews yet. Guests can review you after a completed session.")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-2xl bg-cream p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{r.author_name} {r.author_country && <span className="font-normal text-plum-soft">· {r.author_country}</span>}</p>
                <span className="flex gap-0.5">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={i < r.rating ? "size-3 fill-plum text-plum" : "size-3 text-plum/25"} />)}</span>
              </div>
              {r.comment && <p className="mt-2 text-sm">&ldquo;{r.comment}&rdquo;</p>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------ Pricing (per minute) ------------------------------ */
function PricingEditor({ host, setToast }: { host: HostProfileRow; setToast: (s: string) => void }) {
  const tr = useT();
  const supabase = getSupabaseBrowserClient()!;
  const [loaded, setLoaded] = useState<{ audio: number; video: number | null } | null>(null);
  const [audio, setAudio] = useState("");
  const [video, setVideo] = useState("");
  const [limits, setLimits] = useState({ min: 30, max: 500 });
  const [net, setNet] = useState<{ audio: number | null; video: number | null }>({ audio: null, video: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offersVideo = host.call_types.includes("video");

  useEffect(() => {
    Promise.all([
      supabase.from("host_pricing").select("*").eq("host_id", host.id).maybeSingle(),
      supabase.from("platform_settings").select("key, value").in("key", ["price_min_cents_per_minute", "price_max_cents_per_minute"]),
    ]).then(([p, s]) => {
      const m = Object.fromEntries((s.data ?? []).map((r) => [r.key, Number(r.value)]));
      setLimits({ min: m.price_min_cents_per_minute ?? 30, max: m.price_max_cents_per_minute ?? 500 });
      const a = p.data?.audio_cents_per_minute ?? 100;
      const v = p.data?.video_cents_per_minute ?? null;
      setLoaded({ audio: a, video: v });
      setAudio((a / 100).toFixed(2).replace(".", ","));
      setVideo(v == null ? "" : (v / 100).toFixed(2).replace(".", ","));
    });
  }, [supabase, host.id]);

  const audioCents = parseReaisToCents(audio);
  const videoCents = video.trim() ? parseReaisToCents(video) : null;
  // What the host receives per minute, calculated on the server (the platform rate is never sent to the browser).
  useEffect(() => {
    const t = setTimeout(async () => {
      const ask = async (c: number | null) => (c == null ? null : (await supabase.rpc("host_net_cents", { p_price_cents: c })).data ?? null);
      setNet({ audio: await ask(audioCents), video: await ask(videoCents ?? audioCents) });
    }, 300);
    return () => clearTimeout(t);
  }, [supabase, audioCents, videoCents]);
  const dirty = loaded && (audioCents !== loaded.audio || videoCents !== loaded.video);

  const save = async () => {
    setError(null);
    if (audioCents == null) return setError(tr("Enter a valid audio price, e.g. 1,00."));
    if (video.trim() && videoCents == null) return setError(tr("Enter a valid video price, or leave it empty to use the audio price."));
    setSaving(true);
    // The server re-validates against platform limits; amounts here are never trusted.
    const { data, error: err } = await supabase.rpc("set_host_pricing", { p_audio_cents: audioCents, p_video_cents: videoCents });
    setSaving(false);
    if (err || !data) return setError(err?.code === "P0001" ? tr("Price must be between {min} and {max} per minute.", { min: formatBRL(limits.min), max: formatBRL(limits.max) }) : tr("Couldn't save your price."));
    setLoaded({ audio: data.audio_cents_per_minute, video: data.video_cents_per_minute });
    setToast(tr("Price updated"));
    fetch("/api/revalidate-host", { method: "POST" }).catch(() => {});
  };

  const field = (label: string, value: string, set: (v: string) => void, netCents: number | null, placeholder?: string) => (
    <div className="rounded-2xl bg-cream p-4">
      <label className="text-sm font-semibold">{label}</label>
      <div className="mt-2 flex h-12 items-center rounded-xl bg-white px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-lavender">
        <span className="text-sm font-semibold text-plum-soft">R$</span>
        <input inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} className="h-full flex-1 bg-transparent px-2 text-lg font-bold outline-none" />
        <span className="text-sm text-plum-soft">/min</span>
      </div>
      <p className="mt-2 text-sm text-plum-soft">
        {tr("You receive")} <strong className="text-plum">{netCents == null ? "—" : `${formatBRL(netCents)}/min`}</strong>
      </p>
    </div>
  );

  if (!loaded) return <Skeleton className="h-72" />;
  return (
    <div className="space-y-6">
      <Panel title={tr("Price per minute")} action={<Button size="sm" disabled={!dirty} loading={saving} onClick={save}>{dirty ? tr("Save prices") : <><Check className="size-4" /> {tr("Saved")}</>}</Button>}>
        <div className="grid gap-4 md:grid-cols-2">
          {field(tr("Audio calls"), audio, setAudio, net.audio)}
          {offersVideo
            ? field(tr("Video calls (optional)"), video, setVideo, net.video, tr("same as audio"))
            : <p className="grid place-items-center rounded-2xl bg-cream p-4 text-center text-sm text-plum-soft">{tr("Turn on video in your profile to set a video price.")}</p>}
        </div>
        <FormError message={error} className="mt-4" />
        <p className="mt-4 text-xs text-plum-soft">
          {tr("Allowed: {min} – {max} per minute (set by HUMI). Guests pay per second while connected. New prices apply to calls started after you save.", { min: formatBRL(limits.min), max: formatBRL(limits.max) })}
        </p>
      </Panel>
      <Panel title={tr("Example")}>
        <p className="text-sm text-plum-soft">{tr("A 20-minute audio call at {price}/min earns you about:", { price: formatBRL(audioCents ?? 0) })}</p>
        <p className="mt-2 text-3xl font-extrabold">{net.audio == null ? "—" : formatBRL(net.audio * 20)}</p>
      </Panel>
    </div>
  );
}

/* ------------------------------ Finance ------------------------------ */
function Finance({ hostId }: { hostId: string }) {
  const tr = useT();
  const loc = useIntlLocale();
  const supabase = getSupabaseBrowserClient()!;
  const [summary, setSummary] = useState<EarningsSummaryRow | null | undefined>(undefined);
  const [calls, setCalls] = useState<MyCallRow[] | null>(null);
  const [earnings, setEarnings] = useState<HostEarningRow[] | null>(null);
  const [payouts, setPayouts] = useState<PayoutRecordRow[] | null>(null);
  const [account, setAccount] = useState<PayoutAccountRow | null>(null);

  const load = useCallback(() => {
    Promise.all([
      supabase.from("my_host_earnings_summary").select("*").maybeSingle(),
      supabase.from("my_calls").select("*").eq("i_am_host", true).order("created_at", { ascending: false }).limit(30),
      supabase.from("host_earnings").select("*").eq("host_id", hostId).order("created_at", { ascending: false }).limit(50),
      supabase.from("payout_records").select("*").eq("host_id", hostId).order("created_at", { ascending: false }),
      supabase.from("payout_accounts").select("*").eq("host_id", hostId).maybeSingle(),
    ]).then(([s, c, e, p, a]) => {
      setSummary(s.data ?? null);
      setCalls(c.data ?? []);
      setEarnings(e.data ?? []);
      setPayouts(p.data ?? []);
      setAccount(a.data ?? null);
    });
  }, [supabase, hostId]);
  useEffect(() => {
    load();
  }, [load]);

  const anyTest = (earnings ?? []).some((e) => !e.livemode);
  // Holding period (from the platform settings) and when the next real earnings are released.
  const [rules, setRules] = useState<{ holdDays: number; minCents: number }>({ holdDays: 7, minCents: 1000 });
  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", ["earnings_hold_days", "payout_min_cents"])
      .then(({ data }) => {
        const m = Object.fromEntries((data ?? []).map((r) => [r.key, Number(r.value)]));
        setRules({ holdDays: m.earnings_hold_days ?? 7, minCents: m.payout_min_cents ?? 1000 });
      });
  }, [supabase]);
  const nextRelease = (earnings ?? [])
    .filter((e) => e.livemode && e.kind === "call" && Date.parse(e.available_at) > Date.now())
    .map((e) => e.available_at)
    .sort()[0] ?? null;
  return (
    <div className="space-y-6">
      {anyTest && <DemoNotice>{tr("Some earnings come from")} <strong>{tr("test balance")}</strong> {tr("(test top-ups). They are not real money and can't be paid out.")}</DemoNotice>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label={tr("Total earned")} value={summary === undefined ? "…" : formatBRL(summary?.total_earned_cents ?? 0)} sub={tr("From all your calls")} icon={TrendingUp} tone="bg-lilac" />
        <Stat label={tr("Available")} value={summary === undefined ? "…" : formatBRL(summary?.available_cents ?? 0)} sub={tr("Ready for payout")} icon={Banknote} tone="bg-blush" />
        <Stat label={tr("Pending")} value={summary === undefined ? "…" : formatBRL(summary?.pending_cents ?? 0)} sub={tr("Becomes available after a short holding period (dates below)")} icon={Clock} tone="bg-white ring-1 ring-line" />
        <Stat label={tr("Minutes talked")} value={summary === undefined ? "…" : String(Math.floor((summary?.billed_seconds ?? 0) / 60))} sub={tr("{n} paid calls", { n: summary?.calls_count ?? 0 })} icon={Mic} tone="bg-white ring-1 ring-line" />
      </div>

      <Panel title={tr("Calls")}>
        {!calls ? <Skeleton className="h-32" /> : calls.length === 0 ? (
          <p className="rounded-2xl bg-cream p-6 text-center text-sm text-plum-soft">{tr("No calls yet.")}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-plum-soft">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-semibold sm:px-6">{tr("Guest")}</th>
                  <th className="px-3 py-3 font-semibold">{tr("Date")}</th>
                  <th className="px-3 py-3 font-semibold">{tr("Time")}</th>
                  <th className="px-5 py-3 text-right font-semibold sm:px-6">{tr("You earned")}</th>
                  <th className="px-3 py-3"><span className="sr-only">{tr("Report")}</span></th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-semibold sm:px-6">{c.customer_name || tr("Guest")} <span className="font-normal text-plum-soft">· {c.call_type === "audio" ? tr("Audio") : tr("Video")}</span></td>
                    <td className="px-3 py-3 text-plum-soft">{new Date(c.created_at).toLocaleDateString(loc, { month: "short", day: "numeric" })}</td>
                    <td className="px-3 py-3 text-plum-soft">{c.status === "failed" ? "not connected" : formatDuration(c.billed_seconds)}</td>
                    <td className="px-5 py-3 text-right font-semibold sm:px-6">{formatBRL(c.host_earnings_cents ?? 0)}</td>
                    <td className="px-3 py-3 text-right"><span className="inline-flex gap-3"><ReportButton target={{ callId: c.id }} name={c.customer_name || "this guest"} /><BlockButton target={{ callId: c.id }} name={c.customer_name || "this guest"} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title={tr("Withdraw")}>
        <Withdrawals
          available={summary === undefined ? null : Number(summary?.available_cents ?? 0)}
          pending={summary === undefined ? null : Number(summary?.pending_cents ?? 0)}
          nextReleaseAt={nextRelease}
          holdDays={rules.holdDays}
          minCents={rules.minCents}
          account={account}
          payouts={payouts}
          onChanged={load}
        />
      </Panel>
    </div>
  );
}
