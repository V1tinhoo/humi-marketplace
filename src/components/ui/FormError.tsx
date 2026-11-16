"use client";

import { AlertTriangle } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export function FormError({ message, className }: { message?: string | null; className?: string }) {
  const tr = useT();
  if (!message) return null;
  return (
    <div role="alert" className={cn("flex animate-fade-up items-start gap-2.5 rounded-xl bg-[#fde8ea] px-4 py-3 text-sm text-[#7a2232]", className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{tr(message)}</p>
    </div>
  );
}
