"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Flag, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { useAuth } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { ReportReason } from "@/types/database";
import { blockTarget } from "./BlockButton";
import { useT } from "@/i18n/client";

export type ReportTarget = { callId: string } | { bookingId: string } | { hostId: string };

const REASONS: { id: ReportReason; label: string }[] = [
  { id: "harassment", label: "Harassment or bullying" },
  { id: "inappropriate_content", label: "Inappropriate behaviour" },
  { id: "sexual_content", label: "Sexual content or requests" },
  { id: "hate_speech", label: "Hate speech or discrimination" },
  { id: "spam_or_scam", label: "Spam or scam" },
  { id: "off_platform_payment", label: "Asked to pay or talk outside HUMI" },
  { id: "underage", label: "May be under 18" },
  { id: "safety_concern", label: "I'm worried about someone's safety" },
  { id: "other", label: "Something else" },
];

/**
 * Report someone. The server works out who the other person is from the call,
 * booking or profile, so no user ids are exposed here.
 */
export function ReportDialog({
  target,
  name,
  onClose,
  onReported,
  offerEndCall,
}: {
  target: ReportTarget;
  name: string;
  onClose: () => void;
  /** Called after a successful report; `endCall` is true if the reporter chose to hang up. */
  onReported?: (endCall: boolean) => void;
  offerEndCall?: boolean;
}) {
  const { mode, user } = useAuth();
  const tr = useT();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [endCall, setEndCall] = useState(true);
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  // The page behind doesn't scroll while the dialog is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Esc closes the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (!reason) return setError("Please choose a reason.");
    setError(null);
    setState("sending");
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) {
      setState("idle");
      return setError(mode === "demo" ? "Reports need Supabase (demo mode)." : "Please log in to report.");
    }
    const { error: err } = await supabase.rpc("report_user", {
      p_reason: reason,
      p_details: details.trim() || null,
      p_call_id: "callId" in target ? target.callId : null,
      p_booking_id: "bookingId" in target ? target.bookingId : null,
      p_host_id: "hostId" in target ? target.hostId : null,
    });
    if (err) {
      setState("idle");
      return setError(err.code === "P0001" || err.code === "42501" ? err.message : "Couldn't send the report. Please try again.");
    }
    if (alsoBlock) setBlocked((await blockTarget(target)) === null);
    setState("done");
    onReported?.(offerEndCall ? endCall : false);
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-plum-deep/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="report-title"
        className="relative flex max-h-[92dvh] w-full max-w-md animate-fade-up flex-col overflow-hidden rounded-t-[1.5rem] bg-white text-plum shadow-lift sm:rounded-[1.5rem]"
      >
        {/* Header: always visible, so the dialog can always be closed. */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-6 pb-3 pt-5">
          <div>
            <h2 id="report-title" className="flex items-center gap-2 text-lg font-bold">
              <Flag className="size-4" /> {state === "done" ? tr("Report sent") : tr("Report {name}", { name })}
            </h2>
            {state !== "done" && <p className="mt-0.5 text-sm text-plum-soft">{tr("Reports are confidential. What happened?")}</p>}
          </div>
          <button onClick={onClose} className="-mr-2 grid size-9 shrink-0 place-items-center rounded-full hover:bg-lilac" aria-label={tr("Close")}>
            <X className="size-5" />
          </button>
        </div>

        {state === "done" ? (
          <div className="px-6 py-6 text-center">
            <CheckCircle2 className="mx-auto size-10 text-online" />
            <h3 className="mt-3 text-lg font-bold">{tr("Thanks for telling us")}</h3>
            <p className="mt-1 text-sm text-plum-soft">
              {tr("Our team will review this report. {name} won't be told who reported them. If you're in danger, contact local emergency services.", { name })}
            </p>
            {blocked && <p className="mt-2 text-sm font-semibold">{tr("{name} is blocked: you won't see or hear from each other on HUMI.", { name })}</p>}
            <Button className="mt-5" onClick={onClose}>{tr("Close")}</Button>
          </div>
        ) : (
          <>
            {/* Body: the only part that scrolls. */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
              <div className="grid gap-1.5" role="radiogroup" aria-label={tr("Reason")}>
                {REASONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={reason === r.id}
                    onClick={() => setReason(r.id)}
                    className={cn(
                      "rounded-xl px-3.5 py-2.5 text-left text-sm transition",
                      reason === r.id ? "bg-lilac font-semibold ring-2 ring-lavender" : "bg-cream ring-1 ring-line hover:ring-lavender",
                    )}
                  >
                    {tr(r.label)}
                  </button>
                ))}
              </div>

              <label className="mt-4 block text-sm font-semibold" htmlFor="report-details">{tr("Details (optional)")}</label>
              <textarea
                id="report-details"
                rows={3}
                maxLength={1000}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={tr("Anything that helps us understand")}
                className="mt-1.5 w-full rounded-xl bg-cream p-3 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-lavender"
              />

              <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm">
                <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="size-4 accent-[#493C62]" />
                {tr("Also block {name}", { name })}
              </label>

              {offerEndCall && (
                <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm">
                  <input type="checkbox" checked={endCall} onChange={(e) => setEndCall(e.target.checked)} className="size-4 accent-[#493C62]" />
                  {tr("End the call now")}
                </label>
              )}
            </div>

            {/* Footer: always visible. */}
            <div className="shrink-0 border-t border-line px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
              <FormError message={error} className="mb-3" />
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="h-11 flex-1 rounded-full bg-cream text-[15px] font-semibold ring-1 ring-line hover:bg-lilac">
                  {tr("Cancel")}
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={state === "sending"}
                  className="inline-flex h-11 flex-[2] items-center justify-center gap-2 rounded-full bg-[#c2405a] text-[15px] font-semibold text-white transition hover:bg-[#a3324a] disabled:opacity-60"
                >
                  {state === "sending" && <Loader2 className="size-4 animate-spin" />}
                  {tr("Send report")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
