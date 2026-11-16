/**
 * Server-side call orchestration shared by the API routes and the LiveKit webhook.
 */
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bothInRoom, closeRoom, identityFor } from "@/lib/livekit";

export interface CallRow {
  id: string;
  room_name: string;
  customer_id: string;
  host_id: string;
  status: "ringing" | "connected" | "ended" | "failed";
}

/** Loads the call with the host's user id (service role, server only). */
export async function loadCall(callId: string) {
  const admin = createSupabaseAdminClient();
  const { data: call } = await admin.from("call_sessions").select("*").eq("id", callId).maybeSingle();
  if (!call) return null;
  const { data: host } = await admin.from("host_profiles").select("user_id").eq("id", call.host_id).single();
  return { call, hostUserId: host?.user_id as string };
}

/** Asks LiveKit who is in the room and lets the database bill (or not) accordingly. */
export async function tickCall(callId: string) {
  const loaded = await loadCall(callId);
  if (!loaded) return null;
  const { call, hostUserId } = loaded;
  if (call.status === "ended" || call.status === "failed") return call;
  const connected = await bothInRoom(call.room_name, identityFor("customer", call.customer_id), identityFor("host", hostUserId));
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("call_tick", { p_call_id: callId, p_both_connected: connected });
  if (error) throw new Error(`call_tick failed: ${error.message}`);
  if (data && (data.status === "ended" || data.status === "failed")) await closeRoom(call.room_name);
  return data;
}

/** Final tick (bills up to now) and then ends the call. */
export async function endCall(callId: string, reason: string) {
  await tickCall(callId);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("finish_call", { p_call_id: callId, p_reason: reason });
  if (error) throw new Error(`finish_call failed: ${error.message}`);
  if (data) await closeRoom(data.room_name);
  return data;
}
