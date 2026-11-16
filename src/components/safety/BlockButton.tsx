"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { ReportTarget } from "./ReportDialog";

type Rpc = { rpc: (f: string, a?: object) => PromiseLike<{ error: { message: string; code?: string } | null }> };

/** Blocks the other person of a call / booking, or a host from their profile. The server resolves who. */
export async function blockTarget(target: ReportTarget): Promise<string | null> {
  const supabase = getSupabaseBrowserClient() as unknown as Rpc | null;
  if (!supabase) return "Please log in.";
  const { error } = await supabase.rpc("block_user", {
    p_call_id: "callId" in target ? target.callId : null,
    p_booking_id: "bookingId" in target ? target.bookingId : null,
    p_host_id: "hostId" in target ? target.hostId : null,
  });
  if (!error) return null;
  return error.code === "P0001" || error.code === "42501" ? error.message : "Couldn't block. Please try again.";
}

/**
 * "Block" trigger: after confirming, the person can't call you, book with you or see you
 * (and you don't see them). Variants match ReportButton.
 */
export function BlockButton({
  target,
  name,
  variant = "link",
  onBlocked,
  className,
}: {
  target: ReportTarget;
  name: string;
  variant?: "link" | "icon";
  onBlocked?: () => void;
  className?: string;
}) {
  const tr = useT();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const label = tr("Block {name}", { name });

  const block = async () => {
    if (!confirm(tr("Block {name}? You won't be able to call, book or see each other on HUMI. You can unblock later in your account.", { name }))) return;
    setState("busy");
    const err = await blockTarget(target);
    if (err) {
      setState("idle");
      return alert(tr(err));
    }
    setState("done");
    onBlocked?.();
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={block}
        disabled={state !== "idle"}
        aria-label={label}
        title={state === "done" ? tr("Blocked") : label}
        className={cn("grid size-10 place-items-center rounded-full bg-white text-plum ring-1 ring-line transition hover:-translate-y-0.5 hover:text-[#a3324a] hover:ring-[#c2405a] disabled:opacity-60", className)}
      >
        <Ban className="size-4" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={block}
      disabled={state !== "idle"}
      className={cn("inline-flex items-center gap-1 text-xs font-semibold text-plum-soft hover:text-[#a3324a] disabled:opacity-60", className)}
    >
      <Ban className="size-3" /> {state === "done" ? tr("Blocked") : tr("Block")}
    </button>
  );
}
