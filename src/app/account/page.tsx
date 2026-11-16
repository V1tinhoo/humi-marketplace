"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, Check, Compass, Mic, Video } from "lucide-react";
import { RequireAuth } from "@/components/dashboard/RequireAuth";
import { Field } from "@/components/auth/AuthShell";
import { HostPhoto } from "@/components/hosts/HostBits";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Container, DemoNotice } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";
import { cn, formatDate, formatPrice, initials } from "@/lib/utils";
import { LiveAccount } from "@/components/account/LiveAccount";

export default function AccountPage() {
  return (
    <RequireAuth next="/account">
      <AccountSwitch />
    </RequireAuth>
  );
}

function AccountSwitch() {
  const { mode } = useAuth();
  return mode === "supabase" ? <LiveAccount /> : <AccountView />;
}

function AccountView() {
  const { user, bookings, updateUser } = useAuth();
  const [tab, setTab] = useState<"bookings" | "profile">("bookings");
  const [name, setName] = useState(user!.name);
  const [saved, setSaved] = useState(false);
  const now = Date.now();
  const upcoming = bookings.filter((b) => new Date(b.slot).getTime() >= now);
  const past = bookings.filter((b) => new Date(b.slot).getTime() < now);

  return (
    <Container className="pb-24 pt-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <span className="grid size-20 place-items-center rounded-[1.5rem] bg-gradient-to-br from-lavender to-rose text-2xl font-extrabold text-plum-deep">
          {initials(user!.name)}
        </span>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Hi, {user!.name.split(" ")[0]}</h1>
          <p className="mt-1 text-plum-soft">
            {user!.role === "host" ? "Host" : "Member"} account · joined {formatDate(user!.createdAt, { month: "long", year: "numeric" })}
          </p>
        </div>
        {user!.role === "host" && <ButtonLink href="/dashboard" variant="secondary" className="sm:ml-auto">Go to host dashboard</ButtonLink>}
      </div>

      <div className="mt-10 flex gap-1 border-b border-line" role="tablist">
        {(["bookings", "profile"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("relative px-4 py-3 text-sm font-semibold capitalize transition", tab === t ? "text-plum" : "text-plum-soft hover:text-plum")}
          >
            {t === "bookings" ? "My bookings" : "Profile"}
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-plum" />}
          </button>
        ))}
      </div>

      {tab === "bookings" ? (
        <div className="mt-8 animate-fade-up">
          {bookings.length === 0 ? (
            <div className="rounded-[var(--radius-card)] bg-white px-6 py-16 text-center ring-1 ring-line">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-blush"><Compass className="size-7" strokeWidth={1.75} /></span>
              <h2 className="mt-5 text-xl font-bold">No sessions yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-plum-soft">When you book a (demo) session, it&apos;ll show up here. Find someone whose interests match yours.</p>
              <ButtonLink href="/explore" className="mt-6">Explore hosts</ButtonLink>
            </div>
          ) : (
            <div className="space-y-10">
              <BookingList title="Upcoming" items={upcoming} />
              {past.length > 0 && <BookingList title="Past" items={past} />}
            </div>
          )}
          <DemoNotice className="mt-8">Bookings are stored in this browser only. No real sessions are scheduled and no payments were taken.</DemoNotice>
        </div>
      ) : (
        <form
          className="mt-8 max-w-lg animate-fade-up space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            updateUser({ name: name.trim() || user!.name });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
        >
          <Field label="First name" name="name" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Email" name="email" type="email" value={user!.email} readOnly />
          <Button type="submit">{saved ? <><Check className="size-4" /> Saved</> : "Save changes"}</Button>
          <DemoNotice>Profile changes are saved locally in demo mode.</DemoNotice>
        </form>
      )}
    </Container>
  );
}

function BookingList({ title, items }: { title: string; items: ReturnType<typeof useAuth>["bookings"] }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((b) => {
          const d = new Date(b.slot);
          const Icon = b.format === "audio" ? Mic : Video;
          return (
            <li key={b.id} className="flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-line">
              <HostPhoto src={b.hostPhoto} name={b.hostName} sizes="64px" className="size-16 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/hosts/${b.hostId}`} className="font-bold hover:underline">{b.hostName}</Link>
                  <span className="rounded-full bg-lilac px-2 py-0.5 text-[11px] font-semibold">Demo</span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-plum-soft">
                  <Icon className="size-3.5" /> {b.duration} min {b.format}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-plum-soft">
                  <CalendarDays className="size-3.5" />
                  {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, {String(d.getHours()).padStart(2, "0")}:00
                </p>
                <p className="mt-2 text-xs text-plum-soft">Ref {b.id} · {formatPrice(b.total, { cents: true })} (not charged)</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
