"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, QrCode } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, parseReaisToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const PRESETS = [2000, 5000, 10000, 20000];

/**
 * Choose an amount and start a top-up. The balance changes only after the payment
 * provider confirms (webhook). `popup` opens checkout in a new window (used mid-call).
 */
export function TopupPanel({ popup = false, onStarted }: { popup?: boolean; onStarted?: () => void }) {
  const router = useRouter();
  const tr = useT();
  const [amount, setAmount] = useState(5000);
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState<"pix" | "card">("pix");
  const [limits, setLimits] = useState({ min: 1000, max: 100000 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Limits live in the backend (platform_settings), not in this file.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase
      ?.from("platform_settings")
      .select("key, value")
      .in("key", ["topup_min_cents", "topup_max_cents"])
      .then(({ data }) => {
        const m = Object.fromEntries((data ?? []).map((r) => [r.key, Number(r.value)]));
        if (m.topup_min_cents && m.topup_max_cents) setLimits({ min: m.topup_min_cents, max: m.topup_max_cents });
      });
  }, []);

  const customCents = custom ? parseReaisToCents(custom) : null;
  const value = custom ? customCents : amount;

  const start = async () => {
    setError(null);
    if (!value) return setError(tr("Enter a valid amount, e.g. 35 or 35,50."));
    if (value < limits.min || value > limits.max) return setError(tr("Choose between {min} and {max}.", { min: formatBRL(limits.min), max: formatBRL(limits.max) }));
    setLoading(true);
    // Open the window synchronously (inside the click) so pop-up blockers allow it.
    const win = popup ? window.open("about:blank", "humi-topup", "width=480,height=720") : null;
    const res = await fetch("/api/wallet/topups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountCents: value, method }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      win?.close();
      return setError(json.error ?? "Couldn't start the top-up.");
    }
    onStarted?.();
    if (win) win.location.href = json.checkoutUrl;
    else router.push(json.checkoutUrl);
  };

  return (
    <div>
      <p className="text-sm font-semibold">{tr("How much?")}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setAmount(p);
              setCustom("");
            }}
            aria-pressed={!custom && amount === p}
            className={cn(
              "rounded-xl py-3 text-[15px] font-bold transition",
              !custom && amount === p ? "bg-plum text-white" : "bg-cream ring-1 ring-line hover:ring-lavender",
            )}
          >
            {formatBRL(p)}
          </button>
        ))}
      </div>
      <label className="mt-3 block">
        <span className="text-xs font-medium text-plum-soft">{tr("Or another amount ({min} – {max})", { min: formatBRL(limits.min), max: formatBRL(limits.max) })}</span>
        <div className="mt-1 flex h-11 items-center rounded-xl bg-white px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-lavender">
          <span className="text-sm font-semibold text-plum-soft">R$</span>
          <input
            inputMode="decimal"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="0,00"
            className="h-full flex-1 bg-transparent px-2 text-[15px] outline-none"
            aria-label={tr("Custom amount in reais")}
          />
        </div>
      </label>

      <p className="mt-4 text-sm font-semibold">{tr("Pay with")}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {([
          ["pix", "Pix", QrCode],
          ["card", "Card", CreditCard],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMethod(id)}
            aria-pressed={method === id}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition",
              method === id ? "bg-lilac ring-2 ring-lavender" : "bg-cream ring-1 ring-line hover:ring-lavender",
            )}
          >
            <Icon className="size-4" /> {tr(label)}
          </button>
        ))}
      </div>

      <FormError message={error} className="mt-3" />
      <Button size="lg" className="mt-4 w-full" onClick={start} loading={loading} disabled={!value}>
        {tr("Add {amount}", { amount: value ? formatBRL(value) : "" })}
      </Button>
      <p className="mt-2 text-center text-xs text-plum-soft">{tr("Your balance is updated only after the payment is confirmed. HUMI never stores card details.")}</p>
    </div>
  );
}
