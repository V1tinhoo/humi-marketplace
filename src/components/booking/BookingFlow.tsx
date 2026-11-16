"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  CreditCard,
  Lock,
  LogIn,
  Mic,
  RefreshCw,
  Video,
} from "lucide-react";
import type { DemoBooking, Duration, Host, SessionFormat } from "@/types";
import { DURATIONS, cn, sleep } from "@/lib/utils";
import { formatBRL, hostPriceCents } from "@/lib/money";
import { buildSlots, dayShift, describeInZone, groupByViewerDay, timeInZone, tzLabel, viewerTimeZone, type ViewerDay } from "@/lib/time";
import { Button, ButtonLink } from "@/components/ui/Button";
import { DemoNotice } from "@/components/ui/primitives";
import { HostPhoto, Rating } from "@/components/hosts/HostBits";
import { Toggle } from "@/components/explore/ExploreView";
import { Stepper } from "./Stepper";
import { useAuth } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useIntlLocale, useLocale, useT } from "@/i18n/client";
import { countryLabel } from "@/data/places";

const STEPS = ["Format", "Duration", "Time", "Review", "Checkout"];

type CheckoutState = "idle" | "processing" | "success" | "error";

interface Confirmation {
  reference: string;
  format: SessionFormat;
  duration: Duration;
  start: string;
  total: number;
  live: boolean;
}


/** Maps database/RLS errors from the bookings insert to friendly copy. */
function bookingErrorMessage(err: { code?: string; message?: string }) {
  if (err.code === "23P01") return "Someone just booked that time. Please pick another slot.";
  if (err.code === "42501") return "Your session has expired. Please log in again.";
  if (err.code === "P0001" && err.message) return err.message;
  if (err.message?.toLowerCase().includes("fetch")) return "We couldn't reach the server. Check your connection and try again.";
  return "We couldn't save your booking. Please try again.";
}

