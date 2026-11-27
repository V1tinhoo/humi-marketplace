"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Package, Repeat } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { notifyWalletChanged } from "@/lib/wallet";
import { formatBRL, formatDuration } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useIntlLocale, useT } from "@/i18n/client";
import type { MyPackage } from "./HostPackages";

type Rpc = { rpc: (f: string, a?: object) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
const db = () => getSupabaseBrowserClient() as unknown as Rpc | null;

const STATUS: Record<MyPackage["status"], string> = { active: "Active", used: "Used up", expired: "Expired", cancelled: "Cancelled" };
const STOPPED: Record<string, string> = {
  insufficient_balance: "Renewal stopped: not enough balance in your wallet.",
  host_unavailable: "Renewal stopped: this host isn't available right now.",
  cancelled: "Monthly renewal cancelled.",
};

/** "My packages" on the wallet page: minutes left, renewal and cancel (unused value back to the wallet). */
export function MyPackages({ className }: { className?: string }) {
  const tr = useT();
  const loc = useIntlLocale();
  const [rows, setRows] = useState<MyPackage[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = db();
    if (!supabase) return;
    const { data } = await supabase.rpc("my_packages");
    setRows((data as MyPackage[] | null) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const cancel = async (p: MyPackage) => {
    setConfirm(null);
    const { error } = await db()!.rpc("cancel_package", { p_id: p.id });
    if (error) return setMsg(tr(error.message));
    setMsg(tr("Package cancelled. The unused minutes went back to your wallet."));
    notifyWalletChanged();
    load();
  };
  const toggleRenew = async (p: MyPackage, on: boolean) => {
    const { error } = await db()!.rpc("set_package_renewal", { p_subscription: p.subscription_id, p_active: on });
    if (error) return setMsg(tr(error.message));
    setMsg(on ? tr("Monthly renewal switched on.") : tr("Monthly renewal cancelled."));
    load();
  };

  if (!rows || rows.length === 0) return null;
  const date = (iso: string) => new Date(iso).toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });

  return (
    <section className={cn("rounded-[var(--radius-card)] bg-white p-5 ring-1 ring-line sm:p-6", className)}>
      <h2 className="flex items-center gap-2 font-bold"><Package className="size-4" /> {tr("My minute packages")}</h2>
      {msg && <p role="status" className="mt-2 text-sm font-semibold text-plum">{msg}</p>}
      <ul className="mt-4 space-y-3">
        {rows.map((p) => {
          const left = p.seconds_total - p.seconds_used;
          const pct = Math.round((p.seconds_used / p.seconds_total) * 100);
          return (
            <li key={p.id} className={cn("rounded-2xl p-4 ring-1 ring-line", p.status === "active" ? "bg-cream" : "bg-white opacity-75")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.host_photo ? <img src={p.host_photo} alt="" className="size-10 rounded-full bg-lilac object-cover" /> : <span className="grid size-10 place-items-center rounded-full bg-lilac font-bold">{p.host_name[0]}</span>}
                  <div>
                    <Link href={`/hosts/${p.host_id}`} className="font-semibold hover:underline">{p.host_name}</Link>
                    <p className="text-xs text-plum-soft">{p.minutes} min · {p.call_type === "video" ? tr("Video") : tr("Audio")} · {formatBRL(p.paid_cents)}{!p.livemode && ` · ${tr("test")}`}</p>
                  </div>
                </div>
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", p.status === "active" ? "bg-online/10 text-online" : "bg-lilac")}>{tr(STATUS[p.status])}</span>
              </div>

              {p.status === "active" && (
                <>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white ring-1 ring-line"><div className="h-full bg-lavender" style={{ width: `${pct}%` }} /></div>
                  <p className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-plum-soft">
                    <span><b className="text-plum">{formatDuration(left)}</b> {tr("left")}</span>
                    <span>{tr("Valid until {date}", { date: date(p.expires_at) })}</span>
                  </p>
                </>
              )}
              {p.refunded_cents > 0 && <p className="mt-2 text-xs text-plum-soft">{tr("{amount} returned to your wallet", { amount: formatBRL(p.refunded_cents) })}</p>}

              {p.subscription_id && (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <Repeat className="size-3.5" />
                  {p.renews ? (
                    <>
                      <span>{tr("Renews on {date}", { date: date(p.next_renewal_at!) })}</span>
                      <button onClick={() => toggleRenew(p, false)} className="font-semibold text-plum-soft underline hover:text-plum">{tr("Cancel renewal")}</button>
                    </>
                  ) : (
                    <>
                      <span className="text-plum-soft">{tr(STOPPED[p.renewal_stopped_reason ?? "cancelled"] ?? STOPPED.cancelled)}</span>
                      <button onClick={() => toggleRenew(p, true)} className="font-semibold text-plum underline">{tr("Renew again")}</button>
                    </>
                  )}
                </p>
              )}

              {p.status === "active" && (
                confirm === p.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-blush px-3 py-2 text-xs font-semibold">
                    {tr("Cancel and get {amount} back to your wallet?", { amount: formatBRL(p.paid_cents - p.used_cents) })}
                    <button onClick={() => cancel(p)} className="rounded-full bg-[#c2405a] px-3 py-1 text-white">{tr("Yes, cancel")}</button>
                    <button onClick={() => setConfirm(null)} className="px-2 py-1 text-plum-soft">{tr("Keep it")}</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirm(p.id)} className="mt-3 text-xs font-semibold text-plum-soft underline hover:text-plum">{tr("Cancel package")}</button>
                )
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
