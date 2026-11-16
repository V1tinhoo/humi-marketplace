import type { NextRequest } from "next/server";
import { fail, json, requireUser } from "@/lib/api";
import { createSupabaseAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

/**
 * POST /api/admin/users/:id/ban  { ban: boolean }
 * Blocks (or unblocks) someone's login. Admins only — checked in the database.
 * A blocked host is also hidden from Explore.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminConfigured) return fail(503, "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const { supabase, user } = await requireUser();
  if (!user) return fail(401, "Please log in.");
  const { data: isAdmin } = await (supabase as unknown as { rpc: (f: string) => Promise<{ data: boolean | null }> }).rpc("am_i_admin");
  if (!isAdmin) return fail(403, "Admins only.");

  const { id } = await params;
  if (id === user.id) return fail(400, "You can't block your own account.");
  const { ban } = (await request.json().catch(() => ({}))) as { ban?: boolean };

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: ban ? "876000h" : "none" });
  if (error) return fail(400, "Couldn't update this account.", error);

  const untyped = admin as unknown as {
    from: (t: string) => {
      update: (v: object) => { eq: (c: string, v: string) => PromiseLike<unknown> };
      insert: (v: object) => PromiseLike<unknown>;
    };
  };
  if (ban) await untyped.from("host_profiles").update({ is_published: false, is_available: false }).eq("user_id", id);
  // Suspension flag: blocks calls/bookings immediately; unblocking also lifts an automatic suspension.
  await untyped.from("profiles").update(ban ? { suspended_at: new Date().toISOString(), suspended_reason: "admin" } : { suspended_at: null, suspended_reason: null }).eq("id", id);
  await untyped.from("admin_actions").insert({ admin_id: user.id, action: ban ? "ban_user" : "unban_user", target: id, details: {} });
  return json({ ok: true });
}
