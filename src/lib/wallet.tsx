"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const EVENT = "humi:wallet-changed";

/** Tell every balance indicator — in this tab and other tabs/popups — to refresh. */
export const notifyWalletChanged = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
  try {
    const bc = new BroadcastChannel("humi-wallet");
    bc.postMessage("changed");
    bc.close();
  } catch {
    /* BroadcastChannel unsupported */
  }
};

/**
 * A host's earnings (cents): total earned, still pending (holding period) and available.
 * Kept separate from the wallet: earnings are paid out, not spent.
 */
export function useHostEarnings(enabled: boolean) {
  const [earnings, setEarnings] = useState<{ total: number; pending: number; available: number } | null>(null);
  const supabase = getSupabaseBrowserClient();

  const load = useCallback(async () => {
    if (!supabase || !enabled) return;
    const { data } = await supabase.from("my_host_earnings_summary").select("total_earned_cents, pending_cents, available_cents").maybeSingle();
    setEarnings({
      total: Number(data?.total_earned_cents ?? 0),
      pending: Number(data?.pending_cents ?? 0),
      available: Number(data?.available_cents ?? 0),
    });
  }, [supabase, enabled]);

  useEffect(() => {
    if (!enabled) return;
    load();
    const t = setInterval(load, 30_000);
    window.addEventListener(EVENT, load);
    return () => {
      clearInterval(t);
      window.removeEventListener(EVENT, load);
    };
  }, [enabled, load]);

  return earnings;
}

/**
 * The signed-in user's wallet balance (cents), read-only via RLS.
 * Refreshes on demand (notifyWalletChanged) and every 30 s.
 */
export function useWalletBalance() {
  const { user, mode } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const supabase = getSupabaseBrowserClient();

  const load = useCallback(async () => {
    if (!supabase || !user) return setBalance(null);
    const { data } = await supabase.from("wallets").select("balance_cents").eq("user_id", user.id).maybeSingle();
    setBalance(data?.balance_cents ?? 0);
  }, [supabase, user]);

  useEffect(() => {
    if (mode !== "supabase" || !user) return;
    load();
    const t = setInterval(load, 30_000);
    window.addEventListener(EVENT, load);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("humi-wallet");
      bc.onmessage = () => load();
    } catch {
      /* unsupported */
    }
    return () => {
      clearInterval(t);
      window.removeEventListener(EVENT, load);
      bc?.close();
    };
  }, [mode, user, load]);

  return { balance, reload: load };
}
