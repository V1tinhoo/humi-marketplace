import { fail, json, requireUser } from "@/lib/api";
import { createJoinToken, ensureRoom, identityFor, isLiveKitConfigured, liveKitUrl } from "@/lib/livekit";

/**
 * GET /api/calls/:id/token — a LiveKit join token for a participant of this call.
 * Participation is checked with RLS (my_calls only returns the caller's own calls).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isLiveKitConfigured) return fail(503, "Video calls are not configured yet.");
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return fail(401, "Please log in.");

  const { data: call } = await supabase.from("my_calls").select("*").eq("id", id).maybeSingle();
  if (!call) return fail(404, "Call not found.");
  if (call.status === "ended" || call.status === "failed") return fail(410, "This call has ended.");

  const role = call.i_am_host ? "host" : "customer";
  const name = call.i_am_host ? call.host_name : call.customer_name || "Guest";
  await ensureRoom(call.room_name);
  const token = await createJoinToken({ room: call.room_name, identity: identityFor(role, user.id), name, video: call.call_type === "video" });
  return json({ token, url: liveKitUrl, role, call });
}
