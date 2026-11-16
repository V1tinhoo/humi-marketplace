"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { notifyWalletChanged } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type State = "checking" | "waiting" | "approved" | "rejected" | "error" | null;

const POLL_MS = 4000;
const MAX_MS = 15 * 60 * 1000; // a Pix can take a few minutes

/**
 * Back from Mercado Pago (/wallet?topup=<id>): asks the server to check the payment
 * and keeps checking while a Pix is still pending. The server reads Mercado Pago's API —
 * this page never decides whether something was paid.
 */
export function TopupReturn() {
  const tr = useT();
  const [state, setState] = useState<State>(null);

  useEffect(() => {
    const topupId = new URLSearchParams(window.location.search).get("topup");
    if (!topupId) return;
    setState("checking");
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();

    const check = async () => {
      const res = await fetch("/api/payments/mercadopago/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topupId }),
      }).catch(() => null);
      if (stopped) return;
      if (!res || res.status === 404) return setState(null); // not a Mercado Pago top-up
      const j = (await res.json().catch(() => ({}))) as { status?: string; rejected?: boolean };
      if (j.status === "approved") {
        setState("approved");
        notifyWalletChanged();
        window.history.replaceState(null, "", "/wallet");
        return;
      }
      if (j.status && j.status !== "pending") return setState("error");
      if (j.rejected) setState("rejected");
      else setState("waiting");
      if (Date.now() - started < MAX_MS) timer = setTimeout(check, POLL_MS);
    };
    check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  if (!state) return null;
  const view = {
    checking: { icon: <Loader2 className="size-5 animate-spin" />, title: "Checking your payment…", text: "This takes a few seconds.", cls: "bg-lilac" },
    waiting: {
      icon: <Clock className="size-5" />,
      title: "Waiting for payment confirmation",
      text: "If you paid with Pix, it usually confirms within a minute. You can leave this page — your balance updates automatically.",
      cls: "bg-blush",
    },
    approved: { icon: <CheckCircle2 className="size-5 text-online" />, title: "Payment confirmed!", text: "The amount was added to your balance.", cls: "bg-online/10" },
    rejected: { icon: <XCircle className="size-5 text-[#a3324a]" />, title: "Payment not approved", text: "Nothing was charged. You can try again with another method.", cls: "bg-[#fde8ea]" },
    error: { icon: <XCircle className="size-5 text-[#a3324a]" />, title: "This top-up wasn't completed", text: "Nothing was added. Start a new top-up if you still want to add balance.", cls: "bg-[#fde8ea]" },
  }[state];

  return (
    <div role="status" className={cn("mt-6 flex items-start gap-3 rounded-2xl p-4 text-plum", view.cls)}>
      <span className="mt-0.5">{view.icon}</span>
      <div>
        <p className="font-semibold">{tr(view.title)}</p>
        <p className="text-sm text-plum-soft">{tr(view.text)}</p>
      </div>
    </div>
  );
}
