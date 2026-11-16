"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { CheckCircle2, FlaskConical, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Container, Skeleton } from "@/components/ui/primitives";
import { FormError } from "@/components/ui/FormError";
import { useAuth } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/money";
import { notifyWalletChanged } from "@/lib/wallet";
import type { WalletTopupRow } from "@/types/database";

/**
 * TEST PROVIDER checkout. Stands in for a real provider's hosted payment page.
 * It never changes the balance itself: it asks the server to send the provider's signed webhook.
 */
export default function TestCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const [topup, setTopup] = useState<WalletTopupRow | null | undefined>(undefined);
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) return;
    supabase.from("wallet_topups").select("*").eq("id", id).maybeSingle().then(({ data }) => setTopup(data));
  }, [id, user]);

  const pay = async (outcome: "approve" | "decline") => {
    setBusy(outcome);
    setError(null);
    const res = await fetch("/api/payments/test/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topupId: id, outcome }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(json.error ?? "The test payment failed.");
    setTopup((t) => (t ? { ...t, status: json.status } : t));
    notifyWalletChanged();
  };

  const inPopup = typeof window !== "undefined" && window.name === "humi-topup";

  return (
    <Container className="max-w-md py-12">
      <div className="rounded-[var(--radius-card)] bg-white p-6 shadow-soft ring-1 ring-line">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-lilac px-3 py-1 text-xs font-bold uppercase tracking-wider text-plum">
          <FlaskConical className="size-3.5" /> Test payment
        </p>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Test checkout</h1>
        <p className="mt-1 text-sm text-plum-soft">
          No payment provider is connected yet. This page simulates the provider so you can test the wallet. <strong className="text-plum">No real money is charged</strong> and the balance added is test balance.
        </p>

        {topup === undefined ? (
          <Skeleton className="mt-6 h-24" />
        ) : topup === null ? (
          <p className="mt-6 text-sm">Top-up not found.</p>
        ) : (
          <>
            <div className="mt-6 rounded-2xl bg-cream p-5 text-center">
              <p className="text-sm text-plum-soft">Amount</p>
              <p className="text-4xl font-extrabold">{formatBRL(topup.amount_cents)}</p>
              <p className="mt-1 text-xs text-plum-soft">{topup.method === "card" ? "Card" : "Pix"} · test</p>
            </div>

            {topup.status === "pending" ? (
              <div className="mt-6 grid gap-2">
                <Button size="lg" onClick={() => pay("approve")} loading={busy === "approve"} disabled={busy !== null}>
                  Approve test payment
                </Button>
                <Button size="lg" variant="secondary" onClick={() => pay("decline")} loading={busy === "decline"} disabled={busy !== null}>
                  Decline
                </Button>
              </div>
            ) : (
              <div className="mt-6 flex items-center gap-3 rounded-2xl p-4 ring-1 ring-line">
                {topup.status === "approved" ? <CheckCircle2 className="size-6 text-online" /> : <XCircle className="size-6 text-[#a3324a]" />}
                <p className="font-semibold">
                  {topup.status === "approved" ? `${formatBRL(topup.amount_cents)} added to your balance (test).` : `Payment ${topup.status}. Nothing was added.`}
                </p>
              </div>
            )}
            <FormError message={error} className="mt-4" />
            {topup.status !== "pending" &&
              (inPopup ? (
                <Button variant="secondary" className="mt-4 w-full" onClick={() => window.close()}>Close and return to the call</Button>
              ) : (
                <Link href="/wallet" className="mt-4 block text-center text-sm font-semibold text-plum underline underline-offset-2">Back to wallet</Link>
              ))}
          </>
        )}
      </div>
    </Container>
  );
}
