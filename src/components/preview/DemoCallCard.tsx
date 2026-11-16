"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Mic, Video } from "lucide-react";
import { FormError } from "@/components/ui/FormError";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, formatDuration } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { DemoSessionRow } from "@/lib/demo";

type Rpc = { rpc: (f: string, a?: object) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

/** "Start Audio Call" / "Start Video Call" for a demo host (idle state of the simulated call). */
export function DemoCallCard({
  hostId, name, audioCents, videoCents, formats, online, balanceCents, callsEnabled,
}: {
  hostId: string; name: string; audioCents: number; videoCents: number | null; formats: ("audio" | "video")[];
  online: boolean; balanceCents: number; callsEnabled: boolean;
}) {
  const tr = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<"audio" | "video" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (type: "audio" | "video") => {
    setError(null);
    setBusy(type);
    const supabase = getSupabaseBrowserClient() as unknown as Rpc | null;
    const res = await supabase?.rpc("demo_call_start", { p_host: hostId, p_call_type: type });
    setBusy(null);
    if (!res || res.error || !res.data) return setError(res?.error?.message ?? "Couldn't start the call.");
    router.push(`/preview/call/${(res.data as DemoSessionRow).id}`);
  };

  const talk = (price: number) => (price > 0 ? Math.floor((balanceCents / price) * 60) : 0);
  const Btn = ({ type, price }: { type: "audio" | "video"; price: number }) => {
    const Icon = type === "audio" ? Mic : Video;
    const offered = formats.includes(type);
    return (
      <button
        onClick={() => start(type)}
        disabled={!offered || !callsEnabled || busy !== null}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45",
          type === "audio" ? "bg-plum text-white hover:bg-plum-deep" : "bg-lilac text-plum hover:bg-lavender",
        )}
      >
        <span className="flex items-center gap-3">
          {busy === type ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
          <span>
            <span className="block font-semibold">{type === "audio" ? tr("Start Audio Call") : tr("Start Video Call")}</span>
            <span className={cn("block text-xs", type === "audio" ? "text-white/75" : "text-plum-soft")}>{offered ? `${formatBRL(price)} ${tr("/ min")}` : tr("not offered")}</span>
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="rounded-[var(--radius-card)] bg-white p-6 shadow-soft ring-1 ring-line">
      <p>
        <span className="text-3xl font-extrabold tracking-tight">{formatBRL(audioCents)}</span>
        <span className="text-plum-soft"> {tr("/ minute")}</span>
      </p>
      <p className="mt-1 text-xs text-plum-soft">{tr("Billed per second, only while you're both connected.")}</p>
      <div className="mt-5 grid gap-2.5">
        <Btn type="audio" price={audioCents} />
        <Btn type="video" price={videoCents ?? audioCents} />
      </div>
      <FormError message={error ? tr(error) : null} className="mt-3" />
      <div className="mt-5 rounded-xl bg-cream p-3.5 text-sm ring-1 ring-line">
        <p className="flex justify-between"><span className="text-plum-soft">{tr("Test balance")}</span> <span className="font-semibold">{formatBRL(balanceCents)}</span></p>
        <p className="mt-1 text-xs text-plum-soft">{tr("About {time} of audio with {name}.", { time: formatDuration(talk(audioCents)), name })}</p>
      </div>
      {!online && <p className="mt-3 text-xs text-plum-soft">{tr("{name} is offline, but in the preview you can still test a call.", { name })}</p>}
      {!callsEnabled && <p className="mt-3 text-xs font-semibold text-[#a3324a]">{tr("Simulated calls are switched off in the admin.")}</p>}
    </div>
  );
}
