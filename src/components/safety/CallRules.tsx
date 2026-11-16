"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";

type Rpc = { rpc: (f: string) => PromiseLike<{ data: unknown; error: unknown }> };

const RULES = [
  "Be respectful. Harassment, insults and discrimination aren't allowed.",
  "No sexual content, nudity or sexual requests — on camera, audio or chat.",
  "Don't ask for or share contacts, payments or meetings outside HUMI.",
  "Calls aren't recorded, and recording someone without consent is forbidden.",
  "Breaking the rules leads to suspension or a permanent ban, and serious cases are reported to the authorities.",
];

/**
 * Community rules shown once, before someone's first call. Acceptance is saved on the account.
 * Usage: const { ensureRules, rulesDialog } = useCallRules(); if (!(await ensureRules())) return;
 */
export function useCallRules() {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const accepted = useRef(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ensureRules = useCallback(async () => {
    if (accepted.current) return true;
    const supabase = getSupabaseBrowserClient() as unknown as Rpc | null;
    if (!supabase) return true;
    const { data, error } = await supabase.rpc("call_rules_accepted");
    // If the check itself fails (e.g. database not updated yet), don't block the call.
    if (error || data === true) {
      accepted.current = !error;
      return true;
    }
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  };

  const accept = async () => {
    setSaving(true);
    const supabase = getSupabaseBrowserClient() as unknown as Rpc | null;
    await supabase?.rpc("accept_call_rules");
    setSaving(false);
    accepted.current = true;
    close(true);
  };

  const rulesDialog = open ? (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-plum-deep/50 backdrop-blur-sm" onClick={() => close(false)} aria-hidden />
      <div role="dialog" aria-modal aria-labelledby="rules-title" className="relative w-full max-w-md animate-fade-up rounded-t-[1.5rem] bg-white p-6 text-plum shadow-lift sm:rounded-[1.5rem]">
        <h2 id="rules-title" className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="size-5" /> {tr("Before your first call")}</h2>
        <p className="mt-1 text-sm text-plum-soft">{tr("HUMI is for friendly, respectful conversations between adults. By continuing you agree to:")}</p>
        <ul className="mt-4 space-y-2 text-sm">
          {RULES.map((r) => (
            <li key={r} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-plum" />{tr(r)}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-plum-soft">
          {tr("Something wrong during a call? Use Report or Block in the ⋮ menu.")}{" "}
          <Link href="/guidelines" target="_blank" className="font-semibold underline underline-offset-2">{tr("Community guidelines")}</Link>
        </p>
        <div className="mt-5 flex gap-2">
          <button onClick={() => close(false)} className="h-11 flex-1 rounded-full bg-cream text-[15px] font-semibold ring-1 ring-line hover:bg-lilac">{tr("Cancel")}</button>
          <button onClick={accept} disabled={saving} className="h-11 flex-[2] rounded-full bg-plum text-[15px] font-semibold text-white hover:bg-plum-deep disabled:opacity-60">{tr("I agree, start the call")}</button>
        </div>
      </div>
    </div>
  ) : null;

  return { ensureRules, rulesDialog };
}
