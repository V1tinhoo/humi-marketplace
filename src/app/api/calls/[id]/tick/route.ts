import { fail, json, requireUser } from "@/lib/api";
import { tickCall } from "@/lib/calls";
import { isLiveKitConfigured } from "@/lib/livekit";
import { isAdminConfigured } from "@/lib/supabase/admin";

/**
 * POST /api/calls/:id/tick — called every few seconds by either participant's call screen.
 * The request carries NO time or amount: the server asks LiveKit whether both are in the room
 * and the database bills from its own clock. Returns the live meter for the UI.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isLiveKitConfigured || !isAdminConfigured) return fail(503, "Calls are not configured yet.");
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return fail(401, "Please log in.");

  const { data: mine } = await supabase.from("my_calls").select("id, i_am_host").eq("id", id).maybeSingle();
  if (!mine) return fail(404, "Call not found.");

  try {
    await tickCall(id);
  } catch (e) {
    return fail(500, "Couldn't update the call.", e);
  }
  // Read back as the user (RLS): the customer sees their balance, the host sees earnings only.
  const { data: call } = await supabase.from("my_calls").select("*").eq("id", id).single();
  // The customer sees the balance this call is paid from (real money, or test balance for test calls).
  let balance: number | null = null;
  if (!mine.i_am_host) {
    const { data: w } = await supabase.from("wallets").select("*").eq("user_id", user.id).maybeSingle();
    const row = (w ?? {}) as { balance_cents?: number; test_balance_cents?: number };
    balance = call?.livemode === false && row.test_balance_cents != null ? row.test_balance_cents : (row.balance_cents ?? 0);
  }
  return json({ call, balanceCents: balance, serverTime: new Date().toISOString() });
}
