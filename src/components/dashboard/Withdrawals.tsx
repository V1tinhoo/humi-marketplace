"use client";

import { useState } from "react";
import { Banknote, Check, Clock, Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, parseReaisToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useIntlLocale, useT } from "@/i18n/client";
import type { PayoutAccountRow, PayoutRecordRow } from "@/types/database";

const KEY_TYPES = [
  ["cpf", "CPF"],
  ["cnpj", "CNPJ"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["random", "Random key"],
] as const;

/** Database errors → words people understand. */
const friendly = (err: { code?: string; message: string }) =>
  err.code === "PGRST202" || /could not find the function/i.test(err.message)
    ? "Withdrawals aren't switched on yet: the database update for withdrawals hasn't been run."
    : err.message;

const STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: "Requested", cls: "bg-blush text-plum" },
  processing: { label: "Processing", cls: "bg-lilac text-plum" },
  paid: { label: "Paid", cls: "bg-online/10 text-online" },
  failed: { label: "Failed", cls: "bg-[#fde8ea] text-[#7a2232]" },
  canceled: { label: "Canceled", cls: "bg-cream text-plum-soft ring-1 ring-line" },
};

/**
 * Host withdrawals (saque). Only real call earnings past the holding period can be withdrawn;
 * the server checks everything again. Wallet money (top-ups) is never withdrawable.
 */
