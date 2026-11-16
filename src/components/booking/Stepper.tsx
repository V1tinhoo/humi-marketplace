"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export function Stepper({ steps, current, onJump }: { steps: string[]; current: number; onJump: (i: number) => void }) {
  const tr = useT();
  return (
    <ol className="flex items-center gap-2" aria-label={tr("Booking progress")}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className={cn("flex items-center gap-2", i < steps.length - 1 && "flex-1")}>
            <button
              type="button"
              disabled={!done}
              onClick={() => onJump(i)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full text-sm font-semibold transition",
                done && "cursor-pointer hover:opacity-80",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-all",
                  done && "bg-plum text-white",
                  active && "bg-lavender text-plum-deep ring-4 ring-lilac",
                  !done && !active && "bg-white text-plum-soft ring-1 ring-line",
                )}
              >
                {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn("hidden md:inline", !active && !done && "text-plum-soft")}>{label}</span>
            </button>
            {i < steps.length - 1 && (
              <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-line">
                <span className={cn("block h-full bg-plum transition-all duration-500", done ? "w-full" : "w-0")} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
