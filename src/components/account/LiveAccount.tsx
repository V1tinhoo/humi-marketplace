"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Check, Compass, Mic, Phone, Star, Video, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/auth/AuthShell";
import { HostPhoto } from "@/components/hosts/HostBits";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Container, DemoNotice, Skeleton } from "@/components/ui/primitives";
import { FormError } from "@/components/ui/FormError";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { CountrySelect, RegionSelect, TagPicker } from "@/components/ui/ProfileFields";
import { INTEREST_SUGGESTIONS } from "@/data/places";
import { useAuth } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn, formatDate, formatPrice } from "@/lib/utils";
import type { BookingRow, ProfileRow } from "@/types/database";
import { ErrorPanel, StatusBadge, parseList } from "./shared";
import { describeInZone, viewerTimeZone } from "@/lib/time";
import { ReportButton } from "@/components/safety/ReportButton";
import { useCountry, useIntlLocale, useT } from "@/i18n/client";
import { countryFromCode } from "@/data/places";

type BookingItem = Pick<BookingRow, "id" | "host_id" | "scheduled_at" | "ends_at" | "duration_minutes" | "call_type" | "status" | "total_price"> & {
  hostName: string;
  hostPhoto: string;
  /** Host's IANA zone (null if the host is no longer listed). */
  hostTz: string | null;
  reviewed: boolean;
};

