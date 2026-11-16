"use client";

import { useState } from "react";
import {
  Banknote,
  CalendarClock,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock,
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
import { completedSessions, earningsByWeek, HOST_SHARE, payouts, upcomingBookings } from "@/data/dashboard";
import { reviewsForHost } from "@/data/reviews";
import { Button } from "@/components/ui/Button";
import { DemoNotice } from "@/components/ui/primitives";
import { Field } from "@/components/auth/AuthShell";
import { Toggle } from "@/components/explore/ExploreView";
import { DURATIONS, PLATFORM_LIMITS, cn, formatPrice, sessionPrice } from "@/lib/utils";

type Tab = "overview" | "bookings" | "availability" | "profile" | "pricing" | "reviews" | "payouts";

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "bookings", label: "Bookings", icon: CalendarClock },
  { id: "availability", label: "Availability", icon: CalendarDays },
  { id: "profile", label: "Profile", icon: UserRoundPen },
  { id: "pricing", label: "Pricing", icon: CircleDollarSign },
  { id: "reviews", label: "Reviews", icon: MessageSquareQuote },
  { id: "payouts", label: "Payouts", icon: Banknote },
];

export function HostDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [rate, setRate] = useState(6);
  const [online, setOnline] = useState(true);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8 lg:pt-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-plum-soft">Host dashboard · demo data</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Welcome back, {user!.name.split(" ")[0]}</h1>
        </div>
        <div className="flex items-center gap-3 rounded-full bg-white py-2 pl-4 pr-2 ring-1 ring-line">
          <span className={cn("size-2.5 rounded-full", online ? "bg-online" : "bg-plum-soft/40")} />
          <span className="text-sm font-semibold">{online ? "Accepting sessions" : "Away"}</span>
          <Toggle checked={online} onChange={setOnline} label="Accepting sessions" />
        </div>
      </div>

      <DemoNotice className="mt-6">
        This dashboard is a design concept filled with <strong>sample data</strong>. Earnings, bookings and payouts are illustrative and not connected to any payment system.
      </DemoNotice>

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Dashboard sections" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0 lg:sticky lg:top-24 lg:self-start">
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
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </nav>

        <div key={tab} className="min-w-0 animate-fade-up">
          {tab === "overview" && <Overview rate={rate} />}
          {tab === "bookings" && <Bookings />}
          {tab === "availability" && <Availability />}
          {tab === "profile" && <ProfileEditor />}
          {tab === "pricing" && <Pricing rate={rate} setRate={setRate} />}
          {tab === "reviews" && <Reviews />}
          {tab === "payouts" && <Payouts />}
        </div>
      </div>
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[var(--radius-card)] bg-white p-5 ring-1 ring-line sm:p-6", className)}>
      {title && (
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="font-bold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub: string; icon: LucideIcon; tone: string }) {
  return (
    <div className={cn("rounded-[var(--radius-card)] p-5", tone)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-plum-soft">{label}</p>
        <Icon className="size-4 text-plum" />
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-plum-soft">{sub}</p>
    </div>
  );
}

function Overview({ rate }: { rate: number }) {
  const max = Math.max(...earningsByWeek.map((e) => e.value));
  const month = earningsByWeek.slice(-4).reduce((a, b) => a + b.value, 0);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Earnings (30 days)" value={formatPrice(month)} sub="+18% vs. previous 30 days" icon={TrendingUp} tone="bg-lilac" />
        <Stat label="Completed sessions" value="47" sub="12 this week" icon={Check} tone="bg-blush" />
        <Stat label="Average rating" value="4.9" sub="from 38 reviews" icon={Star} tone="bg-white ring-1 ring-line" />
        <Stat label="Your rate" value={formatPrice(rate)} sub="per 30 min, audio" icon={CircleDollarSign} tone="bg-white ring-1 ring-line" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Weekly earnings" action={<span className="text-xs text-plum-soft">Last 8 weeks · USD</span>}>
          <div className="flex h-56 items-end gap-2 sm:gap-3" role="img" aria-label="Bar chart of weekly earnings over the last 8 weeks">
            {earningsByWeek.map((e, i) => (
              <div key={e.label} className="group flex flex-1 flex-col items-center gap-2">
                <span className="text-[11px] font-semibold text-plum opacity-0 transition group-hover:opacity-100">${e.value}</span>
                <div
                  className={cn("w-full rounded-t-lg transition-all duration-500", i === earningsByWeek.length - 1 ? "bg-plum" : "bg-lavender group-hover:bg-lavender-strong")}
                  style={{ height: `${(e.value / max) * 170}px` }}
                />
                <span className="text-[10px] text-plum-soft sm:text-[11px]">{e.label}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Next up">
          <ul className="space-y-3">
            {upcomingBookings.slice(0, 3).map((b) => (
              <BookingRow key={b.id} b={b} compact />
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function BookingRow({ b, compact }: { b: (typeof upcomingBookings)[number]; compact?: boolean }) {
  const Icon = b.format === "audio" ? Mic : Video;
  return (
    <li className={cn("flex items-center gap-4 rounded-2xl bg-cream p-3.5", !compact && "sm:p-4")}>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white font-bold ring-1 ring-line">{b.guest[0]}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{b.guest} <span className="font-normal text-plum-soft">· {b.country}</span></p>
        <p className="flex items-center gap-1.5 truncate text-xs text-plum-soft">
          <Icon className="size-3.5 shrink-0" /> {b.duration} min · {b.topic}
        </p>
        {compact && <p className="mt-1 text-xs font-semibold text-plum">{b.when}</p>}
      </div>
      {!compact && <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold ring-1 ring-line">{b.when}</span>}
    </li>
  );
}

function Bookings() {
  return (
    <div className="space-y-6">
      <Panel title="Upcoming bookings" action={<span className="text-xs text-plum-soft">{upcomingBookings.length} scheduled</span>}>
        <ul className="space-y-3">
          {upcomingBookings.map((b) => <BookingRow key={b.id} b={b} />)}
        </ul>
      </Panel>
      <Panel title="Completed sessions">
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-plum-soft">
              <tr className="border-b border-line">
                <th className="px-5 py-3 font-semibold sm:px-6">Guest</th>
                <th className="px-3 py-3 font-semibold">Date</th>
                <th className="px-3 py-3 font-semibold">Length</th>
                <th className="px-3 py-3 font-semibold">Rating</th>
                <th className="px-5 py-3 text-right font-semibold sm:px-6">You earned</th>
              </tr>
            </thead>
            <tbody>
              {completedSessions.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3.5 font-semibold sm:px-6">{s.guest} <span className="font-normal text-plum-soft">· {s.country}</span></td>
                  <td className="px-3 py-3.5 text-plum-soft">{s.date}</td>
                  <td className="px-3 py-3.5 text-plum-soft">{s.duration} min</td>
                  <td className="px-3 py-3.5"><span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-plum" />{s.rating}</span></td>
                  <td className="px-5 py-3.5 text-right font-semibold sm:px-6">{formatPrice(s.earned, { cents: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 08:00–22:00

function Availability() {
  const [grid, setGrid] = useState<Set<string>>(
    () => new Set(["0-18", "0-19", "0-20", "1-18", "1-19", "2-18", "2-19", "2-20", "3-19", "4-17", "4-18", "4-19", "5-11", "5-12", "5-15", "6-15", "6-16"]),
  );
  const [saved, setSaved] = useState(false);
  const toggle = (k: string) =>
    setGrid((g) => {
      const n = new Set(g);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      setSaved(false);
      return n;
    });

  return (
    <Panel
      title="Weekly availability"
      action={
        <Button size="sm" onClick={() => setSaved(true)}>
          {saved ? <><Check className="size-4" /> Saved locally</> : "Save"}
        </Button>
      }
    >
      <p className="-mt-2 mb-5 text-sm text-plum-soft">Click a slot to open or close it. Guests can only book open slots. {grid.size} hours open per week.</p>
      <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
        <div className="grid min-w-[560px] grid-cols-[48px_repeat(7,1fr)] gap-1.5 text-xs">
          <span />
          {DAYS.map((d) => <span key={d} className="pb-1 text-center font-semibold text-plum-soft">{d}</span>)}
          {HOURS.map((h) => (
            <div key={h} className="contents">
              <span className="flex items-center text-plum-soft">{String(h).padStart(2, "0")}:00</span>
              {DAYS.map((_, d) => {
                const k = `${d}-${h}`;
                const on = grid.has(k);
                return (
                  <button
                    key={k}
                    onClick={() => toggle(k)}
                    aria-pressed={on}
                    aria-label={`${DAYS[d]} ${h}:00 ${on ? "open" : "closed"}`}
                    className={cn("h-7 rounded-md transition", on ? "bg-lavender hover:bg-lavender-strong" : "bg-cream ring-1 ring-line hover:bg-lilac")}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function ProfileEditor() {
  const { user } = useAuth();
  const [interests, setInterests] = useState(["Gaming", "Movies", "Technology"]);
  const [input, setInput] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <Panel title="Public profile">
      <form
        className="grid gap-5 lg:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(true);
        }}
      >
        <Field label="Display name" name="displayName" defaultValue={user!.name.split(" ")[0]} />
        <Field label="Tagline" name="tagline" defaultValue="Co-op games, bad movie takes, and good laughs." />
        <div className="lg:col-span-2">
          <label htmlFor="bio" className="text-sm font-semibold">About you</label>
          <textarea
            id="bio"
            rows={4}
            defaultValue="I'm a software student who spends way too much time on co-op games and sci-fi movies."
            className="mt-2 w-full rounded-xl bg-white p-4 text-[15px] ring-1 ring-line outline-none focus:ring-2 focus:ring-lavender"
          />
        </div>
        <div className="lg:col-span-2">
          <p className="text-sm font-semibold">Interests</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {interests.map((i) => (
              <button type="button" key={i} onClick={() => setInterests(interests.filter((x) => x !== i))} className="rounded-full bg-blush px-3 py-1.5 text-sm font-medium transition hover:bg-rose" aria-label={`Remove ${i}`}>
                {i} ×
              </button>
            ))}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) {
                  e.preventDefault();
                  if (!interests.includes(input.trim())) setInterests([...interests, input.trim()]);
                  setInput("");
                }
              }}
              placeholder="Add interest + Enter"
              className="h-9 rounded-full bg-cream px-3 text-sm ring-1 ring-line outline-none focus:ring-lavender"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 lg:col-span-2">
          <Button type="submit">{saved ? <><Check className="size-4" /> Saved (demo)</> : "Save profile"}</Button>
          <span className="text-xs text-plum-soft">Changes aren&apos;t published in demo mode.</span>
        </div>
      </form>
    </Panel>
  );
}

function Pricing({ rate, setRate }: { rate: number; setRate: (n: number) => void }) {
  const [video, setVideo] = useState(true);
  return (
    <div className="space-y-6">
      <Panel title="Session pricing">
        <div className="flex items-baseline justify-between">
          <label htmlFor="rate" className="text-sm font-semibold">Base rate · 30 min audio</label>
          <span className="text-3xl font-extrabold">{formatPrice(rate)}</span>
        </div>
        <input
          id="rate"
          type="range"
          min={PLATFORM_LIMITS.minPer30}
          max={PLATFORM_LIMITS.maxPer30}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="mt-4 w-full accent-[#493C62]"
        />
        <div className="mt-1 flex justify-between text-xs text-plum-soft">
          <span>Min {formatPrice(PLATFORM_LIMITS.minPer30)}</span>
          <span>Platform limit {formatPrice(PLATFORM_LIMITS.maxPer30)}</span>
        </div>
        <div className="mt-6 flex items-center justify-between rounded-2xl bg-cream p-4">
          <span>
            <span className="block text-sm font-semibold">Offer video sessions</span>
            <span className="block text-xs text-plum-soft">Video adds $1 per 30 minutes</span>
          </span>
          <Toggle checked={video} onChange={setVideo} label="Offer video sessions" />
        </div>
      </Panel>
      <Panel title="What guests will pay">
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-xs uppercase tracking-wider text-plum-soft">
              <tr className="border-b border-line">
                <th className="px-5 py-3 text-left font-semibold sm:px-6">Duration</th>
                <th className="px-3 py-3 text-right font-semibold">Audio</th>
                <th className="px-3 py-3 text-right font-semibold">Video</th>
                <th className="px-5 py-3 text-right font-semibold sm:px-6">You keep (audio)</th>
              </tr>
            </thead>
            <tbody>
              {DURATIONS.map((d) => {
                const a = sessionPrice(rate, d, "audio");
                return (
                  <tr key={d} className="border-b border-line last:border-0">
                    <td className="px-5 py-3.5 font-semibold sm:px-6"><Clock className="mr-1.5 inline size-3.5" />{d} min</td>
                    <td className="px-3 py-3.5 text-right">{formatPrice(a, { cents: true })}</td>
                    <td className="px-3 py-3.5 text-right">{video ? formatPrice(sessionPrice(rate, d, "video"), { cents: true }) : "—"}</td>
                    <td className="px-5 py-3.5 text-right font-semibold sm:px-6">{formatPrice(a * HOST_SHARE, { cents: true })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-plum-soft">Amounts shown are what you receive.</p>
      </Panel>
    </div>
  );
}

function Reviews() {
  const reviews = reviewsForHost("alex", 6);
  return (
    <Panel title="Recent reviews" action={<span className="inline-flex items-center gap-1 text-sm font-semibold"><Star className="size-4 fill-plum" /> 4.9 average</span>}>
      <ul className="grid gap-3 md:grid-cols-2">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-2xl bg-cream p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{r.author} <span className="font-normal text-plum-soft">· {r.country}</span></p>
              <span className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => <Star key={i} className={i < r.rating ? "size-3 fill-plum text-plum" : "size-3 text-plum/25"} />)}
              </span>
            </div>
            <p className="mt-2 text-sm text-plum">&ldquo;{r.text}&rdquo;</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Payouts() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Available balance" value={formatPrice(96.4, { cents: true })} sub="Next payout: Dec 1 (sample)" icon={Banknote} tone="bg-lilac" />
        <Stat label="Lifetime earnings" value={formatPrice(714.15, { cents: true })} sub="Since joining (sample)" icon={TrendingUp} tone="bg-blush" />
      </div>
      <Panel title="Payout method">
        <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-lavender p-5 sm:flex-row sm:items-center">
          <span className="grid size-11 place-items-center rounded-xl bg-lilac"><Banknote className="size-5" /></span>
          <div className="flex-1">
            <p className="font-semibold">No payout method connected</p>
            <p className="text-sm text-plum-soft">Payouts will be handled by a payment partner with identity verification (e.g. Stripe Connect). Not available in the beta preview.</p>
          </div>
          <Button variant="secondary" disabled>Connect (coming soon)</Button>
        </div>
      </Panel>
      <Panel title="Payout history">
        <ul className="divide-y divide-line">
          {payouts.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-3 text-sm">
              <span>{p.date}</span>
              <span className="text-plum-soft">{p.status}</span>
              <span className="font-semibold">{formatPrice(p.amount, { cents: true })}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