export function Withdrawals({
  available,
  pending,
  nextReleaseAt,
  holdDays,
  minCents,
  account,
  payouts,
  onChanged,
}: {
  available: number | null;
  /** Real earnings still in the holding period. */
  pending: number | null;
  /** When the next held earnings become withdrawable. */
  nextReleaseAt: string | null;
  holdDays: number;
  minCents: number;
  account: PayoutAccountRow | null;
  payouts: PayoutRecordRow[] | null;
  onChanged: () => void;
}) {
  const tr = useT();
  const loc = useIntlLocale();
  const supabase = getSupabaseBrowserClient()!;
  const [editingKey, setEditingKey] = useState(false);
  const [keyType, setKeyType] = useState<string>(account?.pix_key_type ?? "cpf");
  const [key, setKey] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const hasKey = account?.status === "active" && !!account.provider_account_id;
  const open = (payouts ?? []).find((p) => p.status === "requested" || p.status === "processing");

  const saveKey = async () => {
    setError(null);
    setBusy("key");
    const { error: err } = await supabase.rpc("set_payout_pix_key", { p_key_type: keyType, p_key: key });
    setBusy(null);
    if (err) return setError(friendly(err));
    setEditingKey(false);
    setKey("");
    setNotice(tr("Pix key saved"));
    onChanged();
  };

  const withdraw = async () => {
    setError(null);
    const cents = amount.trim() ? parseReaisToCents(amount) : available;
    if (!cents) return setError(tr("Enter a valid amount, e.g. 35 or 35,50."));
    setBusy("withdraw");
    const { error: err } = await supabase.rpc("request_payout", { p_amount_cents: cents });
    setBusy(null);
    if (err) return setError(friendly(err));
    setAmount("");
    setNotice(tr("Withdrawal requested. You'll receive it by Pix after the HUMI team processes it."));
    onChanged();
  };

  const cancel = async (id: string) => {
    if (!confirm(tr("Cancel this withdrawal? The amount goes back to your available balance."))) return;
    setError(null);
    setBusy(id);
    const { error: err } = await supabase.rpc("cancel_payout", { p_payout_id: id });
    setBusy(null);
    if (err) return setError(friendly(err));
    onChanged();
  };

  const maskedKey = account?.provider_account_id
    ? account.provider_account_id.length > 6
      ? `${account.provider_account_id.slice(0, 3)}•••${account.provider_account_id.slice(-3)}`
      : account.provider_account_id
    : "";

  return (
    <div className="space-y-5">
      {/* Available to withdraw */}
      <div className="flex flex-col gap-4 rounded-2xl bg-lilac/60 p-5 sm:flex-row sm:items-center">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white"><Banknote className="size-5" /></span>
        <div className="flex-1">
          <p className="text-sm text-plum-soft">{tr("Available to withdraw")}</p>
          <p className="text-3xl font-extrabold tracking-tight">{available == null ? "…" : formatBRL(available)}</p>
        </div>
        {hasKey && !open && (
          <div className="flex flex-col gap-2 sm:w-72">
            <div className="flex h-11 items-center rounded-xl bg-white px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-lavender">
              <span className="text-sm font-semibold text-plum-soft">R$</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={available ? (available / 100).toFixed(2).replace(".", ",") : "0,00"}
                aria-label={tr("Amount to withdraw")}
                className="h-full min-w-0 flex-1 bg-transparent px-2 text-[15px] outline-none"
              />
            </div>
            <Button onClick={withdraw} loading={busy === "withdraw"} disabled={!available}>
              {tr("Withdraw")}
            </Button>
          </div>
        )}
      </div>

      {/* Holding period, spelled out */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-line">
          <Clock className="mt-0.5 size-5 shrink-0 text-plum" />
          <div>
            <p className="text-sm text-plum-soft">{tr("On hold")}</p>
            <p className="text-xl font-bold">{pending == null ? "…" : formatBRL(pending)}</p>
            {nextReleaseAt && (
              <p className="text-xs text-plum-soft">
                {tr("Next release: {date}", { date: new Date(nextReleaseAt).toLocaleString(loc, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}
              </p>
            )}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 text-sm ring-1 ring-line">
          <p className="font-semibold">{tr("Holding period: {n} days", { n: holdDays })}</p>
          <p className="mt-1 text-plum-soft">
            {tr("Earnings from each call stay on hold for {n} days after the call (to cover refunds and disputes), then become available to withdraw. Minimum withdrawal: {min}.", { n: holdDays, min: formatBRL(minCents) })}
          </p>
        </div>
      </div>

      <p className="flex items-start gap-2 text-xs text-plum-soft">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {tr("Only earnings from calls paid with real money can be withdrawn, after the holding period. Money added to a wallet can't be withdrawn.")}
      </p>

      {open && (
        <p className="rounded-xl bg-blush px-4 py-3 text-sm">
          {tr("You have a withdrawal of {amount} in progress. You can request another one after it's done.", { amount: formatBRL(open.amount_cents) })}
        </p>
      )}

      {/* Pix key */}
      <div className="rounded-2xl bg-white p-5 ring-1 ring-line">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{tr("Pix key for withdrawals")}</p>
            <p className="text-sm text-plum-soft">
              {hasKey ? `${tr(KEY_TYPES.find(([id]) => id === account?.pix_key_type)?.[1] ?? "Pix")}: ${maskedKey}` : tr("Add the Pix key where you want to receive your earnings.")}
            </p>
          </div>
          {!editingKey && (
            <Button variant="secondary" size="sm" onClick={() => { setEditingKey(true); setNotice(null); }}>
              {hasKey ? tr("Change") : tr("Add Pix key")}
            </Button>
          )}
        </div>
        {editingKey && (
          <div className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr_auto]">
            <select
              value={keyType}
              onChange={(e) => setKeyType(e.target.value)}
              aria-label={tr("Pix key type")}
              className="h-11 cursor-pointer rounded-xl bg-cream px-3 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-lavender"
            >
              {KEY_TYPES.map(([id, label]) => (
                <option key={id} value={id}>{tr(label)}</option>
              ))}
            </select>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={tr("Your Pix key")}
              aria-label={tr("Your Pix key")}
              autoComplete="off"
              className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-lavender"
            />
            <div className="flex gap-2">
              <Button onClick={saveKey} loading={busy === "key"} disabled={key.trim().length < 5}>{tr("Save")}</Button>
              <Button variant="ghost" onClick={() => setEditingKey(false)}>{tr("Cancel")}</Button>
            </div>
          </div>
        )}
      </div>

      <FormError message={error} />
      {notice && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-online/10 px-4 py-3 text-sm text-plum">
          <Check className="size-4 text-online" /> {notice}
        </p>
      )}

      {/* History */}
      {payouts && payouts.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">{tr("Withdrawals")}</p>
          <ul className="divide-y divide-line rounded-2xl bg-white ring-1 ring-line">
            {payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="text-plum-soft">{new Date(p.created_at).toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" })}</span>
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", (STATUS[p.status] ?? STATUS.requested).cls)}>
                  {tr((STATUS[p.status] ?? STATUS.requested).label)}
                </span>
                <span className="font-semibold">{formatBRL(p.amount_cents)}</span>
                {p.status === "requested" && (
                  <button onClick={() => cancel(p.id)} disabled={busy === p.id} className="text-xs font-semibold text-[#a3324a] underline-offset-2 hover:underline">
                    {tr("Cancel")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
