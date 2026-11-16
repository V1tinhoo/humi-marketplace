"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Mic, Phone, PhoneOff, Video } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/money";
import type { MyCallRow } from "@/types/database";
import { useT } from "@/i18n/client";

/** For hosts: shows a ringing call on any page, with Answer / Decline. */
export function IncomingCalls() {
  const { user, mode } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const tr = useT();
  const [ringing, setRinging] = useState<MyCallRow | null>(null);
  const [busy, setBusy] = useState(false);
  const isHost = user?.role === "host" || user?.role === "admin";

  useEffect(() => {
    if (mode !== "supabase" || !isHost) return;
    const supabase = getSupabaseBrowserClient()!;
    const check = async () => {
      const since = new Date(Date.now() - 90_000).toISOString();
      const { data } = await supabase
        .from("my_calls")
        .select("*")
        .eq("i_am_host", true)
        .eq("status", "ringing")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);
      setRinging(data?.[0] ?? null);
    };
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, [mode, isHost]);

  if (!ringing || pathname.startsWith("/call/")) return null;
  const Icon = ringing.call_type === "video" ? Video : Mic;

  const decline = async () => {
    setBusy(true);
    await fetch(`/api/calls/${ringing.id}/end`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decline: true }) });
    setRinging(null);
    setBusy(false);
  };

  return (
    <div role="alertdialog" aria-label={tr("Incoming call")} className="fixed bottom-6 right-4 z-[90] w-[calc(100%-2rem)] max-w-sm animate-fade-up rounded-[1.5rem] bg-white p-5 shadow-lift ring-1 ring-line">
      <div className="flex items-center gap-4">
        <span className="relative grid size-12 place-items-center rounded-full bg-lavender text-plum-deep">
          <span className="absolute inset-0 animate-ping rounded-full bg-lavender/60" />
          <Icon className="relative size-5" />
        </span>
        <div>
          <p className="font-bold">{tr("{name} is calling", { name: ringing.customer_name || tr("Someone") })}</p>
          <p className="text-sm text-plum-soft">
            {ringing.call_type === "video" ? tr("Video") : tr("Audio")} · {formatBRL(ringing.price_cents_per_minute)}/min
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={decline} disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-full bg-cream text-sm font-semibold ring-1 ring-line hover:bg-blush">
          <PhoneOff className="size-4" /> {tr("Decline")}
        </button>
        <button onClick={() => router.push(`/call/${ringing.id}`)} className="flex h-11 items-center justify-center gap-2 rounded-full bg-online text-sm font-semibold text-white hover:opacity-90">
          <Phone className="size-4" /> {tr("Answer")}
        </button>
      </div>
    </div>
  );
}
