"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Package, Repeat } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { useAuth } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { notifyWalletChanged } from "@/lib/wallet";
import { formatBRL, formatDuration } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { SessionFormat } from "@/types";

export type PackageOffer = {
  tier: number; minutes: number; call_type: SessionFormat; price_cents_per_minute: number;
  discount_bps: number; total_cents: number; full_price_cents: number; validity_days: number;
};
export type MyPackage = {
  id: string; host_id: string; host_name: string; host_photo: string | null; call_type: SessionFormat; tier: number; minutes: number;
  seconds_total: number; seconds_used: number; paid_cents: number; used_cents: number; refunded_cents: number; discount_bps: number;
  status: "active" | "used" | "expired" | "cancelled"; expires_at: string; created_at: string; livemode: boolean;
  subscription_id: string | null; renews: boolean; next_renewal_at: string | null; renewal_stopped_reason: string | null;
};
type Rpc = { rpc: (f: string, a?: object) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
const db = () => getSupabaseBrowserClient() as unknown as Rpc | null;

/**
 * "Minute packages" on a host's profile: buy 60/120/300 minutes with this host at a discount,
 * optionally renewing every month. Calls with the host then use the package first.
 */
export function HostPackages({ hostId, hostName, format, live }: { hostId: string; hostName: string; format: SessionFormat; live: boolean }) {
  const tr = useT();
  const { user } = useAuth();
  const [offers, setOffers] = useState<PackageOffer[]>([]);
  const [mine, setMine] = useState<MyPackage[]>([]);
  const [tier, setTier] = useState(2);
  const [renew, setRenew] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = db();
    if (!supabase) return;
    const { data } = await supabase.rpc("package_offers", { p_host: hostId });
    setOffers((data as PackageOffer[] | null) ?? []);
    if (user) {
      const m = await supabase.rpc("my_packages");
      setMine(((m.data as MyPackage[] | null) ?? []).filter((p) => p.host_id === hostId && p.status === "active"));
    }
  }, [hostId, user]);
  useEffect(() => {
    if (live) load();
  }, [live, load]);

  const list = offers.filter((o) => o.call_type === format).sort((a, b) => a.tier - b.tier);
  if (!live || list.length === 0) return null;
  const chosen = list.find((o) => o.tier === tier) ?? list[0];
  const active = mine.find((p) => p.call_type === format);

  const buy = async () => {
    setError(null);
    setBusy(true);
    const { error: e } = await db()!.rpc("buy_package", { p_host: hostId, p_call_type: format, p_tier: chosen.tier, p_renew_monthly: renew });
    setBusy(false);
    setConfirming(false);
    if (e) return setError(tr(e.message));
    setDone(tr("Package bought! Your next calls with {name} use these minutes first.", { name: hostName }));
    notifyWalletChanged();
    load();
  };

  return (
    <div className="mt-6 rounded-2xl bg-gradient-to-br from-lilac/60 to-blush/60 p-4 ring-1 ring-line">
      <p className="flex items-center gap-2 font-semibold"><Package className="size-4" /> {tr("Minute packages")}</p>
      <p className="mt-0.5 text-xs text-plum-soft">{tr("Cheaper minutes with {name}, valid for {days} days. Unused minutes go back to your wallet.", { name: hostName, days: chosen.validity_days })}</p>

      {active && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-online ring-1 ring-line">
          <CheckCircle2 className="size-4" /> {tr("You have {time} left with {name}", { time: formatDuration(active.seconds_total - active.seconds_used), name: hostName })}
        </p>
      )}

      <div className="mt-3 grid gap-2" role="radiogroup" aria-label={tr("Minute packages")}>
        {list.map((o) => {
          const perMin = Math.round(o.total_cents / o.minutes);
          return (
            <button
              key={o.tier}
              type="button"
              role="radio"
              aria-checked={chosen.tier === o.tier}
              onClick={() => { setTier(o.tier); setConfirming(false); }}
              className={cn("flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition", chosen.tier === o.tier ? "bg-white ring-2 ring-plum" : "bg-white/70 ring-1 ring-line hover:bg-white")}
            >
              <span>
                <span className="font-semibold">{o.minutes} min</span>
                {o.discount_bps > 0 && <span className="ml-2 rounded-full bg-online/10 px-2 py-0.5 text-[11px] font-bold text-online">−{o.discount_bps / 100}%</span>}
                <span className="block text-xs text-plum-soft">{formatBRL(perMin)}/min</span>
              </span>
              <span className="text-right">
                <span className="block font-bold">{formatBRL(o.total_cents)}</span>
                {o.full_price_cents > o.total_cents && <span className="block text-xs text-plum-soft line-through">{formatBRL(o.full_price_cents)}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm">
        <input type="checkbox" checked={renew} onChange={(e) => setRenew(e.target.checked)} className="mt-0.5 size-4 accent-[#493C62]" />
        <span>
          <span className="flex items-center gap-1 font-semibold"><Repeat className="size-3.5" /> {tr("Renew every month")}</span>
          <span className="block text-xs text-plum-soft">{tr("Bought again from your wallet every 30 days. Cancel any time.")}</span>
        </span>
      </label>

      {!user ? (
        <Link href="/login" className={buttonClasses({ className: "mt-3 w-full" })}>{tr("Log in to buy")}</Link>
      ) : confirming ? (
        <div className="mt-3 rounded-xl bg-white p-3 text-sm ring-1 ring-line">
          <p>{tr("Buy {minutes} min with {name} for {total} from your wallet?", { minutes: chosen.minutes, name: hostName, total: formatBRL(chosen.total_cents) })}</p>
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" onClick={buy} loading={busy}>{tr("Yes, buy")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>{tr("Cancel")}</Button>
          </div>
        </div>
      ) : (
        <Button className="mt-3 w-full" onClick={() => { setDone(null); setConfirming(true); }}>
          {tr("Buy package · {total}", { total: formatBRL(chosen.total_cents) })}
        </Button>
      )}
      <FormError message={error} className="mt-2" />
      {error && /Add at least|balance|saldo/i.test(error) && (
        <Link href="/wallet" className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-2 w-full" })}>{tr("Add balance")}</Link>
      )}
      {done && <p role="status" className="mt-2 text-sm font-semibold text-online">{done}</p>}
    </div>
  );
}
