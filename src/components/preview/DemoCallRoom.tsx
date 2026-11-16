"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, FastForward, Loader2, Mic, MicOff, PhoneOff, RefreshCw, Signal, SignalLow, Video, VideoOff, WifiOff, Zap,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, formatDuration } from "@/lib/money";
import { cn } from "@/lib/utils";
import { startRing } from "@/lib/ringtone";
import { useT } from "@/i18n/client";
import { dueCents, pct, splitCents, type DemoHostRow, type DemoSessionRow } from "@/lib/demo";

type Db = {
  rpc: (f: string, a?: object) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => PromiseLike<{ data: unknown }> } } };
};
type Phase = "loading" | "connecting" | "ringing" | "connected" | "reconnecting" | "ended";

const TICK_MS = 5000;
const END_REASONS: Record<string, string> = {
  user_hangup: "You ended the call.",
  insufficient_funds: "The call ended because the test balance ran out.",
  no_answer: "The host didn't answer. Nothing was charged.",
  connection_lost: "The connection was lost. Time while disconnected wasn't charged.",
  cancelled: "The call was cancelled before connecting.",
  abandoned: "The call was closed because it was left open.",
};

/**
 * Simulated call with a demo host (private preview). There is no other person: the host side is
 * an animated avatar clearly marked as simulated. Billing runs in the database on fictional money,
 * with exactly the same rules as real calls (per second, 80% host / 20% HUMI).
 */
