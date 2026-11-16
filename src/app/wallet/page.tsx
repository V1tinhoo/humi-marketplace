"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Clock, FlaskConical, Mic, Video, Wallet as WalletIcon } from "lucide-react";
import { RequireAuth } from "@/components/dashboard/RequireAuth";
import { TopupPanel } from "@/components/wallet/TopupPanel";
import { TopupReturn } from "@/components/wallet/TopupReturn";
import { InviteFriends } from "@/components/growth/InviteFriends";
import { Container, DemoNotice, Skeleton } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useWalletBalance } from "@/lib/wallet";
import { formatBRL, formatDuration } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ReportButton } from "@/components/safety/ReportButton";
import type { MyCallRow, TopupStatus, WalletTopupRow, WalletTransactionRow } from "@/types/database";
import { useIntlLocale, useT } from "@/i18n/client";

export default function WalletPage() {
  return (
    <RequireAuth next="/wallet">
      <WalletView />
    </RequireAuth>
  );
}

const TOPUP_STATUS: Record<TopupStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-blush text-plum" },
  approved: { label: "Approved", cls: "bg-online/10 text-online" },
  declined: { label: "Declined", cls: "bg-[#fde8ea] text-[#7a2232]" },
  refunded: { label: "Refunded", cls: "bg-lilac text-plum" },
  canceled: { label: "Canceled", cls: "bg-cream text-plum-soft ring-1 ring-line" },
};

