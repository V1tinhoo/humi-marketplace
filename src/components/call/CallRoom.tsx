"use client";

import "@livekit/components-styles";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  MediaDeviceMenu,
  ParticipantTile,
  RoomAudioRenderer,
  StartAudio,
  isTrackReference,
  useMediaDevices,
  useRoomContext,
  useTrackToggle,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { DisconnectReason, MediaDeviceFailure, Track } from "livekit-client";
import {
  AlertTriangle,
  ChevronUp,
  Flag,
  Info,
  Loader2,
  Maximize,
  MessageSquare,
  Mic,
  MicOff,
  Minimize,
  MonitorUp,
  MoreVertical,
  PhoneOff,
  Plus,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/primitives";
import { TopupPanel } from "@/components/wallet/TopupPanel";
import { ReportButton } from "@/components/safety/ReportButton";
import { ReportDialog } from "@/components/safety/ReportDialog";
import { RateCall } from "@/components/call/RateCall";
import { CallChatPanel, useCallChat } from "@/components/call/CallChat";
import { useT } from "@/i18n/client";
import { formatBRL, formatDuration } from "@/lib/money";
import { notifyWalletChanged } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import type { MyCallRow } from "@/types/database";

const TICK_MS = 10_000;

type Meter = { call: MyCallRow; balanceCents: number | null; at: number };
type Conn = { token: string; url: string; role: "customer" | "host"; call: MyCallRow };

/**
 * Google-Meet-style call screen (LiveKit): the other person large, you in a small window,
 * screen share takes the stage, round controls at the bottom, chat in a side panel.
 * Billing is unchanged: the browser only asks the server to check the room every few seconds.
 */
export function CallRoom({ callId }: { callId: string }) {
  const tr = useT();
  const [conn, setConn] = useState<Conn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meter, setMeter] = useState<Meter | null>(null);

  useEffect(() => {
    fetch(`/api/calls/${callId}/token`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Couldn't join the call.");
        setConn(j);
        setMeter({ call: j.call, balanceCents: null, at: Date.now() });
      })
      .catch((e: Error) => setError(e.message));
  }, [callId]);

  const tick = useCallback(async () => {
    const r = await fetch(`/api/calls/${callId}/tick`, { method: "POST" });
    if (!r.ok) return;
    const j = await r.json();
    setMeter({ call: j.call, balanceCents: j.balanceCents, at: Date.now() });
    notifyWalletChanged();
  }, [callId]);

  useEffect(() => {
    if (!conn) return;
    tick();
    const t = setInterval(tick, TICK_MS);
    return () => clearInterval(t);
  }, [conn, tick]);

  const endCall = useCallback(async () => {
    await fetch(`/api/calls/${callId}/end`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    await tick();
  }, [callId, tick]);

  if (error) {
    return (
      <Container className="max-w-lg py-20 text-center">
        <AlertTriangle className="mx-auto size-8 text-[#a3324a]" />
        <h1 className="mt-4 text-2xl font-bold">{tr(error)}</h1>
        <ButtonLink href="/explore" className="mt-6">{tr("Back to explore")}</ButtonLink>
      </Container>
    );
  }
  if (!conn || !meter) {
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-[#1c1628]">
        <Loader2 className="size-8 animate-spin text-white/60" />
      </div>
    );
  }
  const call = meter.call;
  const isCustomer = conn.role === "customer";
  if (call.status === "ended" || call.status === "failed") return <CallSummary call={call} isCustomer={isCustomer} callId={callId} />;

  return (
    <div className="humi-call fixed inset-0 z-[60] bg-[#1c1628] text-white" data-lk-theme="default">
      <LiveKitRoom
        token={conn.token}
        serverUrl={conn.url}
        connect
        audio
        video={call.call_type === "video"}
        onDisconnected={(reason) => {
          // Hang-up → end the call (bills up to now). Network drops are covered by the server's grace period.
          if (reason === DisconnectReason.CLIENT_INITIATED) endCall();
          else tick();
        }}
        className="h-full"
      >
        <MeetStage callId={callId} conn={conn} meter={meter} endCall={endCall} />
        <RoomAudioRenderer />
        <StartAudio label={tr("Tap to turn on sound")} className="!absolute !left-1/2 !top-1/2 !-translate-x-1/2 !-translate-y-1/2 !z-30 !rounded-full !bg-lavender !px-5 !py-3 !font-semibold !text-plum-deep" />
      </LiveKitRoom>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MeetStage({ callId, conn, meter, endCall }: { callId: string; conn: Conn; meter: Meter; endCall: () => Promise<void> }) {
  const room = useRoomContext();
  const tr = useT();
  const call = meter.call;
  const isCustomer = conn.role === "customer";
  const isVideoCall = call.call_type === "video";
  const otherName = isCustomer ? call.host_name : call.customer_name || tr("Guest");
  const live = call.status === "connected";

  const [now, setNow] = useState(Date.now());
  const [chatOpen, setChatOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [infoPinned, setInfoPinned] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [seenAt, setSeenAt] = useState(() => Date.now());
  const warned = useRef<{ two: boolean; one: boolean }>({ two: false, one: false });

  // The call covers the whole window: no page scrolling underneath.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // ---- media ----
  const notify = (msg: string) => setToast(tr(msg));
  const mic = useTrackToggle({ source: Track.Source.Microphone, onDeviceError: () => notify("We couldn't use your microphone. Check the browser permission.") });
  const cam = useTrackToggle({ source: Track.Source.Camera, onDeviceError: () => notify("No camera found, or permission was denied.") });
  const screen = useTrackToggle({
    source: Track.Source.ScreenShare,
    captureOptions: { audio: true },
    onDeviceError: (e) => {
      if (e?.name !== "NotAllowedError") notify("Screen sharing didn't start.");
    },
  });
  const cameras = useMediaDevices({ kind: "videoinput" });
  const canShareScreen = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
  const canFullscreen = typeof document !== "undefined" && Boolean(document.fullscreenEnabled);

  useEffect(() => {
    const onError = (e: Error) => {
      const failure = MediaDeviceFailure.getFailure(e);
      if (failure === MediaDeviceFailure.NotFound) setToast(tr("No camera or microphone found — you can keep talking with what works."));
      else if (failure === MediaDeviceFailure.PermissionDenied) setToast(tr("Camera or microphone permission was denied in the browser."));
    };
    room.on("mediaDevicesError", onError);
    return () => {
      room.off("mediaDevicesError", onError);
    };
  }, [room, tr]);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const screenShare = tracks.find((t) => isTrackReference(t) && t.source === Track.Source.ScreenShare);
  const localCam = tracks.find((t) => t.participant.isLocal && t.source === Track.Source.Camera);
  const remoteCam = tracks.find((t) => !t.participant.isLocal && t.source === Track.Source.Camera);

  // ---- chat unread ----
  const chat = useCallChat(callId);
  const lastAt = chat.messages.at(-1)?.at ?? 0;
  useEffect(() => {
    if (chatOpen) setSeenAt(Math.max(Date.now(), lastAt));
  }, [chatOpen, lastAt]);
  const unread = chatOpen ? 0 : chat.messages.filter((m) => !m.mine && m.at > seenAt).length;
  useEffect(() => {
    const last = chat.messages.at(-1);
    if (!chatOpen && last && !last.mine && last.at > seenAt) setToast(`${last.name}: ${last.text.slice(0, 80)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.messages.length]);

  // ---- meter (display only; the server's numbers are authoritative) ----
  const sinceTick = live ? Math.min((now - meter.at) / 1000, TICK_MS / 1000 + 5) : 0;
  const seconds = call.billed_seconds + sinceTick;
  const pricePerSec = call.price_cents_per_minute / 60;
  const shownCharged = call.charged_cents + Math.floor(pricePerSec * sinceTick);
  const shownBalance = meter.balanceCents != null ? Math.max(0, meter.balanceCents - Math.floor(pricePerSec * sinceTick)) : null;
  const secondsLeft = shownBalance != null && pricePerSec > 0 ? shownBalance / pricePerSec : null;

  useEffect(() => {
    if (!isCustomer || !live || secondsLeft == null) return;
    if (secondsLeft <= 60 && !warned.current.one) {
      warned.current.one = true;
      setToast(tr("About 1 minute of balance left."));
    } else if (secondsLeft <= 120 && !warned.current.two) {
      warned.current.two = true;
      setToast(tr("About 2 minutes of balance left."));
    }
    if (secondsLeft > 150) warned.current = { two: false, one: false };
  }, [isCustomer, live, secondsLeft, tr]);

  const hangUp = async () => {
    await endCall();
    room.disconnect();
  };

  const toggleCamera = () => {
    if (!isVideoCall) return notify("This is an audio call, so the camera stays off.");
    if (cameras.length === 0) return notify("No camera found. Connect a camera and try again.");
    cam.toggle();
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      notify("Full screen isn't available here.");
    }
    setMoreOpen(false);
  };

  const camOn = isVideoCall && cam.enabled;

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1 gap-3 p-2 sm:p-3">
        {/* Stage */}
        <div className="relative min-w-0 flex-1">
          {screenShare ? (
            <div className="flex h-full flex-col gap-2 lg:flex-row">
              <Tile trackRef={screenShare} className="humi-screen min-h-0 flex-1" />
              <div className="flex shrink-0 gap-2 lg:w-56 lg:flex-col">
                {remoteCam && <Tile trackRef={remoteCam} className="aspect-video w-1/2 lg:w-full" />}
                {localCam && <Tile trackRef={localCam} className="aspect-video w-1/2 lg:w-full" mirror />}
              </div>
            </div>
          ) : remoteCam ? (
            <>
              <Tile trackRef={remoteCam} className="h-full w-full" />
              {localCam && (
                <Tile
                  trackRef={localCam}
                  mirror
                  className="absolute bottom-3 right-3 z-10 aspect-video w-32 shadow-2xl ring-1 ring-white/10 sm:w-56"
                />
              )}
            </>
          ) : (
            <>
              {localCam && <Tile trackRef={localCam} className="h-full w-full" mirror />}
              <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center">
                <Loader2 className="mx-auto size-6 animate-spin text-white/70" />
                <p className="mt-3 text-lg font-semibold">{tr("Waiting for {name} to join…", { name: otherName })}</p>
                <p className="text-sm text-white/60">{tr("Nothing is charged until you're both connected.")}</p>
              </div>
            </>
          )}

          {/* top-left: who */}
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full bg-black/45 py-1.5 pl-2 pr-3.5 text-sm font-medium backdrop-blur">
            <span className={cn("size-2.5 rounded-full", live ? "bg-online" : "animate-pulse bg-white/60")} />
            {live ? otherName : tr("Calling {name}…", { name: otherName })}
          </div>

          {/* top-right: details on hover / tap */}
          <div className="group absolute right-3 top-3 z-20">
            <button
              onClick={() => setInfoPinned((v) => !v)}
              className="grid size-10 place-items-center rounded-full bg-black/45 backdrop-blur transition hover:bg-black/65"
              aria-label={tr("Call details")}
              aria-expanded={infoPinned}
            >
              <Info className="size-4" />
            </button>
            <div
              role="tooltip"
              className={cn(
                "absolute right-0 top-12 w-64 rounded-2xl bg-white p-4 text-plum shadow-lift transition",
                infoPinned ? "visible opacity-100" : "invisible opacity-0 group-hover:visible group-hover:opacity-100",
              )}
            >
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <Item label={tr("Time")} value={formatDuration(seconds)} />
                <Item label={tr("Price")} value={`${formatBRL(call.price_cents_per_minute)}/min`} />
                {isCustomer ? (
                  <>
                    <Item label={tr("Used")} value={formatBRL(shownCharged)} />
                    <Item label={tr("Balance")} value={shownBalance == null ? "…" : formatBRL(shownBalance)} />
                  </>
                ) : (
                  <Item label={tr("You earn")} value={formatBRL(call.host_earnings_cents ?? 0)} />
                )}
              </dl>
              {isCustomer && secondsLeft != null && <p className="mt-2 text-xs text-plum-soft">{tr("About {time} of talk time left", { time: formatDuration(secondsLeft) })}</p>}
            </div>
          </div>
        </div>

        {/* Chat panel: side panel on desktop, full overlay on phones */}
        {chatOpen && (
          <CallChatPanel
            {...chat}
            onClose={() => setChatOpen(false)}
            className="absolute inset-2 z-30 sm:inset-3 lg:static lg:w-[340px] lg:shrink-0"
          />
        )}
      </div>

      {/* Controls */}
      <div className="relative flex shrink-0 items-center justify-center gap-2 px-3 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-1 sm:gap-3">
        <ControlGroup>
          <RoundButton
            label={mic.enabled ? tr("Turn off microphone") : tr("Turn on microphone")}
            active={mic.enabled}
            danger={!mic.enabled}
            onClick={() => mic.toggle()}
            disabled={mic.pending}
          >
            {mic.enabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
          </RoundButton>
          <MediaDeviceMenu kind="audioinput" className="humi-device-menu hidden sm:grid" aria-label={tr("Choose microphone")}>
            <ChevronUp className="size-3.5" />
          </MediaDeviceMenu>
        </ControlGroup>

        <ControlGroup>
          <RoundButton
            label={!isVideoCall ? tr("Camera unavailable in audio calls") : cameras.length === 0 ? tr("No camera found") : camOn ? tr("Turn off camera") : tr("Turn on camera")}
            active={camOn}
            danger={!camOn}
            muted={!isVideoCall || cameras.length === 0}
            onClick={toggleCamera}
            disabled={cam.pending}
          >
            {camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
          </RoundButton>
          {isVideoCall && cameras.length > 0 && (
            <MediaDeviceMenu kind="videoinput" className="humi-device-menu hidden sm:grid" aria-label={tr("Choose camera")}>
              <ChevronUp className="size-3.5" />
            </MediaDeviceMenu>
          )}
        </ControlGroup>

        <RoundButton
          label={!canShareScreen ? tr("Screen sharing isn't supported on this device") : screen.enabled ? tr("Stop presenting") : tr("Present your screen")}
          active={screen.enabled}
          highlight={screen.enabled}
          muted={!canShareScreen}
          onClick={() => (canShareScreen ? screen.toggle() : notify("Screen sharing isn't supported on this device."))}
          disabled={screen.pending}
        >
          <MonitorUp className="size-5" />
        </RoundButton>

        <RoundButton label={tr("Chat")} active={chatOpen} highlight={chatOpen} onClick={() => setChatOpen((v) => !v)} badge={unread}>
          <MessageSquare className="size-5" />
        </RoundButton>

        <div className="relative">
          <RoundButton label={tr("More options")} active={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
            <MoreVertical className="size-5" />
          </RoundButton>
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} aria-hidden />
              <div role="menu" className="absolute bottom-14 left-1/2 z-40 w-60 -translate-x-1/2 rounded-2xl bg-white p-1.5 text-plum shadow-lift">
                {isCustomer && (
                  <MenuItem icon={<Plus className="size-4" />} onClick={() => { setTopupOpen(true); setMoreOpen(false); }}>{tr("Add balance")}</MenuItem>
                )}
                {canFullscreen && (
                  <MenuItem icon={fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />} onClick={toggleFullscreen}>
                    {fullscreen ? tr("Exit full screen") : tr("Full screen")}
                  </MenuItem>
                )}
                <MenuItem icon={<Flag className="size-4" />} danger onClick={() => { setReportOpen(true); setMoreOpen(false); }}>
                  {tr("Report {name}", { name: otherName })}
                </MenuItem>
              </div>
            </>
          )}
        </div>

        <button
          onClick={hangUp}
          className="grid h-12 w-16 place-items-center rounded-full bg-[#d93a55] transition hover:bg-[#c2304a] sm:w-[72px]"
          aria-label={tr("Leave call")}
          title={tr("Leave call")}
        >
          <PhoneOff className="size-5" />
        </button>
      </div>

      {toast && (
        <div role="alert" className="absolute left-1/2 top-16 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 animate-fade-up items-center gap-3 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-plum shadow-lift">
          {toast}
          {isCustomer && /balance|saldo/i.test(toast) && (
            <button onClick={() => setTopupOpen(true)} className="shrink-0 rounded-full bg-lavender px-3 py-1 text-xs font-bold text-plum-deep">{tr("Add balance")}</button>
          )}
        </div>
      )}

      {topupOpen && (
        <div className="absolute inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setTopupOpen(false)} />
          <div role="dialog" aria-modal aria-label={tr("Add balance")} className="relative flex max-h-[92dvh] w-full max-w-md animate-fade-up flex-col overflow-hidden rounded-t-[1.5rem] bg-white text-plum shadow-lift sm:rounded-[1.5rem]">
            <div className="flex shrink-0 items-start justify-between border-b border-line px-6 pb-3 pt-5">
              <div>
                <h2 className="text-lg font-bold">{tr("Add balance")}</h2>
                <p className="text-sm text-plum-soft">{tr("Payment opens in a new window — your call keeps going.")}</p>
              </div>
              <button onClick={() => setTopupOpen(false)} className="-mr-2 grid size-9 place-items-center rounded-full hover:bg-lilac" aria-label={tr("Close")}>
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto px-6 py-4">
              <TopupPanel popup onStarted={() => setTopupOpen(false)} />
            </div>
          </div>
        </div>
      )}

      {reportOpen && (
        <ReportDialog
          target={{ callId }}
          name={otherName}
          offerEndCall
          onClose={() => setReportOpen(false)}
          onReported={(end) => {
            if (end) hangUp();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Tile({ trackRef, className, mirror }: { trackRef: TrackReferenceOrPlaceholder; className?: string; mirror?: boolean }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl bg-[#2d2440]", mirror && "humi-mirror", className)}>
      <ParticipantTile trackRef={trackRef} className="h-full w-full" />
    </div>
  );
}

function ControlGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center rounded-full bg-[#32284a] p-0.5 sm:pr-1">{children}</div>;
}

function RoundButton({
  label,
  children,
  onClick,
  active,
  danger,
  highlight,
  muted,
  disabled,
  badge,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  highlight?: boolean;
  muted?: boolean;
  disabled?: boolean;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "relative grid size-12 place-items-center rounded-full transition disabled:opacity-60",
        highlight ? "bg-lavender text-plum-deep hover:bg-lavender-strong" : danger ? "bg-[#d93a55] hover:bg-[#c2304a]" : "bg-[#3d3258] hover:bg-[#4a3e68]",
        muted && "opacity-55",
      )}
    >
      {children}
      {!!badge && (
        <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-lavender px-1 text-[11px] font-bold text-plum-deep">
          {badge}
        </span>
      )}
    </button>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-blush", danger && "text-[#a3324a]")}>
      {icon}
      {children}
    </button>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-cream px-3 py-2">
      <dt className="text-[11px] text-plum-soft">{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}

const REASONS: Record<string, string> = {
  customer_hangup: "The call was ended by the guest.",
  host_hangup: "The call was ended by the host.",
  insufficient_funds: "The call ended because the balance ran out.",
  dropped: "The connection was lost. Time while disconnected wasn't charged.",
  failed_to_connect: "The call didn't connect, so nothing was charged.",
  declined: "The host couldn't take the call right now. Nothing was charged.",
  room_closed: "The call has ended.",
};

function CallSummary({ call, isCustomer, callId }: { call: MyCallRow; isCustomer: boolean; callId: string }) {
  const tr = useT();
  return (
    <Container className="max-w-md py-16 text-center">
      <h1 className="text-3xl font-extrabold tracking-tight">{tr("Call ended")}</h1>
      <p className="mt-2 text-plum-soft">{tr(REASONS[call.end_reason ?? ""] ?? "The call has ended.")}</p>
      <div className="mt-8 rounded-[var(--radius-card)] bg-white p-6 text-left ring-1 ring-line">
        <Row label={tr("Duration")} value={formatDuration(call.billed_seconds)} />
        {isCustomer ? <Row label={tr("Total")} value={formatBRL(call.charged_cents)} strong /> : <Row label={tr("You earned")} value={formatBRL(call.host_earnings_cents ?? 0)} strong />}
      </div>
      {call.billed_seconds > 0 && call.status === "ended" && (
        <RateCall callId={callId} isCustomer={isCustomer} name={isCustomer ? call.host_name : call.customer_name || tr("your guest")} />
      )}
      <p className="mt-4 text-sm text-plum-soft">
        {tr("Something wrong?")} <ReportButton target={{ callId }} name={isCustomer ? call.host_name : call.customer_name || tr("this guest")} className="text-sm" />
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <ButtonLink href={isCustomer ? "/wallet" : "/dashboard"}>{isCustomer ? tr("View wallet") : tr("Go to dashboard")}</ButtonLink>
        <Link href="/explore" className="inline-flex items-center rounded-full px-5 text-sm font-semibold text-plum-soft hover:text-plum">{tr("Explore")}</Link>
      </div>
    </Container>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between py-1.5 text-sm", strong && "mt-2 border-t border-line pt-3 text-base font-bold")}>
      <span className={strong ? "" : "text-plum-soft"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
