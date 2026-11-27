import { fail, json } from "@/lib/api";
import { createSupabaseAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

/**
 * GET /api/cron/packages — daily job (Vercel Cron, see vercel.json):
 * expires packages (unused value back to the wallet) and renews monthly packages.
 * Vercel sends "Authorization: Bearer $CRON_SECRET"; without that secret the job is refused.
 * Customers' own packages are also processed whenever they open their packages.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return fail(401, "Unauthorized.");
  if (!isAdminConfigured) return fail(503, "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const admin = createSupabaseAdminClient() as unknown as { rpc: (f: string, a?: object) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
  const { data, error } = await admin.rpc("process_packages", { p_customer: null });
  if (error) return fail(500, "Couldn't process packages.", error);
  return json({ ok: true, processed: data });
}