export function LiveAccount() {
  const { user } = useAuth();
  const tr = useT();
  const loc = useIntlLocale();
  const supabase = getSupabaseBrowserClient()!;
  const [tab, setTab] = useState<"bookings" | "profile">("bookings");
  const [items, setItems] = useState<BookingItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<BookingItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    // RLS returns only this customer's bookings.
    const { data: bookings, error } = await supabase
      .from("bookings")
      .select("id, host_id, scheduled_at, ends_at, duration_minutes, call_type, status, total_price")
      .eq("customer_id", user!.id)
      .order("scheduled_at", { ascending: false });
    if (error) {
      setLoadError(tr("We couldn't load your bookings."));
      return;
    }
    const hostIds = Array.from(new Set((bookings ?? []).map((b) => b.host_id)));
    const [{ data: hosts }, { data: reviews }] = await Promise.all([
      hostIds.length ? supabase.from("public_hosts").select("id, display_name, avatar_url, timezone").in("id", hostIds) : Promise.resolve({ data: [] as { id: string; display_name: string; avatar_url: string | null; timezone: string }[] }),
      supabase.from("reviews").select("booking_id").eq("customer_id", user!.id),
    ]);
    const hostMap = new Map((hosts ?? []).map((h) => [h.id, h]));
    const reviewed = new Set((reviews ?? []).map((r) => r.booking_id));
    setItems(
      (bookings ?? []).map((b) => ({
        ...b,
        hostName: hostMap.get(b.host_id)?.display_name ?? "Host",
        hostPhoto: hostMap.get(b.host_id)?.avatar_url ?? "",
        hostTz: hostMap.get(b.host_id)?.timezone ?? null,
        reviewed: reviewed.has(b.id),
      })),
    );
  }, [supabase, user, tr]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const cancel = async (b: BookingItem) => {
    if (!confirm(tr("Cancel your session with {name}?", { name: b.hostName }))) return;
    const { error } = await supabase.rpc("cancel_booking", { p_booking_id: b.id });
    setToast(error ? tr(error.message) : tr("Booking cancelled"));
    load();
  };

  const now = Date.now();
  const upcoming = (items ?? []).filter((b) => Date.parse(b.ends_at) >= now && b.status !== "cancelled").reverse();
  const past = (items ?? []).filter((b) => Date.parse(b.ends_at) < now || b.status === "cancelled");

  return (
    <Container className="pb-24 pt-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <UserAvatar
          src={user!.avatarUrl}
          name={user!.name}
          sizes="80px"
          className="size-20 rounded-[1.5rem] ring-4 ring-white shadow-soft"
          fallbackClassName="bg-gradient-to-br from-lavender to-rose text-2xl font-extrabold text-plum-deep ring-0 shadow-none"
        />
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{tr("Hi, {name}", { name: user!.name.split(" ")[0] })}</h1>
          <p className="mt-1 text-plum-soft">
            {user!.role === "host" ? tr("Host account") : tr("Member account")} · {tr("joined {date}", { date: formatDate(user!.createdAt, { month: "long", year: "numeric" }, loc) })}
          </p>
        </div>
        {user!.role === "host" || user!.role === "admin" ? (
          <ButtonLink href="/dashboard" variant="secondary" className="sm:ml-auto">{tr("Go to host dashboard")}</ButtonLink>
        ) : (
          <ButtonLink href="/become-a-host/apply" variant="secondary" className="sm:ml-auto">{tr("Become a host")}</ButtonLink>
        )}
      </div>

      <div className="mt-10 flex gap-1 border-b border-line" role="tablist">
        {(["bookings", "profile"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("relative px-4 py-3 text-sm font-semibold transition", tab === t ? "text-plum" : "text-plum-soft hover:text-plum")}
          >
            {t === "bookings" ? tr("My bookings") : tr("Profile")}
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-plum" />}
          </button>
        ))}
      </div>

      {tab === "bookings" ? (
        <div className="mt-8 animate-fade-up">
          {loadError ? (
            <ErrorPanel message={loadError} onRetry={load} />
          ) : !items ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-[var(--radius-card)] bg-white px-6 py-16 text-center ring-1 ring-line">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-blush"><Compass className="size-7" strokeWidth={1.75} /></span>
              <h2 className="mt-5 text-xl font-bold">{tr("No sessions yet")}</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-plum-soft">{tr("When you book a session it'll show up here. Find someone whose interests match yours.")}</p>
              <ButtonLink href="/explore" className="mt-6">{tr("Explore hosts")}</ButtonLink>
            </div>
          ) : (
            <div className="space-y-10">
              <BookingList title={tr("Upcoming")} items={upcoming} onCancel={cancel} />
              <BookingList title={tr("Past & cancelled")} items={past} onReview={setReviewing} />
            </div>
          )}
          <DemoNotice className="mt-8">{tr("Reserving a time is free. Calls are paid from your wallet, per second, during the call.")}</DemoNotice>
        </div>
      ) : (
        <ProfileForm onSaved={() => setToast(tr("Profile saved"))} />
      )}

      {reviewing && (
        <ReviewDialog
          booking={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => {
            setReviewing(null);
            setToast(tr("Thanks for your review!"));
            load();
          }}
        />
      )}

      {toast && (
        <div role="status" className="fixed bottom-8 left-1/2 z-[70] -translate-x-1/2 animate-fade-up rounded-full bg-plum px-5 py-2.5 text-sm font-medium text-white shadow-lift">
          {toast}
        </div>
      )}
    </Container>
  );
}

/** Starts the per-minute call for a confirmed reservation (the server checks the balance). */
function JoinCallButton({ booking }: { booking: BookingItem }) {
  const router = useRouter();
  const tr = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const join = async () => {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/calls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hostId: booking.host_id, callType: booking.call_type, bookingId: booking.id }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Couldn't start the call.");
    router.push(`/call/${j.callId}`);
  };
  return (
    <span className="flex flex-col items-end gap-1">
      <button onClick={join} disabled={busy} className="inline-flex items-center gap-1 rounded-full bg-online px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">
        <Phone className="size-3" /> {busy ? tr("Starting…") : tr("Join call")}
      </button>
      {err && <span className="text-[11px] text-[#a3324a]">{tr(err)} {/balance/i.test(err) && <Link href="/wallet" className="underline">{tr("Add balance")}</Link>}</span>}
    </span>
  );
}