function WalletView() {
  const { user, mode } = useAuth();
  const tr = useT();
  const loc = useIntlLocale();
  const { balance, realBalance, testBalance } = useWalletBalance();
  const supabase = getSupabaseBrowserClient();
  const [tab, setTab] = useState<"activity" | "topups" | "calls">("activity");
  const [tx, setTx] = useState<WalletTransactionRow[] | null>(null);
  const [topups, setTopups] = useState<WalletTopupRow[] | null>(null);
  const [calls, setCalls] = useState<MyCallRow[] | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    const [a, b, c] = await Promise.all([
      supabase.from("wallet_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("wallet_topups").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("my_calls").select("*").eq("i_am_host", false).order("created_at", { ascending: false }).limit(50),
    ]);
    setTx(a.data ?? []);
    setTopups(b.data ?? []);
    setCalls(c.data ?? []);
  }, [supabase, user]);

  useEffect(() => {
    load();
  }, [load, balance]);

  if (mode === "demo") {
    return (
      <Container className="max-w-2xl py-16">
        <DemoNotice>{tr("The wallet needs Supabase. It isn't available in demo mode.")}</DemoNotice>
      </Container>
    );
  }

  const hostName = (callId: string | null) => calls?.find((c) => c.id === callId)?.host_name;
  const anyTest = (tx ?? []).some((t) => !t.livemode) || (topups ?? []).some((t) => !t.livemode);
  // Calls are billed every few seconds; show ONE line per call with its total.
  const activity = (() => {
    if (!tx) return null;
    const out: WalletTransactionRow[] = [];
    const byCall = new Map<string, WalletTransactionRow>();
    for (const t of tx) {
      if (t.kind === "call_charge" && t.reference_id) {
        const g = byCall.get(t.reference_id);
        if (g) g.amount_cents += t.amount_cents; // newest row first, so balance_after stays the final one
        else {
          const row = { ...t };
          byCall.set(t.reference_id, row);
          out.push(row);
        }
      } else out.push(t);
    }
    return out;
  })();

  return (
    <Container className="pb-24 pt-10">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{tr("Wallet")}</h1>
      <p className="mt-1 text-plum-soft">{tr("Add balance once and talk as long as you like. Calls are billed per second.")}</p>
      <TopupReturn />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6">
          <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-lavender via-lilac to-blush p-6 sm:p-8">
            <div aria-hidden className="absolute -right-10 -top-10 size-40 rounded-full border-[24px] border-white/30" />
            <p className="flex items-center gap-2 text-sm font-semibold text-plum"><WalletIcon className="size-4" /> {tr("Available balance")}</p>
            <p className="mt-2 text-4xl font-extrabold tracking-tight text-plum-deep sm:text-5xl">
              {realBalance === null ? <Skeleton className="h-12 w-48" /> : formatBRL(realBalance)}
            </p>
            {!!testBalance && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-plum">
                <FlaskConical className="size-3.5" /> {tr("+ {amount} test balance — not real money", { amount: formatBRL(testBalance) })}
              </p>
            )}
          </div>

          <div>
            <div className="flex gap-1 border-b border-line" role="tablist">
              {([
                ["activity", "Activity"],
                ["calls", "Calls"],
                ["topups", "Top-ups"],
              ] as const).map(([id, label]) => (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                  className={cn("relative px-4 py-3 text-sm font-semibold transition", tab === id ? "text-plum" : "text-plum-soft hover:text-plum")}>
                  {tr(label)}
                  {tab === id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-plum" />}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {tab === "activity" && (
                <List loading={!activity} empty={tr("No activity yet. Add balance to start talking.")}>
                  {(activity ?? []).map((t) => (
                    <li key={t.id} className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-line">
                      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", t.amount_cents > 0 ? "bg-online/10 text-online" : "bg-blush text-plum")}>
                        {t.amount_cents > 0 ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          {t.kind === "call_charge" ? (hostName(t.reference_id) ? tr("Call with {name}", { name: hostName(t.reference_id) }) : tr("Call")) : tr(t.description ?? "")}
                          {!t.livemode && <span className="ml-2 rounded-full bg-lilac px-1.5 py-0.5 text-[10px] font-semibold uppercase">{tr("test")}</span>}
                        </p>
                        <p className="text-xs text-plum-soft">{new Date(t.created_at).toLocaleString(loc, { dateStyle: "medium", timeStyle: "short" })}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn("font-bold", t.amount_cents > 0 ? "text-online" : "text-plum")}>
                          {t.amount_cents > 0 ? "+" : "−"}{formatBRL(Math.abs(t.amount_cents))}
                        </p>
                        <p className="text-xs text-plum-soft">{tr("Balance {amount}", { amount: formatBRL(t.balance_after_cents) })}</p>
                      </div>
                    </li>
                  ))}
                </List>
              )}

              {tab === "calls" && (
                <List loading={!calls} empty={tr("No calls yet.")}>
                  {(calls ?? []).map((c) => {
                    const Icon = c.call_type === "video" ? Video : Mic;
                    return (
                      <li key={c.id} className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-line">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lilac"><Icon className="size-4" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{c.host_name}</p>
                          <p className="flex items-center gap-1.5 text-xs text-plum-soft">
                            <Clock className="size-3" /> {formatDuration(c.billed_seconds)} · {formatBRL(c.price_cents_per_minute)}/min ·{" "}
                            {new Date(c.created_at).toLocaleDateString(loc, { month: "short", day: "numeric" })}
                            {c.status === "failed" && ` · ${tr("didn't connect (not charged)")}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{formatBRL(c.charged_cents)}</p>
                          <ReportButton target={{ callId: c.id }} name={c.host_name} />
                        </div>
                      </li>
                    );
                  })}
                </List>
              )}

              {tab === "topups" && (
                <List loading={!topups} empty={tr("No top-ups yet.")}>
                  {(topups ?? []).map((t) => (
                    <li key={t.id} className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-line">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {formatBRL(t.amount_cents)} <span className="font-normal text-plum-soft">· {t.method === "card" ? tr("Card") : "Pix"}</span>
                          {!t.livemode && <span className="ml-2 rounded-full bg-lilac px-1.5 py-0.5 text-[10px] font-semibold uppercase">{tr("test")}</span>}
                        </p>
                        <p className="text-xs text-plum-soft">
                          {new Date(t.created_at).toLocaleString(loc, { dateStyle: "medium", timeStyle: "short" })}
                          {t.provider_payment_id && <> · ID {t.provider_payment_id.slice(0, 16)}…</>}
                        </p>
                      </div>
                      <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", TOPUP_STATUS[t.status].cls)}>{tr(TOPUP_STATUS[t.status].label)}</span>
                      {t.status === "pending" && (t.provider === "test" || (t.method === "pix" && t.provider.startsWith("mercadopago"))) && (
                        <Link href={t.provider === "test" ? `/wallet/test-checkout/${t.id}` : `/wallet/pix/${t.id}`} className="text-xs font-semibold text-plum underline underline-offset-2">{tr("Continue")}</Link>
                      )}
                    </li>
                  ))}
                </List>
              )}
            </div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[var(--radius-card)] bg-white p-6 shadow-soft ring-1 ring-line">
            <h2 className="text-lg font-bold">{tr("Add balance")}</h2>
            <div className="mt-4"><TopupPanel /></div>
          </div>
          <InviteFriends className="mt-4" />
          {anyTest && (
            <DemoNotice className="mt-4">
              <strong>{tr("Test mode.")}</strong> {tr("Payments are in test mode: top-ups add test balance and no real money is charged.")}
            </DemoNotice>
          )}
        </aside>
      </div>
    </Container>
  );
}

function List({ loading, empty, children }: { loading: boolean; empty: string; children: React.ReactNode }) {
  if (loading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;
  const items = Array.isArray(children) ? children : [children];
  if (items.length === 0) return <p className="rounded-2xl bg-white p-8 text-center text-sm text-plum-soft ring-1 ring-line">{empty}</p>;
  return <ul className="space-y-2">{children}</ul>;
}
