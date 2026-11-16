import type { BookingStatus } from "@/types/database";
import { cn } from "@/lib/utils";

const STATUS: Record<BookingStatus, { label: string; cls: string }> = {
  pending: { label: "Awaiting confirmation", cls: "bg-blush text-plum" },
  confirmed: { label: "Confirmed", cls: "bg-online/10 text-online" },
  completed: { label: "Completed", cls: "bg-lilac text-plum" },
  cancelled: { label: "Cancelled", cls: "bg-cream text-plum-soft ring-1 ring-line" },
};

export function StatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  const s = STATUS[status];
  return <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", s.cls, className)}>{s.label}</span>;
}

/** Comma-separated text → trimmed, de-duplicated list. */
export const parseList = (v: string, max = 20) =>
  Array.from(new Set(v.split(",").map((x) => x.trim()).filter(Boolean))).slice(0, max);

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-[var(--radius-card)] bg-white px-6 py-12 text-center ring-1 ring-line">
      <p className="font-semibold">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 rounded-full bg-plum px-5 py-2 text-sm font-semibold text-white">
          Try again
        </button>
      )}
    </div>
  );
}
