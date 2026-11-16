"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { Check, CheckCircle2, Clock, Copy, Loader2, QrCode, XCircle } from "lucide-react";
import { Container, Skeleton } from "@/components/ui/primitives";
import { formatBRL } from "@/lib/money";
import { notifyWalletChanged } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type PixInfo = {
  status: string;
  amountCents: number;
  pix: { status: string; qrCode: string | null; qrCodeBase64: string | null; expiresAt: string | null } | null;
};

const POLL_MS = 4000;

/** Pay a top-up with Pix on HUMI: QR code + copy-and-paste code, confirmed automatically. */
export default function PixPage({ params }: { params: Promise<{ topupId: string }> }) {
  const { topupId } = use(params);
  const tr = useT();
  const [info, setInfo] = useState<PixInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await fetch(`/api/payments/mercadopago/pix/${topupId}`, { cache: "no-store" }).catch(() => null);
    if (!res) return;
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setError(j.error ?? "Couldn't load this Pix.");
    setError(null);
    setInfo(j);
    if (j.status === "approved") notifyWalletChanged();
  }, [topupId]);

  const paid = info?.status === "approved";
  const expiresAt = info?.pix?.expiresAt ? new Date(info.pix.expiresAt).getTime() : null;
  const expired = Boolean(!paid && (["expired", "canceled", "cancelled", "failed"].includes(info?.pix?.status ?? "") || (expiresAt && now > expiresAt)));

  useEffect(() => {
    load();
  }, [load]);

  // Keep checking until it's paid or expired.
  useEffect(() => {
    if (paid || expired) return;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load, paid, expired]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const copy = async () => {
    if (!info?.pix?.qrCode) return;
    try {
      await navigator.clipboard.writeText(info.pix.qrCode);
    } catch {
      const el = document.getElementById("pix-code") as HTMLTextAreaElement | null;
      el?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const left = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : null;
  const inPopup = typeof window !== "undefined" && window.opener != null;

  return (
    <Container className="max-w-md py-10">
      <div className="rounded-[var(--radius-card)] bg-white p-6 text-center shadow-soft ring-1 ring-line sm:p-8">
        {error ? (
          <>
            <XCircle className="mx-auto size-10 text-[#a3324a]" />
            <h1 className="mt-3 text-xl font-bold">{tr(error)}</h1>
            <Link href="/wallet" className="mt-5 inline-block font-semibold text-plum underline underline-offset-4">{tr("Back to wallet")}</Link>
          </>
        ) : !info ? (
          <>
            <Skeleton className="mx-auto h-6 w-40" />
            <Skeleton className="mx-auto mt-6 size-56 rounded-2xl" />
            <Skeleton className="mt-6 h-11 w-full rounded-full" />
          </>
        ) : paid ? (
          <>
            <CheckCircle2 className="mx-auto size-12 text-online" />
            <h1 className="mt-3 text-2xl font-extrabold">{tr("Payment confirmed!")}</h1>
            <p className="mt-1 text-plum-soft">{tr("{amount} was added to your balance.", { amount: formatBRL(info.amountCents) })}</p>
            {inPopup ? (
              <button onClick={() => window.close()} className="mt-6 h-11 w-full rounded-full bg-plum font-semibold text-white hover:bg-plum-deep">
                {tr("Close and go back to the call")}
              </button>
            ) : (
              <Link href="/wallet" className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-plum font-semibold text-white hover:bg-plum-deep">
                {tr("Go to wallet")}
              </Link>
            )}
          </>
        ) : expired || !info.pix ? (
          <>
            <Clock className="mx-auto size-10 text-plum-soft" />
            <h1 className="mt-3 text-xl font-bold">{tr("This Pix has expired")}</h1>
            <p className="mt-1 text-sm text-plum-soft">{tr("Nothing was charged. Start a new top-up to get a new code.")}</p>
            <Link href="/wallet" className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-plum font-semibold text-white hover:bg-plum-deep">
              {tr("Back to wallet")}
            </Link>
          </>
        ) : (
          <>
            <p className="flex items-center justify-center gap-2 text-sm font-semibold text-plum-soft"><QrCode className="size-4" /> {tr("Pay with Pix")}</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{formatBRL(info.amountCents)}</h1>

            {info.pix.qrCodeBase64 && (
              // eslint-disable-next-line @next/next/no-img-element -- data URI from Mercado Pago
              <img
                src={`data:image/png;base64,${info.pix.qrCodeBase64}`}
                alt={tr("Pix QR code")}
                className="mx-auto mt-5 size-56 rounded-2xl ring-1 ring-line"
              />
            )}
            <p className="mt-3 text-sm text-plum-soft">{tr("Open your bank app, choose Pix → Pay with QR code and scan it.")}</p>

            <div className="mt-5 text-left">
              <label htmlFor="pix-code" className="text-xs font-semibold text-plum-soft">{tr("Or use Pix Copy and Paste")}</label>
              <textarea
                id="pix-code"
                readOnly
                rows={3}
                value={info.pix.qrCode ?? ""}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-1 w-full resize-none break-all rounded-xl bg-cream p-3 font-mono text-[11px] leading-snug text-plum ring-1 ring-line outline-none"
              />
              <button
                onClick={copy}
                className={cn(
                  "mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full font-semibold transition",
                  copied ? "bg-online text-white" : "bg-plum text-white hover:bg-plum-deep",
                )}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? tr("Code copied") : tr("Copy Pix code")}
              </button>
            </div>

            <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-blush px-3 py-2.5 text-sm text-plum">
              <Loader2 className="size-4 animate-spin" />
              {tr("Waiting for payment")}{left != null && ` · ${tr("expires in {time}", { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` })}`}
            </div>
            <p className="mt-3 text-xs text-plum-soft">{tr("This page updates by itself when the payment is confirmed. Your balance changes only after confirmation.")}</p>
          </>
        )}
      </div>
    </Container>
  );
}
