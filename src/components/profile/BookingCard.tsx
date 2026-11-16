"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock, Mic, Phone, ShieldCheck, Video, Wallet as WalletIcon } from "lucide-react";
import type { Host, SessionFormat } from "@/types";
import { cn } from "@/lib/utils";
import { Button, buttonClasses } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { useAuth } from "@/lib/auth";
import { useWalletBalance } from "@/lib/wallet";
import { formatBRL, formatDuration, hostPriceCents } from "@/lib/money";
import { useT } from "@/i18n/client";

/**
 * Host profile sidebar: per-minute prices, the visitor's balance, "Call now" (when the host
 * is online) and "Schedule a time". Every amount shown here is informative — the server
 * checks the balance and bills per second during the call.
 */
export function BookingCard({ host }: { host: Host }) {
  const router = useRouter();
  const tr = useT();
  const { user, mode } = useAuth();
  const { balance } = useWalletBalance();
  const [format, setFormat] = useState<SessionFormat>(host.formats[0]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = hostPriceCents(host, format);
  const live = mode === "supabase" && host.dataSource === "supabase";
  const talkSeconds = balance != null && price > 0 ? Math.floor((balance / price) * 60) : null;
  const scheduleHref = `/book/${host.id}?format=${format}&duration=30`;

  const callNow = async () => {
    setError(null);
    if (!user) return router.push(`/login?next=${encodeURIComponent(`/hosts/${host.id}`)}`);
    setStarting(true);
    const res = await fetch("/api/calls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hostId: host.id, callType: format }),
    });
    const j = await res.json().catch(() => ({}));
    setStarting(false);
    if (!res.ok) return setError(j.error ?? "Couldn't start the call.");
    router.push(`/call/${j.callId}`);
  };

  return (
    <>
      <div className="rounded-[var(--radius-card)] bg-white p-6 shadow-soft ring-1 ring-line">
        <p>
          <span className="text-3xl font-extrabold tracking-tight">{formatBRL(price)}</span>
          <span className="text-plum-soft"> {tr("/ minute")}</span>
        </p>
        <p className="mt-1 text-xs text-plum-soft">{tr("Billed per second, only while you're both connected.")}</p>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">{tr("Format")}</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["audio", "video"] as SessionFormat[]).map((f) => {
              const available = host.formats.includes(f);
              const Icon = f === "audio" ? Mic : Video;
              return (
                <button
                  key={f}
                  type="button"
                  disabled={!available}
                  onClick={() => setFormat(f)}
                  aria-pressed={format === f}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-xl py-2.5 text-sm font-semibold capitalize transition",
                    format === f ? "bg-plum text-white" : "bg-cream ring-1 ring-line hover:ring-lavender",
                    !available && "cursor-not-allowed opacity-40",
                  )}
                >
                  <span className="flex items-center gap-1.5"><Icon className="size-4" /> {f === "audio" ? tr("Audio") : tr("Video")}</span>
                  <span className={cn("text-xs font-medium", format === f ? "text-white/80" : "text-plum-soft")}>
                    {available ? `${formatBRL(hostPriceCents(host, f))}/min` : tr("not offered")}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {live && user && (
          <Link href="/wallet" className="mt-5 flex items-center justify-between rounded-xl bg-cream px-3.5 py-3 text-sm ring-1 ring-line transition hover:ring-lavender">
            <span className="flex items-center gap-2 text-plum-soft"><WalletIcon className="size-4" /> {tr("Your balance")}</span>
            <span className="font-semibold">
              {balance == null ? "…" : formatBRL(balance)}
              {talkSeconds != null && <span className="font-normal text-plum-soft"> · ~{formatDuration(talkSeconds)}</span>}
            </span>
          </Link>
        )}

        {live && host.online ? (
          <Button size="lg" className="mt-5 w-full" onClick={callNow} loading={starting}>
            <Phone className="size-4" /> {tr("Call now")}
          </Button>
        ) : (
          <p className="mt-5 rounded-xl bg-cream p-3 text-center text-sm text-plum-soft">
            {live ? tr("{name} is offline right now — schedule a time instead.", { name: host.firstName }) : tr("Calls work once Supabase and video are connected.")}
          </p>
        )}
        <FormError message={error} className="mt-3" />
        {error && /Add at least|balance/i.test(error) && (
          <Link href="/wallet" className={buttonClasses({ variant: "secondary", className: "mt-2 w-full" })}>{tr("Add balance")}</Link>
        )}

        <Link href={scheduleHref} className={buttonClasses({ variant: "secondary", size: "lg", className: "mt-3 w-full" })}>
          <CalendarDays className="size-4" /> {tr("Schedule a time")}
        </Link>
        <p className="mt-2 text-center text-xs text-plum-soft">{tr("Reserving a time is free — you pay per minute during the call.")}</p>

        <ul className="mt-6 space-y-2.5 border-t border-line pt-5 text-sm text-plum-soft">
          {host.responseTime && <li className="flex items-center gap-2.5"><Clock className="size-4 text-plum" /> {tr(host.responseTime)}</li>}
          <li className="flex items-center gap-2.5"><ShieldCheck className="size-4 text-plum" /> {tr("No charge for calls that don't connect")}</li>
        </ul>
      </div>

      {/* Mobile sticky bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-4">
          <p className="text-sm">
            <span className="text-lg font-bold">{formatBRL(price)}</span>
            <span className="text-plum-soft"> /min · {format === "audio" ? tr("Audio") : tr("Video")}</span>
          </p>
          {live && host.online ? (
            <Button size="md" onClick={callNow} loading={starting}><Phone className="size-4" /> {tr("Call now")}</Button>
          ) : (
            <Link href={scheduleHref} className={buttonClasses({ size: "md" })}>{tr("Schedule")}</Link>
          )}
        </div>
      </div>
    </>
  );
}
