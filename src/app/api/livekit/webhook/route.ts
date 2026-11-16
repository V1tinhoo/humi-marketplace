import { fail, json } from "@/lib/api";
import { isLiveKitConfigured, webhookReceiver } from "@/lib/livekit";
import { createSupabaseAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { endCall, tickCall } from "@/lib/calls";

/**
 * POST /api/livekit/webhook — LiveKit Cloud → HUMI (configure in the LiveKit dashboard).
 * Signature-verified. Reacts immediately to joins/leaves/room end so billing starts and
 * stops at the right moment even between client ticks. Safe to receive twice.
 */
export async function POST(request: Request) {
  if (!isLiveKitConfigured || !isAdminConfigured) return fail(503, "Not configured.");
  const body = await request.text();
  let event;
  try {
    event = await webhookReceiver().receive(body, request.headers.get("authorization") ?? undefined);
  } catch {
    return fail(401, "Invalid signature.");
  }
  const room = event.room?.name;
  if (!room) return json({ ok: true });

  const admin = createSupabaseAdminClient();
  const { data: call } = await admin.from("call_sessions").select("id, status").eq("room_name", room).maybeSingle();
  if (!call || call.status === "ended" || call.status === "failed") return json({ ok: true });

  try {
    if (event.event === "room_finished") await endCall(call.id, "room_closed");
    else if (event.event === "participant_joined" || event.event === "participant_left") await tickCall(call.id);
  } catch (e) {
    return fail(500, "Webhook handling failed.", e);
  }
  return json({ ok: true });
}
