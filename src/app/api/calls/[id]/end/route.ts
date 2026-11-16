import type { NextRequest } from "next/server";
import { fail, json, requireUser } from "@/lib/api";
import { endCall } from "@/lib/calls";
import { isAdminConfigured } from "@/lib/supabase/admin";

/**
 * POST /api/calls/:id/end  { decline?: boolean }
 * Bills up to this moment (server clock) and ends the call. The reason is derived from who
 * is asking (customer/host), never taken from the request.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminConfigured) return fail(503, "Calls are not configured yet.");
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return fail(401, "Please log in.");

  const { data: mine } = await supabase.from("my_calls").select("id, i_am_host, status").eq("id", id).maybeSingle();
  if (!mine) return fail(404, "Call not found.");

  const body = (await request.json().catch(() => ({}))) as { decline?: boolean };
  const reason = mine.i_am_host ? (body.decline && mine.status === "ringing" ? "declined" : "host_hangup") : "customer_hangup";
  try {
    const call = await endCall(id, reason);
    return json({ call });
  } catch (e) {
    return fail(500, "Couldn't end the call.", e);
  }
}
