import type { NextRequest } from "next/server";
import { dbError, fail, json, requireUser } from "@/lib/api";
import { ensureRoom, isLiveKitConfigured } from "@/lib/livekit";
import { isAdminConfigured } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * POST /api/calls  { hostId, callType: "audio" | "video", bookingId? }
 * Starts a call as the signed-in customer. The database checks the balance and snapshots
 * the price; nothing is charged until LiveKit confirms both people are connected.
 */
export async function POST(request: NextRequest) {
  if (!isLiveKitConfigured || !isAdminConfigured) return fail(503, "Calls aren't available yet: video/billing keys are not configured.");
  const { supabase, user } = await requireUser();
  if (!user) return fail(401, "Please log in to start a call.");

  const body = (await request.json().catch(() => ({}))) as { hostId?: string; callType?: string; bookingId?: string };
  if (!body.hostId || !UUID.test(body.hostId)) return fail(400, "Invalid host.");
  const callType = body.callType === "video" ? "video" : "audio";
  if (body.bookingId && !UUID.test(body.bookingId)) return fail(400, "Invalid booking.");

  const { data, error } = await supabase.rpc("start_call", { p_host_id: body.hostId, p_call_type: callType, p_booking_id: body.bookingId ?? null });
  if (error || !data) return fail(error?.code === "P0001" ? 409 : 500, dbError(error, "Couldn't start the call."), error);
  await ensureRoom(data.room_name);
  return json({ callId: data.id });
}
