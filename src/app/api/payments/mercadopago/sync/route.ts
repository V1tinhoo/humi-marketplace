import type { NextRequest } from "next/server";
import { fail, json, requireUser } from "@/lib/api";
import { findPayments, getOrder, isMercadoPagoConfigured, reconcileOrder, reconcilePayment } from "@/lib/mercadopago";
import { isAdminConfigured } from "@/lib/supabase/admin";

/**
 * POST /api/payments/mercadopago/sync  { topupId }
 * Called by the wallet page when the buyer comes back from checkout (and while a Pix is pending).
 * Looks the payment up on Mercado Pago's API — the same check as the webhook — so top-ups
 * are confirmed even where webhooks can't arrive (e.g. localhost).
 */
export async function POST(request: NextRequest) {
  if (!isMercadoPagoConfigured) return fail(404, "Not found.");
  if (!isAdminConfigured) return fail(503, "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const { supabase, user } = await requireUser();
  if (!user) return fail(401, "Please log in.");

  const { topupId } = (await request.json().catch(() => ({}))) as { topupId?: string };
  if (!topupId) return fail(400, "Missing top-up.");
  // RLS: you can only sync your own top-up.
  const { data: topup } = await supabase.from("wallet_topups").select("id, status, provider_payment_id").eq("id", topupId).maybeSingle();
  if (!topup) return fail(404, "Top-up not found.");
  if (topup.status !== "pending") return json({ status: topup.status });

  try {
    if (topup.provider_payment_id?.startsWith("ORD")) {
      // Pix (Orders API)
      const order = await getOrder(topup.provider_payment_id);
      await reconcileOrder(order);
      const { data: after } = await supabase.from("wallet_topups").select("status").eq("id", topupId).maybeSingle();
      return json({ status: after?.status ?? "pending", waiting: order.status === "action_required", rejected: false });
    }
    const payments = await findPayments(topupId);
    // Approved first; other attempts (rejected, pending Pix) don't change anything.
    const approved = payments.find((p) => p.status === "approved");
    if (approved) await reconcilePayment(approved);
    const { data: after } = await supabase.from("wallet_topups").select("status").eq("id", topupId).maybeSingle();
    const waiting = payments.some((p) => p.status === "pending" || p.status === "in_process");
    const rejected = !approved && payments.length > 0 && payments.every((p) => p.status === "rejected" || p.status === "cancelled");
    return json({ status: after?.status ?? "pending", waiting, rejected });
  } catch (e) {
    return fail(502, "Couldn't check the payment right now.", e);
  }
}
