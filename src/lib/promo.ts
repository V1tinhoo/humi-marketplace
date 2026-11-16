import { createSupabasePublicClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type Promo = { firstBonusCents: number; firstBonusMinCents: number; referralBonusCents: number };

/** Current promo numbers (welcome bonus, referral reward) for server-rendered pages. */
export async function getPromo(): Promise<Promo | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = createSupabasePublicClient() as unknown as {
    rpc: (f: string) => Promise<{ data: { first_topup_bonus_cents: number; first_topup_bonus_min_cents: number; referral_bonus_cents: number }[] | null }>;
  };
  let row: { first_topup_bonus_cents: number; first_topup_bonus_min_cents: number; referral_bonus_cents: number } | undefined;
  try {
    row = (await supabase.rpc("promo_settings")).data?.[0];
  } catch {
    return null;
  }
  if (!row) return null;
  return {
    firstBonusCents: Number(row.first_topup_bonus_cents ?? 0),
    firstBonusMinCents: Number(row.first_topup_bonus_min_cents ?? 0),
    referralBonusCents: Number(row.referral_bonus_cents ?? 0),
  };
}
