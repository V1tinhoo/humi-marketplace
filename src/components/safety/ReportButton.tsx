"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportDialog, type ReportTarget } from "./ReportDialog";
import { useT } from "@/i18n/client";

/**
 * A "Report" trigger + dialog. Variants:
 *  - "link": small text link (lists, summaries)
 *  - "icon": round icon button (profile)
 *  - "overlay": translucent icon button over the call video
 */
export function ReportButton({
  target,
  name,
  variant = "link",
  offerEndCall,
  onReported,
  className,
}: {
  target: ReportTarget;
  name: string;
  variant?: "link" | "icon" | "overlay";
  offerEndCall?: boolean;
  onReported?: (endCall: boolean) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const tr = useT();
  const label = tr("Report {name}", { name });
  return (
    <>
      {variant === "link" ? (
        <button type="button" onClick={() => setOpen(true)} className={cn("inline-flex items-center gap-1 text-xs font-semibold text-plum-soft hover:text-[#a3324a]", className)}>
          <Flag className="size-3" /> {tr("Report")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={label}
          title={label}
          className={cn(
            "grid size-10 place-items-center rounded-full transition",
            variant === "overlay" ? "bg-black/40 text-white backdrop-blur hover:bg-[#c2405a]" : "bg-white text-plum ring-1 ring-line hover:-translate-y-0.5 hover:ring-[#c2405a] hover:text-[#a3324a]",
            className,
          )}
        >
          <Flag className="size-4" />
        </button>
      )}
      {open && <ReportDialog target={target} name={name} offerEndCall={offerEndCall} onReported={onReported} onClose={() => setOpen(false)} />}
    </>
  );
}
