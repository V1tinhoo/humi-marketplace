"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Gift, MessageCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/site";
import { useT } from "@/i18n/client";

type Rpc = { rpc: (f: string) => PromiseLike<{ data: unknown }> };

/** "Invite friends": personal link, copy / WhatsApp share, and what it has earned so far. */
export function InviteFriends({ className }: { className?: string }) {
  const tr = useT();
  const [info, setInfo] = useState<{ code: string; invited: number; earned: number } | null>(null);
  const [reward, setReward] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient() as unknown as Rpc | null;
    if (!supabase) return;
    supabase.rpc("my_referral").then(({ data }) => {
      const r = (data as { referral_code: string; invited: number; rewarded_cents: number }[] | null)?.[0];
      if (r?.referral_code) setInfo({ code: r.referral_code, invited: Number(r.invited ?? 0), earned: Number(r.rewarded_cents ?? 0) });
    });
    supabase.rpc("promo_settings").then(({ data }) => {
      const p = (data as { referral_bonus_cents: number }[] | null)?.[0];
      setReward(Number(p?.referral_bonus_cents ?? 0));
    });
  }, []);

  if (!info) return null;
  // Always the official address, even when opened on localhost or a vercel.app copy.
  const link = `${SITE_URL}/?ref=${info.code}`;
  const message = tr("Come talk with real people from all over the world on HUMI: {link}", { link });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked: the link is visible to copy by hand */
    }
  };

  return (
    <section className={cn("rounded-[var(--radius-card)] bg-gradient-to-br from-lilac to-blush p-5 sm:p-6", className)}>
      <p className="flex items-center gap-2 font-bold"><Gift className="size-5" /> {tr("Invite friends")}</p>
      <p className="mt-1 text-sm text-plum">
        {reward > 0
          ? tr("For each friend who signs up with your link and makes their first top-up, you get {amount} of call credit.", { amount: formatBRL(reward) })
          : tr("Share HUMI with your friends using your personal link.")}
      </p>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-white p-1.5 pl-3 ring-1 ring-line">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-plum select-all">{link}</span>
        <button onClick={copy} className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold", copied ? "bg-online text-white" : "bg-plum text-white hover:bg-plum-deep")}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? tr("Copied") : tr("Copy")}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <MessageCircle className="size-4" /> {tr("Share on WhatsApp")}
        </a>
        <p className="text-xs text-plum-soft">
          {tr("{n} friends joined", { n: info.invited })}
          {info.earned > 0 && ` · ${tr("{amount} earned", { amount: formatBRL(info.earned) })}`}
        </p>
      </div>
    </section>
  );
}

/** Welcome bonus hint shown before the first top-up. */
export function FirstTopupBonus({ className }: { className?: string }) {
  const tr = useT();
  const [bonus, setBonus] = useState<{ amount: number; min: number } | null>(null);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient() as unknown as Rpc | null;
    if (!supabase) return;
    Promise.all([supabase.rpc("my_first_topup_done"), supabase.rpc("promo_settings")]).then(([done, promo]) => {
      if (done.data === true) return;
      const p = (promo.data as { first_topup_bonus_cents: number; first_topup_bonus_min_cents: number }[] | null)?.[0];
      if (p && Number(p.first_topup_bonus_cents) > 0) setBonus({ amount: Number(p.first_topup_bonus_cents), min: Number(p.first_topup_bonus_min_cents) });
    });
  }, []);
  if (!bonus) return null;
  return (
    <p className={cn("flex items-center gap-2 rounded-xl bg-blush px-3.5 py-2.5 text-sm font-semibold text-plum", className)}>
      <Gift className="size-4 shrink-0 text-[#c2405a]" />
      {tr("First top-up of {min} or more: get {bonus} extra", { min: formatBRL(bonus.min), bonus: formatBRL(bonus.amount) })}
    </p>
  );
}