function BookingList({
  title,
  items,
  onCancel,
  onReview,
}: {
  title: string;
  items: BookingItem[];
  onCancel?: (b: BookingItem) => void;
  onReview?: (b: BookingItem) => void;
}) {
  const tr = useT();
  const loc = useIntlLocale();
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((b) => {
          const d = new Date(b.scheduled_at);
          const Icon = b.call_type === "audio" ? Mic : Video;
          const canCancel = onCancel && (b.status === "pending" || b.status === "confirmed") && d.getTime() > Date.now();
          const canReview = onReview && b.status === "completed" && !b.reviewed;
          return (
            <li key={b.id} className="flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-line">
              <HostPhoto src={b.hostPhoto} name={b.hostName} sizes="64px" className="size-16 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={`/hosts/${b.host_id}`} className="font-bold hover:underline">{b.hostName}</Link>
                  <StatusBadge status={b.status} />
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-plum-soft">
                  <Icon className="size-3.5" /> {b.duration_minutes} min · {b.call_type === "audio" ? tr("Audio") : tr("Video")}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-plum-soft">
                  <CalendarDays className="size-3.5" />
                  {describeInZone(d, viewerTimeZone(), undefined, loc)}
                </p>
                {b.hostTz && b.hostTz !== viewerTimeZone() && (
                  <p className="mt-0.5 pl-5 text-xs text-plum-soft">{tr("{name}'s time", { name: b.hostName })}: {describeInZone(d, b.hostTz, undefined, loc)}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-plum-soft">
                    {Number(b.total_price) > 0 ? `${formatPrice(Number(b.total_price), { cents: true })} · ${tr("old fixed-price booking (test)")}` : tr("Free reservation · billed per minute during the call")}
                  </p>
                  {/* Joinable from 10 minutes before until the reserved slot ends. */}
                  {b.status === "confirmed" && Date.now() > d.getTime() - 10 * 60_000 && Date.now() < Date.parse(b.ends_at) && (
                    <JoinCallButton booking={b} />
                  )}
                  {canCancel && (
                    <button onClick={() => onCancel(b)} className="text-xs font-semibold text-[#a3324a] underline-offset-2 hover:underline">{tr("Cancel")}</button>
                  )}
                  {canReview && (
                    <button onClick={() => onReview(b)} className="inline-flex items-center gap-1 rounded-full bg-lilac px-3 py-1 text-xs font-semibold">
                      <Star className="size-3" /> {tr("Leave a review")}
                    </button>
                  )}
                  {b.reviewed && <span className="text-xs font-medium text-plum-soft">{tr("Reviewed")}</span>}
                  <ReportButton target={{ bookingId: b.id }} name={b.hostName} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ReviewDialog({ booking, onClose, onDone }: { booking: BookingItem; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const tr = useT();
  const supabase = getSupabaseBrowserClient()!;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) return setError(tr("Please choose a rating."));
    if (comment.length > 1000) return setError(tr("Please keep your review under 1000 characters."));
    setSaving(true);
    // RLS + trigger verify the booking is this customer's and completed.
    const { error: err } = await supabase.from("reviews").insert({
      booking_id: booking.id,
      customer_id: user!.id,
      host_id: booking.host_id,
      rating,
      comment: comment.trim() || null,
    });
    setSaving(false);
    if (err) return setError(err.code === "23505" ? tr("You've already reviewed this session.") : err.message);
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <div className="absolute inset-0 bg-plum-deep/40 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={submit} role="dialog" aria-modal aria-labelledby="review-title" className="relative w-full max-w-md animate-fade-up rounded-[1.5rem] bg-white p-6 shadow-lift">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 grid size-8 place-items-center rounded-full hover:bg-lilac" aria-label={tr("Close")}>
          <X className="size-4" />
        </button>
        <h2 id="review-title" className="text-lg font-bold">{tr("How was your session with {name}?", { name: booking.hostName })}</h2>
        <div className="mt-4 flex gap-1" role="radiogroup" aria-label={tr("Rating")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={tr(n > 1 ? "{n} stars" : "{n} star", { n })} onClick={() => setRating(n)} className="p-1">
              <Star className={cn("size-7 transition", n <= rating ? "fill-plum text-plum" : "text-plum/25 hover:text-plum/50")} />
            </button>
          ))}
        </div>
        <label htmlFor="review-comment" className="mt-4 block text-sm font-semibold">{tr("Comment (optional)")}</label>
        <textarea
          id="review-comment"
          rows={4}
          maxLength={1000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="mt-2 w-full rounded-xl bg-cream p-3 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-lavender"
          placeholder={tr("What made the conversation good?")}
        />
        <FormError message={error} className="mt-3" />
        <Button type="submit" className="mt-4 w-full" loading={saving}>{tr("Post review")}</Button>
      </form>
    </div>
  );
}

function ProfileForm({ onSaved }: { onSaved: () => void }) {
  const { user, refreshProfile } = useAuth();
  const tr = useT();
  const geoCountry = countryFromCode(useCountry());
  const supabase = getSupabaseBrowserClient()!;
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [form, setForm] = useState({ full_name: "", country: "", region: "", bio: "", languages: "", interests: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user!.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setProfile(data);
        setForm({
          full_name: data.full_name,
          // No country saved yet → suggest the one we detected from the visitor's location.
          country: data.country ?? geoCountry ?? "",
          region: data.region ?? "",
          bio: data.bio ?? "",
          languages: data.languages.join(", "),
          interests: data.interests.join(", "),
        });
      });
  }, [supabase, user, geoCountry]);

  const setValue = (k: keyof typeof form) => (v: string) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setForm({ ...form, [k]: e.target.value });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.full_name.trim().length < 2) next.full_name = tr("Please enter your name.");
    if (form.full_name.length > 80) next.full_name = tr("Keep it under 80 characters.");
    if (form.bio.length > 1000) next.bio = tr("Keep it under 1000 characters.");
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name.trim(),
        country: form.country.trim() || null,
        region: form.region.trim() || null,
        bio: form.bio.trim() || null,
        languages: parseList(form.languages, 10),
        interests: parseList(form.interests, 20),
      })
      .eq("id", user!.id);
    setSaving(false);
    if (error) return setErrors({ form: error.message });
    setSaved(true);
    await refreshProfile();
    onSaved();
  };

  if (!profile) return <Skeleton className="mt-8 h-96 max-w-lg" />;

  return (
    <form className="mt-8 grid max-w-2xl animate-fade-up gap-5 sm:grid-cols-2" onSubmit={submit} noValidate>
      <div className="sm:col-span-2"><FormError message={errors.form} /></div>
      <AvatarUpload className="sm:col-span-2" value={profile.avatar_url} name={form.full_name} onChange={() => refreshProfile()} />
      <Field label={tr("Full name")} name="full_name" value={form.full_name} onChange={set("full_name")} error={errors.full_name} hint={<span className="text-xs text-plum-soft">{tr("Only your first name is shown to hosts")}</span>} />
      <Field label={tr("Email")} name="email" type="email" value={user!.email} readOnly />
      <CountrySelect value={form.country} onChange={(v) => { setValue("country")(v); if (v !== form.country) setValue("region")(""); }} />
      <RegionSelect country={form.country} value={form.region} onChange={setValue("region")} />
      <Field label={tr("Languages")} name="languages" value={form.languages} onChange={set("languages")} placeholder={tr("English, Spanish")} />
      <div className="sm:col-span-2">
        <TagPicker
          label={tr("Interests")}
          value={parseList(form.interests, 20)}
          onChange={(v) => setValue("interests")(v.join(", "))}
          suggestions={INTEREST_SUGGESTIONS}
          max={20}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="bio" className="text-sm font-semibold">{tr("About you")}</label>
        <textarea id="bio" rows={4} maxLength={1000} value={form.bio} onChange={set("bio")} className="mt-2 w-full rounded-xl bg-white p-4 text-[15px] ring-1 ring-line outline-none focus:ring-2 focus:ring-lavender" />
        {errors.bio && <p className="mt-1.5 text-xs font-medium text-[#a3324a]">{tr(errors.bio)}</p>}
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" loading={saving}>{saved ? <><Check className="size-4" /> {tr("Saved")}</> : tr("Save changes")}</Button>
        <Link href="/forgot-password" className="text-sm font-semibold text-plum-soft hover:text-plum">{tr("Change password")}</Link>
      </div>
    </form>
  );
}
