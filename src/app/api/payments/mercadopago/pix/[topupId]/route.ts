import { fail, json, requireUser } from "@/lib/api";
import { getOrder, isMercadoPagoConfigured, pixDetails, reconcileOrder } from "@/lib/mercadopago";
import { isAdminConfigured } from "@/lib/supabase/admin";

/**
 * GET /api/payments/mercadopago/pix/:topupId
 * The QR code / copy-and-paste code of your pending Pix, and whether it's been paid.
 * Payment status is read from Mercado Pago's API (and credited once if paid).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ topupId: string }> }) {
  if (!isMercadoPagoConfigured) return fail(404, "Not found.");
  if (!isAdminConfigured) return fail(503, "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const { topupId } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return fail(401, "Please log in.");
  // RLS: only your own top-up.
  const { data: topup } = await supabase.from("wallet_topups").select("id, status, amount_cents, provider_payment_id").eq("id", topupId).maybeSingle();
  if (!topup) return fail(404, "Top-up not found.");
  if (!topup.provider_payment_id?.startsWith("ORD")) return json({ status: topup.status, amountCents: topup.amount_cents, pix: null });

  try {
    const order = await getOrder(topup.provider_payment_id);
    if (topup.status === "pending") await reconcileOrder(order);
    const { data: after } = await supabase.from("wallet_topups").select("status").eq("id", topupId).maybeSingle();
    return json({ status: after?.status ?? topup.status, amountCents: topup.amount_cents, pix: pixDetails(order) });
  } catch (e) {
    return fail(502, "Couldn't reach Mercado Pago right now.", e);
  }
}