export function BookingFlow({ host }: { host: Host }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const { user, mode, addBooking } = useAuth();
  const tr = useT();
  const loc = useIntlLocale();
  const locale = useLocale();
  const dz = (d: Date, z: string, o?: Intl.DateTimeFormatOptions) => describeInZone(d, z, o, loc);
  const live = mode === "supabase" && host.dataSource === "supabase";

  const pFormat = params.get("format") as SessionFormat | null;
  const pDuration = Number(params.get("duration")) as Duration;
  const validFormat = pFormat && host.formats.includes(pFormat) ? pFormat : null;
  const validDuration = DURATIONS.includes(pDuration) ? pDuration : null;

  const [step, setStep] = useState(validFormat && validDuration ? 2 : 0);
  const [format, setFormat] = useState<SessionFormat | null>(validFormat);
  const [duration, setDuration] = useState<Duration | null>(validDuration);
  const [days, setDays] = useState<ViewerDay[] | null>(null);
  // The customer's own zone; read on the client only (avoids a server/browser mismatch).
  const [viewerTz, setViewerTz] = useState("UTC");
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [state, setState] = useState<CheckoutState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  // Slots depend on the clock, so they're built on the client only (no hydration mismatch).
  const loadSlots = useCallback(async () => {
    setDays(null);
    setSlotsError(null);
    const dur = duration ?? 30;
    let busy: { start: number; end: number }[] = [];
    if (live) {
      const supabase = getSupabaseBrowserClient()!;
      const from = new Date();
      const to = new Date(from.getTime() + 10 * 86_400_000);
      const { data, error } = await supabase.rpc("get_host_busy_slots", {
        p_host_id: host.id,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      if (error) {
        setSlotsError("We couldn't load availability. Please try again.");
        return;
      }
      busy = (data ?? []).map((b) => ({ start: Date.parse(b.scheduled_at), end: Date.parse(b.ends_at) }));
    }
    // Generate a few extra host-local days: the customer's 7 days can start/end on different host dates.
    let hostDays = buildSlots({ availability: host.availability, timeZone: host.timezone, durationMinutes: dur, busy, days: 9 });
    if (!live) {
      // Sample hosts: a deterministic "already booked" pattern so the grid looks realistic.
      hostDays = hostDays.map((d, offset) => ({
        ...d,
        slots: d.slots.map((s) => ({ ...s, taken: s.taken || (s.hour + offset + host.firstName.length) % 4 === 0 })),
      }));
    }
    const tzViewer = viewerTimeZone();
    setViewerTz(tzViewer);
    // Show slots under the CUSTOMER's calendar dates and clock.
    const viewerDays = groupByViewerDay(hostDays.flatMap((d) => d.slots), tzViewer, 7);
    setDays(viewerDays);
    setDayIndex(Math.max(0, viewerDays.findIndex((d) => d.slots.some((s) => !s.taken))));
  }, [live, host, duration]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  // Picking a different duration can make the chosen slot invalid.
  useEffect(() => setSlot(null), [duration]);

  // Bring each new step into view (instant, so it doesn't fight the step animation).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [step]);

  // Reserving is free; the call is billed per second from the wallet. This is only an estimate (cents).
  const price = format && duration
    ? { perMin: hostPriceCents(host, format), estimate: hostPriceCents(host, format) * duration, total: hostPriceCents(host, format) * duration }
    : null;
  const canNext = [!!format, !!duration, !!slot, agreed, true][step];
  const loginHref = `/login?next=${encodeURIComponent(`${pathname}?format=${format ?? ""}&duration=${duration ?? ""}`)}`;

  const confirm = async () => {
    if (!format || !duration || !slot || !price) return;
    setState("processing");
    setErrorMsg(null);

    if (live) {
      const supabase = getSupabaseBrowserClient()!;
      if (!user) {
        setState("error");
        setErrorMsg("Please log in to book a session.");
        return;
      }
      const { data, error } = await supabase
        .from("bookings")
        .insert({ customer_id: user.id, host_id: host.id, scheduled_at: slot, duration_minutes: duration, call_type: format })
        .select("id, total_price, scheduled_at, duration_minutes, call_type")
        .single();
      if (error || !data) {
        setState("error");
        setErrorMsg(bookingErrorMessage(error ?? {}));
        if (error?.code === "23P01") loadSlots();
        return;
      }
      setConfirmation({
        reference: data.id.slice(0, 8).toUpperCase(),
        format: data.call_type,
        duration: data.duration_minutes as Duration,
        start: data.scheduled_at,
        total: Number(data.total_price),
        live: true,
      });
      setState("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    await sleep(1800);
    if (simulateFailure) {
      setState("error");
      setErrorMsg("The (simulated) payment didn't go through. Nothing was charged. Turn off the simulation toggle and try again.");
      return;
    }
    const b: DemoBooking = {
      id: `HM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      hostId: host.id,
      hostName: host.firstName,
      hostPhoto: host.photo,
      format,
      duration,
      slot,
      subtotal: 0,
      fee: 0,
      total: 0,
      createdAt: new Date().toISOString(),
      status: "confirmed-demo",
    };
    addBooking(b);
    setConfirmation({ reference: b.id, format, duration, start: slot, total: price.total, live: false });
    setState("success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (state === "success" && confirmation) return <SuccessView c={confirmation} host={host} />;

  const tz = host.timezone;
  const tzName = tzLabel(tz);
  const viewerName = tzLabel(viewerTz);
  // Host time is only shown separately when it can actually differ from the customer's.
  const sameZone = viewerTz === tz;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:gap-12">
      <div className="min-w-0">
        <Stepper steps={STEPS.map((s) => tr(s))} current={step} onJump={setStep} />

        <div key={step} className="mt-10 animate-fade-up">
          {step === 0 && (
            <StepShell title={tr("How would you like to connect?")} subtitle={tr("You can always switch next time.")}>
              <div className="grid gap-4 sm:grid-cols-2">
                {(["audio", "video"] as SessionFormat[]).map((f) => {
                  const available = host.formats.includes(f);
                  const Icon = f === "audio" ? Mic : Video;
                  return (
                    <ChoiceCard key={f} selected={format === f} disabled={!available} onClick={() => setFormat(f)}>
                      <span className={cn("grid size-12 place-items-center rounded-2xl", format === f ? "bg-plum text-white" : "bg-lilac")}>
                        <Icon className="size-6" strokeWidth={1.75} />
                      </span>
                      <p className="mt-5 text-lg font-bold">{f === "audio" ? tr("Audio call") : tr("Video call")}</p>
                      <p className="mt-1 text-sm text-plum-soft">
                        {f === "audio" ? tr("Just voices. Relaxed, easy, no camera needed.") : tr("See each other face to face.")} {available && `${formatBRL(hostPriceCents(host, f))}/min`}
                      </p>
                      {!available && <p className="mt-3 text-xs font-semibold">{tr("Not offered by {name}", { name: host.firstName })}</p>}
                    </ChoiceCard>
                  );
                })}
              </div>
            </StepShell>
          )}

          {step === 1 && (
            <StepShell title={tr("How long would you like to talk?")} subtitle={tr("Most first sessions are 30 minutes.")}>
              <div className="grid gap-4 sm:grid-cols-3">
                {DURATIONS.map((d) => (
                  <ChoiceCard key={d} selected={duration === d} onClick={() => setDuration(d)}>
                    <Clock className="size-5 text-plum-soft" />
                    <p className="mt-4 text-3xl font-extrabold tracking-tight">{d}<span className="text-base font-semibold text-plum-soft"> min</span></p>
                    <p className="mt-1 text-sm text-plum-soft">{d === 20 ? tr("A quick hello") : d === 30 ? tr("The sweet spot") : tr("Settle in properly")}</p>
                    <p className="mt-4 text-lg font-bold">≈ {formatBRL(hostPriceCents(host, format ?? "audio") * d)}</p>
                    <p className="text-xs text-plum-soft">{formatBRL(hostPriceCents(host, format ?? "audio"))}/min, {tr("billed per second")}</p>
                    {d === 30 && <span className="absolute right-4 top-4 rounded-full bg-blush px-2 py-0.5 text-[11px] font-semibold">{tr("Popular")}</span>}
                  </ChoiceCard>
                ))}
              </div>
            </StepShell>
          )}

          {step === 2 && (
            <StepShell
              title={tr("Pick a time")}
              subtitle={
                // Zone names are only known in the browser; render them after the slots load (no hydration mismatch).
                !days
                  ? tr("Loading available times…")
                  : sameZone
                  ? tr("Times shown in your time zone ({zone}).", { zone: viewerName }) + (host.isSample ? ` ${tr("Sample availability.")}` : "")
                  : tr("Times shown in your time zone ({zone}). The small time is {name}'s local time ({hostZone}).", { zone: viewerName, name: host.firstName, hostZone: tzName }) + (host.isSample ? ` ${tr("Sample availability.")}` : "")
              }
            >
              {slotsError ? (
                <div role="alert" className="rounded-2xl bg-white p-8 text-center ring-1 ring-line">
                  <AlertTriangle className="mx-auto size-6 text-[#a3324a]" />
                  <p className="mt-3 font-semibold">{tr(slotsError)}</p>
                  <Button variant="secondary" size="sm" className="mt-4" onClick={loadSlots}><RefreshCw className="size-4" /> {tr("Retry")}</Button>
                </div>
              ) : !days ? (
                <div className="flex gap-2" aria-label={tr("Loading availability")}>
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[76px] w-[84px] shrink-0 rounded-2xl" />)}
                </div>
              ) : days.every((d) => d.slots.length === 0) ? (
                <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-line">
                  <CalendarCheck2 className="mx-auto size-6 text-plum-soft" />
                  <p className="mt-3 font-semibold">{tr("No open times this week")}</p>
                  <p className="text-sm text-plum-soft">{tr("{name} hasn't opened any slots for the next 7 days. Check back soon.", { name: host.firstName })}</p>
                </div>
              ) : (<>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                {days.map((d, i) => {
                  const open = d.slots.filter((s) => !s.taken).length;
                  const label = new Date(Date.UTC(d.year, d.month - 1, d.day)).toLocaleDateString(loc, { weekday: "short", timeZone: "UTC" });
                  return (
                    <button
                      key={i}
                      onClick={() => setDayIndex(i)}
                      className={cn(
                        "flex w-[84px] shrink-0 flex-col items-center rounded-2xl py-3 transition",
                        dayIndex === i ? "bg-plum text-white" : "bg-white ring-1 ring-line hover:ring-lavender",
                      )}
                    >
                      <span className="text-xs font-medium opacity-80">{i === 0 ? tr("Today") : label}</span>
                      <span className="text-xl font-bold">{d.day}</span>
                      <span className={cn("mt-0.5 text-[11px]", dayIndex === i ? "text-white/75" : "text-plum-soft")}>{open ? tr("{n} open", { n: open }) : tr("Full")}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6">
                {days[dayIndex].slots.length === 0 ? (
                  <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-line">
                    <CalendarCheck2 className="mx-auto size-6 text-plum-soft" />
                    <p className="mt-3 font-semibold">{tr("No times left on this day")}</p>
                    <p className="text-sm text-plum-soft">{tr("Try another day — {name} may have more openings later in the week.", { name: host.firstName })}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {days[dayIndex].slots.map((s) => {
                      const iso = s.start.toISOString();
                      const mine = timeInZone(s.start, viewerTz);
                      const theirs = timeInZone(s.start, tz);
                      const shift = dayShift(s.start, viewerTz, tz);
                      const shiftShort = shift > 0 ? ` +1${tr("d")}` : shift < 0 ? ` −1${tr("d")}` : "";
                      return (
                        <button
                          key={iso}
                          disabled={s.taken}
                          onClick={() => setSlot(iso)}
                          aria-label={`${mine} ${tr("your time")}${sameZone ? "" : `, ${theirs}${shift > 0 ? ` ${tr("next day")}` : shift < 0 ? ` ${tr("previous day")}` : ""} ${tr("for {name}", { name: host.firstName })}`}${s.taken ? `, ${tr("already booked")}` : ""}`}
                          className={cn(
                            "flex flex-col items-center rounded-xl py-2.5 text-sm font-semibold transition",
                            slot === iso ? "bg-lavender text-plum-deep ring-2 ring-plum" : "bg-white ring-1 ring-line hover:ring-lavender",
                            s.taken && "cursor-not-allowed bg-cream text-plum-soft/50 line-through hover:ring-line",
                          )}
                        >
                          <span>{mine}</span>
                          {!sameZone && (
                            <span className={cn("text-[11px] font-medium", slot === iso ? "text-plum" : "text-plum-soft")}>
                              {theirs}
                              {shiftShort} · {host.firstName}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {slot && (
                  <p className="mt-4 text-sm text-plum-soft">
                    {tr("You")}: <strong className="text-plum">{dz(new Date(slot), viewerTz)}</strong>
                    {!sameZone && (
                      <>
                        {" "}· {host.firstName}: <strong className="text-plum">{dz(new Date(slot), tz)}</strong>
                      </>
                    )}
                  </p>
                )}
              </div>
              </>)}
            </StepShell>
          )}

          {step === 3 && price && format && duration && slot && (
            <StepShell title={tr("Review your session")} subtitle={tr("Double-check the details before checkout.")}>
              <div className="divide-y divide-line rounded-2xl bg-white ring-1 ring-line">
                <Row editLabel={tr("Edit")} label={tr("Host")} value={`${host.firstName}${host.country ? ` · ${countryLabel(host.country, locale)}` : ""}`} />
                <Row editLabel={tr("Edit")} label={tr("Format")} value={format === "audio" ? tr("Audio") : tr("Video")} onEdit={() => setStep(0)} />
                <Row editLabel={tr("Edit")} label={tr("Duration")} value={tr("{n} minutes", { n: duration })} onEdit={() => setStep(1)} />
                <Row
                  editLabel={tr("Edit")}
                  label={tr("Date & time")}
                  value={
                    <>
                      {dz(new Date(slot), viewerTz, { weekday: "long", month: "long", day: "numeric" })}{" "}
                      <span className="font-normal text-plum-soft">{tr("your time")}</span>
                      {!sameZone && (
                        <span className="mt-0.5 block text-sm font-medium text-plum-soft">
                          {dz(new Date(slot), tz, { weekday: "long", month: "long", day: "numeric" })} {tr("for {name}", { name: host.firstName })}
                        </span>
                      )}
                    </>
                  }
                  onEdit={() => setStep(2)}
                />
              </div>
              <div className="mt-6 rounded-2xl bg-blush/70 p-5 text-sm">
                <p className="font-semibold">{tr("Cancellation policy")}</p>
                <p className="mt-1 text-plum-soft">
                  {tr("Reserving is free and you can cancel any time before it starts. Calls are only charged for the time you're connected.")}{" "}
                  <Link href="/help#cancellation" className="font-semibold text-plum underline underline-offset-2">{tr("Learn more")}</Link>
                </p>
              </div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-line">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#493C62]" />
                <span className="text-sm">
                  {tr("I'm 18 or older and agree to the")}{" "}
                  <Link href="/guidelines" className="font-semibold underline underline-offset-2">{tr("community guidelines")}</Link>. {tr("I understand HUMI sessions are social conversations — not therapy, dating, or professional advice.")}
                </span>
              </label>
            </StepShell>
          )}

          {step === 4 && price && (
            <StepShell title={tr("Confirm your reservation")} subtitle={tr("Reserving a time is free.")}>
              <DemoNotice>
                <strong>{tr("Nothing is charged now.")}</strong>{" "}
                {live
                  ? tr("{name} will be asked to confirm. At the time of the call you pay {price}/min from your wallet, per second, only while you're both connected.", { name: host.firstName, price: formatBRL(price.perMin) })
                  : tr("Demo mode: the reservation is saved in this browser only.")}
              </DemoNotice>

              <div className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-line">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-lilac"><CreditCard className="size-5" /></span>
                  <div>
                    <p className="font-semibold">{tr("Pay as you talk")}</p>
                    <p className="text-sm text-plum-soft">{tr("From your HUMI wallet during the call · R$ 0,00 now")}</p>
                  </div>
                  <Lock className="ml-auto size-4 text-plum-soft" />
                </div>
                {!live && (
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
                    <span>
                      <span className="block text-sm font-semibold">{tr("Simulate a failed payment")}</span>
                      <span className="block text-xs text-plum-soft">{tr("Useful for testing the error state")}</span>
                    </span>
                    <Toggle checked={simulateFailure} onChange={setSimulateFailure} label={tr("Simulate a failed payment")} />
                  </div>
                )}
              </div>

              {!user && (
                <div className="mt-5 flex items-center gap-3 rounded-2xl bg-lilac/50 p-4 text-sm">
                  <LogIn className="size-5 shrink-0" />
                  <p className="flex-1">
                    {live ? tr("Log in or create an account to send your booking request.") : tr("You're browsing as a guest. Log in to keep this demo booking in your account.")}
                  </p>
                  <ButtonLink href={loginHref} size="sm" variant="dark">{tr("Log in")}</ButtonLink>
                </div>
              )}

              {state === "error" && errorMsg && (
                <div role="alert" className="mt-5 flex animate-fade-up items-start gap-3 rounded-2xl bg-[#fde8ea] p-4 text-sm text-[#7a2232]">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                  <p>{tr(errorMsg)}</p>
                </div>
              )}

              <Button size="lg" className="mt-6 w-full" loading={state === "processing"} onClick={confirm} disabled={live && !user}>
                {state === "processing"
                  ? tr("Saving…")
                  : state === "error"
                    ? (<><RefreshCw className="size-4" /> {tr("Try again")}</>)
                    : live
                      ? tr("Request reservation · R$ 0,00 now")
                      : tr("Confirm demo reservation")}
              </Button>
            </StepShell>
          )}
        </div>

        {step < 4 && (
          <div className="mt-10 flex items-center justify-between gap-3">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="size-4" /> {tr("Back")}
              </Button>
            ) : (
              <ButtonLink href={`/hosts/${host.id}`} variant="ghost">
                <ArrowLeft className="size-4" /> {tr("Profile")}
              </ButtonLink>
            )}
            <Button onClick={() => setStep(step + 1)} disabled={!canNext} size="lg">
              {step === 3 ? tr("Continue to checkout") : tr("Continue")} <ArrowRight className="size-4" />
            </Button>
          </div>
        )}
        {step === 4 && state !== "processing" && (
          <Button variant="ghost" className="mt-4" onClick={() => { setStep(3); setState("idle"); setErrorMsg(null); }}>
            <ArrowLeft className="size-4" /> {tr("Back to review")}
          </Button>
        )}
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-[var(--radius-card)] bg-white p-5 shadow-soft ring-1 ring-line">
          <div className="flex items-center gap-4">
            <HostPhoto src={host.photo} name={host.firstName} sizes="64px" className="size-16 shrink-0 rounded-2xl" />
            <div>
              <p className="text-lg font-bold">{host.firstName}{host.age ? `, ${host.age}` : ""}</p>
              <p className="text-sm text-plum-soft">{countryLabel(host.country, locale)}</p>
              {host.reviewCount > 0 && <Rating value={host.rating} count={host.reviewCount} className="mt-0.5" />}
            </div>
          </div>
          <dl className="mt-5 space-y-2.5 border-t border-line pt-5 text-sm">
            <SummaryRow label={tr("Format")} value={format ? (format === "audio" ? tr("Audio") : tr("Video")) : "—"} />
            <SummaryRow label={tr("Duration")} value={duration ? `${duration} min` : "—"} />
            <SummaryRow label={tr("When (your time)")} value={slot ? dz(new Date(slot), viewerTz, { month: "short", day: "numeric" }) : "—"} />
          </dl>
          <dl className="mt-5 space-y-2.5 border-t border-line pt-5 text-sm">
            <SummaryRow label={tr("Price")} value={price ? `${formatBRL(price.perMin)}/min` : "—"} />
            <SummaryRow label={duration ? tr("Estimate for {n} min", { n: duration }) : tr("Estimate")} value={price ? `≈ ${formatBRL(price.estimate)}` : "—"} />
            <div className="flex items-center justify-between border-t border-line pt-3 text-base font-bold">
              <dt>{tr("Due now")}</dt>
              <dd>R$ 0,00</dd>
            </div>
          </dl>
          <p className="mt-4 rounded-xl bg-cream p-3 text-xs text-plum-soft">
            {tr("Prices in R$. Reserving is free; calls are billed per second from your wallet, calculated by HUMI's server.")}
          </p>
        </div>
      </aside>
    </div>
  );
}

function StepShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-2 text-plum-soft">{subtitle}</p>}
      <div className="mt-7">{children}</div>
    </section>
  );
}

function ChoiceCard({ selected, disabled, onClick, children }: { selected: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "relative rounded-[var(--radius-card)] p-6 text-left transition-all duration-200",
        selected ? "bg-white shadow-lift ring-2 ring-plum" : "bg-white ring-1 ring-line hover:-translate-y-0.5 hover:ring-lavender",
        disabled && "cursor-not-allowed opacity-45 hover:translate-y-0",
      )}
    >
      {selected && <CheckCircle2 className="absolute right-4 top-4 size-5 fill-plum text-white" />}
      {children}
    </button>
  );
}

function Row({ label, value, onEdit, editLabel }: { label: string; value: React.ReactNode; onEdit?: () => void; editLabel: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-plum-soft">{label}</p>
        <p className="mt-0.5 font-semibold">{value}</p>
      </div>
      {onEdit && (
        <button onClick={onEdit} className="text-sm font-semibold text-plum underline-offset-4 hover:underline">{editLabel}</button>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-plum-soft">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function SuccessView({ c, host }: { c: Confirmation; host: Host }) {
  const tr = useT();
  const loc = useIntlLocale();
  const start = new Date(c.start);
  const viewerTz = viewerTimeZone();
  const yours = describeInZone(start, viewerTz, { weekday: "long", month: "short", day: "numeric" }, loc);
  const theirs = describeInZone(start, host.timezone, { weekday: "long", month: "short", day: "numeric" }, loc);
  return (
    <div className="mx-auto max-w-xl animate-fade-up text-center">
      <div className="relative mx-auto grid size-20 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-lavender/40 [animation-iteration-count:2]" />
        <span className="relative grid size-20 place-items-center rounded-full bg-lavender text-plum-deep">
          <CheckCircle2 className="size-9" strokeWidth={1.75} />
        </span>
      </div>
      <h1 className="mt-8 text-3xl font-extrabold tracking-tight sm:text-4xl">{c.live ? tr("Booking request sent") : tr("Demo booking confirmed")}</h1>
      <p className="mt-3 text-plum-soft">
        {c.live ? (
          <>
            {tr("{name} will confirm your session soon — you can follow its status in your account.", { name: host.firstName })} <strong className="text-plum">{tr("No payment was taken")}</strong>.
          </>
        ) : (
          <>
            {tr("Your session with {name} is saved in this browser.", { name: host.firstName })} <strong className="text-plum">{tr("No payment was taken")}</strong>. {tr("{name} is a sample profile, so no real session will happen.", { name: host.firstName })}
          </>
        )}
      </p>
      <div className="mt-8 rounded-[var(--radius-card)] bg-white p-6 text-left ring-1 ring-line">
        <div className="flex items-center gap-4">
          <HostPhoto src={host.photo} name={host.firstName} sizes="56px" className="size-14 rounded-2xl" />
          <div>
            <p className="font-bold">{tr(c.format === "audio" ? "{n}-minute audio session" : "{n}-minute video session", { n: c.duration })}</p>
            <p className="text-sm text-plum-soft">{tr("with {name}", { name: host.firstName })}</p>
          </div>
        </div>
        <div className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-plum-soft">{tr("Your time")}</span>
            <span className="text-right font-semibold">{yours}</span>
          </div>
          {viewerTz !== host.timezone && (
            <div className="flex justify-between gap-4">
              <span className="text-plum-soft">{tr("{name}'s time", { name: host.firstName })}</span>
              <span className="text-right font-semibold">{theirs}</span>
            </div>
          )}
        </div>
        <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm">
          <span className="text-plum-soft">{tr("Reference")}</span>
          <span className="font-mono font-semibold">{c.reference}</span>
        </div>
        <div className="mt-2 flex justify-between text-sm">
          <span className="text-plum-soft">{tr("Due now")}</span>
          <span className="font-semibold">{tr("R$ 0,00 · then {price}/min during the call", { price: formatBRL(hostPriceCents(host, c.format)) })}</span>
        </div>
      </div>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <ButtonLink href="/account">{tr("View my bookings")}</ButtonLink>
        <ButtonLink href="/explore" variant="secondary">{tr("Keep exploring")}</ButtonLink>
      </div>
    </div>
  );
}
