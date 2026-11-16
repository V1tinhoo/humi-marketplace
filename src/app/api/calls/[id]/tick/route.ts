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
  const balance = mine.i_am_host
    ? null
    : (await supabase.from("wallets").select("balance_cents").eq("user_id", user.id).maybeSingle()).data?.balance_cents ?? 0;
  return json({ call, balanceCents: balance, serverTime: new Date().toISOString() });
}