export function DemoCallRoom({ sessionId }: { sessionId: string }) {
  const tr = useT();
  const router = useRouter();
  const db = getSupabaseBrowserClient() as unknown as Db | null;
  const [s, setS] = useState<DemoSessionRow | null>(null);
  const [host, setHost] = useState<DemoHostRow | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [lastSync, setLastSync] = useState(() => Date.now());
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [camError, setCamError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const phaseRef = useRef<Phase>("loading");
  phaseRef.current = phase;
  const warned = useRef({ two: false, one: false });

  const apply = useCallback((row: DemoSessionRow) => {
    setS(row);
    setLastSync(Date.now());
    if (row.status === "ended" || row.status === "failed") setPhase("ended");
    else if (row.status === "connected") setPhase("connected");
    else if (row.status === "reconnecting") setPhase("reconnecting");
  }, []);

  const tick = useCallback(async (connected: boolean, extra = 0) => {
    if (!db) return;
    const { data, error: err } = await db.rpc("demo_call_tick", { p_id: sessionId, p_connected: connected, p_extra_seconds: extra });
    if (err) return setError(err.message);
    apply(data as DemoSessionRow);
  }, [db, sessionId, apply]);

  const end = useCallback(async (reason: string) => {
    if (!db) return;
    const { data, error: err } = await db.rpc("demo_call_end", { p_id: sessionId, p_reason: reason });
    if (err) return setError(err.message);
    apply(data as DemoSessionRow);
  }, [db, sessionId, apply]);

  // Load the session and the host.
  useEffect(() => {
    if (!db) return;
    let alive = true;
    (async () => {
      const { data } = await db.from("demo_call_sessions").select("*").eq("id", sessionId).maybeSingle();
      if (!alive) return;
      const row = data as DemoSessionRow | null;
      if (!row) return setError("Test call not found.");
      setS(row);
      if (row.demo_host_id) {
        const h = await db.rpc("preview_host", { p_id: row.demo_host_id });
        if (alive) setHost(((h.data as DemoHostRow[] | null) ?? [])[0] ?? null);
      }
      if (row.status === "ringing") setPhase("connecting");
      else apply(row);
    })();
    return () => {
      alive = false;
    };
  }, [db, sessionId, apply]);

  // Connecting → ringing → connected (the host "answers" after a few seconds).
  useEffect(() => {
    if (phase === "connecting") {
      const t = setTimeout(() => setPhase("ringing"), 1400);
      return () => clearTimeout(t);
    }
    if (phase === "ringing") {
      const stop = startRing("ringback");
      const t = setTimeout(() => tick(true), 3500);
      return () => {
        stop();
        clearTimeout(t);
      };
    }
  }, [phase, tick]);

  // Server billing tick while the call is live (also keeps "reconnecting" fresh).
  useEffect(() => {
    if (phase !== "connected" && phase !== "reconnecting") return;
    const id = setInterval(() => tick(phaseRef.current === "connected"), TICK_MS);
    return () => clearInterval(id);
  }, [phase, tick]);

  // Smooth clock for the live counters.
  useEffect(() => {
    if (phase !== "connected") return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [phase]);

  // Local camera / microphone (with permission). Nothing is sent anywhere.
  useEffect(() => {
    if (!s || phase === "ended" || phase === "loading" || streamRef.current) return;
    const video = s.call_type === "video";
    navigator.mediaDevices?.getUserMedia({ audio: true, video })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCamError(video ? "Camera or microphone blocked. Allow access in the browser to see yourself." : "Microphone blocked. The call still works as a simulation."));
  }, [s, phase]);
  useEffect(() => {
    if (phase !== "ended") return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [phase]);
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);
  useEffect(() => {
    if (videoRef.current && streamRef.current && !videoRef.current.srcObject) videoRef.current.srcObject = streamRef.current;
  });

  const toggleMic = () => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !micOn));
    setMicOn(!micOn);
  };
  const toggleCam = () => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !camOn));
    setCamOn(!camOn);
  };

  // Live numbers: server totals + the seconds since the last server tick (same formula as the database).
  const sinceSync = phase === "connected" ? Math.min(Math.max(0, Math.floor((now - lastSync) / 1000)), 30) : 0;
  const seconds = (s?.billed_seconds ?? 0) + sinceSync;
  const price = s?.price_cents_per_minute ?? 0;
  const bps = s?.commission_bps ?? 2000;
  const charged = s ? Math.min(Math.max(s.charged_cents, dueCents(price, seconds)), s.start_balance_cents) : 0;
  const { host: hostPart, platform } = splitCents(charged, bps);
  const balanceLeft = s ? Math.max(0, s.start_balance_cents - charged) : 0;
  const secondsLeft = price > 0 ? Math.floor((balanceLeft / price) * 60) : 0;

  useEffect(() => {
    if (phase !== "connected") return;
    if (secondsLeft <= 60 && !warned.current.one) {
      warned.current.one = true;
      setToast(tr("Less than 1 minute of test balance left."));
    } else if (secondsLeft <= 120 && !warned.current.two) {
      warned.current.two = true;
      setToast(tr("About 2 minutes of test balance left."));
    }
  }, [phase, secondsLeft, tr]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (error && !s) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6 text-center">
        <div><p className="font-semibold">{tr(error)}</p><Link href="/preview/explore" className="mt-4 inline-block text-sm font-semibold underline">{tr("Back to explore")}</Link></div>
      </div>
    );
  }
  if (!s || phase === "loading") return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-plum-soft" /></div>;

  const name = host?.display_name ?? s.host_name;
  const photo = host?.photo_url ?? "";
  const isVideo = s.call_type === "video";

  if (phase === "ended") return <EndedSummary s={s} name={name} hostId={s.demo_host_id} onAgain={() => router.push(s.demo_host_id ? `/preview/hosts/${s.demo_host_id}` : "/preview/explore")} />;

  const statusLabel: Record<Phase, string> = {
    loading: "", connecting: tr("Connecting…"), ringing: tr("Ringing…"), connected: tr("Connected"), reconnecting: tr("Reconnecting…"), ended: "",
  };

  return (
    <div className="humi-call relative flex min-h-[calc(100dvh-7rem)] flex-col bg-[#1f1830] text-white">
      {/* Top: who, status, money */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo ? <img src={photo} alt="" className="size-10 rounded-full bg-lilac" /> : <span className="grid size-10 place-items-center rounded-full bg-lilac font-bold text-plum">{name[0]}</span>}
          <div className="min-w-0">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-xs text-white/60">{(host?.languages ?? []).map((l) => tr(l)).join(" · ")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
            phase === "connected" ? "bg-online/20 text-[#7be0b1]" : phase === "reconnecting" ? "bg-[#c2405a]/25 text-[#ffb3c1]" : "bg-white/10 text-white/80")}>
            {phase === "connected" ? <Signal className="size-3.5" /> : phase === "reconnecting" ? <WifiOff className="size-3.5" /> : <SignalLow className="size-3.5" />}
            {statusLabel[phase]}
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-xs">{formatDuration(seconds)}</span>
        </div>
      </div>

      {/* Stage */}
      <div className="relative mx-4 flex flex-1 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-[#3a2f55] to-[#251d38] sm:mx-6">
        <SimulatedHost name={name} photo={photo} phase={phase} />
        <span className="absolute left-4 top-4 rounded-full bg-black/35 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/80 backdrop-blur">
          {tr("Simulated host · test environment")}
        </span>
        {/* Self view */}
        {isVideo && (
          <div className="absolute bottom-4 right-4 aspect-[3/4] w-28 overflow-hidden rounded-2xl bg-black/40 ring-2 ring-white/20 sm:w-40">
            {camOn && !camError ? <video ref={videoRef} autoPlay muted playsInline className="size-full -scale-x-100 object-cover" /> : (
              <div className="grid size-full place-items-center text-center text-[11px] text-white/70"><VideoOff className="mb-1 size-5" />{camError ? tr("Camera unavailable") : tr("Camera off")}</div>
            )}
          </div>
        )}
        {phase === "reconnecting" && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-[#c2405a]/85 py-2 text-sm font-semibold">
            <RefreshCw className="size-4 animate-spin" /> {tr("Connection lost. Trying to reconnect… (not charged)")}
          </div>
        )}
      </div>

      {/* Money + test controls */}
      <div className="mx-4 mt-3 grid gap-3 sm:mx-6 lg:grid-cols-[1fr_auto]">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.06] p-3 text-sm sm:grid-cols-5">
          <Stat label={tr("Price")} value={`${formatBRL(price)}/min`} />
          <Stat label={tr("Spent (simulated)")} value={formatBRL(charged)} strong />
          <Stat label={tr("Host {pct}", { pct: pct(10000 - bps) })} value={formatBRL(hostPart)} />
          <Stat label={tr("HUMI {pct}", { pct: pct(bps) })} value={formatBRL(platform)} />
          <Stat label={tr("Test balance")} value={formatBRL(balanceLeft)} warn={phase === "connected" && secondsLeft <= 120} />
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/[0.06] p-2 text-xs font-semibold">
          <span className="px-1 text-white/50">{tr("Test")}</span>
          {phase === "ringing" && <TestBtn onClick={() => end("no_answer")} icon={<PhoneOff className="size-3.5" />}>{tr("No answer")}</TestBtn>}
          {phase === "connected" && (
            <>
              <TestBtn onClick={() => tick(true, 60)} icon={<FastForward className="size-3.5" />}>+1 min</TestBtn>
              <TestBtn onClick={() => tick(true, 600)} icon={<FastForward className="size-3.5" />}>+10 min</TestBtn>
              <TestBtn onClick={() => tick(false)} icon={<WifiOff className="size-3.5" />}>{tr("Drop connection")}</TestBtn>
            </>
          )}
          {phase === "reconnecting" && (
            <>
              <TestBtn onClick={() => tick(true)} icon={<Zap className="size-3.5" />}>{tr("Reconnect")}</TestBtn>
              <TestBtn onClick={() => end("connection_lost")} icon={<AlertTriangle className="size-3.5" />}>{tr("Fail for good")}</TestBtn>
            </>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 px-4 py-5">
        <RoundBtn label={micOn ? tr("Mute") : tr("Unmute")} active={!micOn} onClick={toggleMic}>{micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}</RoundBtn>
        {isVideo && <RoundBtn label={camOn ? tr("Turn camera off") : tr("Turn camera on")} active={!camOn} onClick={toggleCam}>{camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}</RoundBtn>}
        <button
          onClick={() => end(phase === "connected" || phase === "reconnecting" ? "user_hangup" : "cancelled")}
          className="grid h-12 w-16 place-items-center rounded-full bg-[#d93a55] transition hover:bg-[#c2304a] sm:w-[72px]"
          aria-label={tr("Leave call")}
          title={tr("Leave call")}
        >
          <PhoneOff className="size-5" />
        </button>
      </div>

      {(toast || camError || error) && (
        <div role="alert" className="absolute left-1/2 top-16 z-40 max-w-[calc(100%-2rem)] -translate-x-1/2 animate-fade-up rounded-full bg-white px-4 py-2.5 text-sm font-medium text-plum shadow-lift">
          {toast ?? tr(error ?? camError ?? "")}
        </div>
      )}
    </div>
  );
}

