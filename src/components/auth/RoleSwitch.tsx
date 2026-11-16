"use client";

import { Sparkles, UserRound } from "lucide-react";
import type { UserRole } from "@/types";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export function RoleSwitch({ value, onChange }: { value: UserRole; onChange: (r: UserRole) => void }) {
  const tr = useT();
  const opts: { id: UserRole; label: string; sub: string; icon: typeof UserRound }[] = [
    { id: "customer", label: tr("I want to connect"), sub: tr("Member"), icon: UserRound },
    { id: "host", label: tr("I want to host"), sub: tr("Host"), icon: Sparkles },
  ];
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-lilac/60 p-1" role="radiogroup" aria-label={tr("Account type")}>
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all",
            value === o.id ? "bg-white shadow-soft" : "hover:bg-white/50",
          )}
        >
          <o.icon className="size-4 shrink-0" />
          <span>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-plum-soft">{o.sub}</span>
            <span className="block text-sm font-semibold leading-tight">{o.label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