/** Animated avatar standing in for the host (never presented as a live video). */
function SimulatedHost({ name, photo, phase }: { name: string; photo: string; phase: Phase }) {
  const talking = phase === "connected";
  return (
    <div className="flex flex-col items-center gap-5 py-10">
      <div className="relative grid place-items-center">
        {(phase === "ringing" || talking) && (
          <>
            <span className={cn("absolute size-44 rounded-full bg-lavender/25", phase === "ringing" ? "animate-ping" : "humi-breathe")} />
            <span className="absolute size-56 rounded-full border border-white/10" />
          </>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo ? <img src={photo} alt="" className={cn("relative size-36 rounded-full bg-lilac ring-4 ring-white/20", phase === "reconnecting" && "opacity-50 grayscale")} />
          : <span className="relative grid size-36 place-items-center rounded-full bg-lilac text-5xl font-extrabold text-plum">{name[0]}</span>}
      </div>
      <p className="text-xl font-bold">{name}</p>
      {talking ? (
        <div className="humi-wave flex h-6 items-end gap-1" aria-hidden>
          {Array.from({ length: 7 }).map((_, i) => <span key={i} style={{ animationDelay: `${i * 110}ms` }} className="w-1.5 rounded-full bg-rose" />)}
        </div>
      ) : (
        <p className="text-sm text-white/60">{phase === "connecting" ? "…" : phase === "ringing" ? "♪" : ""}</p>
      )}
    </div>
  );
}

function EndedSummary({ s, name, hostId, onAgain }: { s: DemoSessionRow; name: string; hostId: string | null; onAgain: () => void }) {
  const tr = useT();
  const bps = s.commission_bps;
  return (
    <div className="mx-auto max-w-md px-4 py-14 text-center">
      <h1 className="text-3xl font-extrabold tracking-tight">{tr("Test call ended")}</h1>
      <p className="mt-2 text-plum-soft">{tr(END_REASONS[s.end_reason ?? ""] ?? "The call has ended.")}</p>
      <div className="mt-8 rounded-[var(--radius-card)] bg-white p-6 text-left ring-1 ring-line">
        <Row label={tr("Host")} value={name} />
        <Row label={tr("Type")} value={s.call_type === "video" ? tr("Video") : tr("Audio")} />
        <Row label={tr("Duration")} value={formatDuration(s.billed_seconds)} />
        <Row label={tr("Price")} value={`${formatBRL(s.price_cents_per_minute)}/min`} />
        <Row label={tr("Spent (simulated)")} value={formatBRL(s.charged_cents)} strong />
        <div className="my-3 border-t border-line" />
        <Row label={tr("Host earnings ({pct})", { pct: pct(10000 - bps) })} value={formatBRL(s.host_cents)} />
        <Row label={tr("HUMI commission ({pct})", { pct: pct(bps) })} value={formatBRL(s.platform_cents)} />
        <p className="mt-3 text-xs text-plum-soft">{tr("Simulation only: no real money was charged or paid.")}</p>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button onClick={onAgain} className="rounded-full bg-plum px-5 py-2.5 text-sm font-semibold text-white hover:bg-plum-deep">{tr("Call again")}</button>
        <Link href="/preview/history" className="rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-line hover:bg-lilac">{tr("Test calls")}</Link>
        {hostId && <Link href={`/preview/hosts/${hostId}`} className="inline-flex items-center gap-1 rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-line hover:bg-lilac"><ArrowLeft className="size-4" /> {tr("Profile")}</Link>}
      </div>
    </div>
  );
}

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <p className="flex justify-between py-1 text-sm"><span className="text-plum-soft">{label}</span><span className={strong ? "font-bold" : "font-semibold"}>{value}</span></p>
);
const Stat = ({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) => (
  <div className="min-w-0">
    <p className="truncate text-[11px] text-white/55">{label}</p>
    <p className={cn("truncate font-mono", strong ? "text-base font-bold" : "font-semibold", warn && "text-[#ffb3c1]")}>{value}</p>
  </div>
);
const TestBtn = ({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) => (
  <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 hover:bg-white/20">{icon}{children}</button>
);
const RoundBtn = ({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} aria-label={label} title={label} className={cn("grid size-12 place-items-center rounded-full transition", active ? "bg-white text-plum" : "bg-white/12 hover:bg-white/20")}>
    {children}
  </button>
);
