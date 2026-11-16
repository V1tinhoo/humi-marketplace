import { fail, json } from "@/lib/api";
import { getOrder, getPayment, isMercadoPagoConfigured, reconcileOrder, reconcilePayment, verifyWebhookSignature } from "@/lib/mercadopago";
import { isAdminConfigured } from "@/lib/supabase/admin";

/**
 * POST /api/payments/mercadopago/webhook — Mercado Pago notifications.
 * The body is only a hint ("payment 123 changed"): we always re-read the payment from
 * Mercado Pago's API with our token before touching a wallet.
 * 200 = handled or not ours (no retry). 5xx = temporary problem (Mercado Pago retries).
 */
export async function POST(request: Request) {
  if (!isMercadoPagoConfigured) return fail(404, "Not found.");
  if (!isAdminConfigured) return fail(503, "SUPABASE_SERVICE_ROLE_KEY is not configured.");

  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as { type?: string; topic?: string; data?: { id?: string | number } };
  const type = body.type ?? body.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const dataId = url.searchParams.get("data.id") ?? (body.data?.id != null ? String(body.data.id) : url.searchParams.get("id"));

  if (!verifyWebhookSignature({ dataId, requestId: request.headers.get("x-request-id"), signature: request.headers.get("x-signature") })) {
    return fail(401, "Invalid signature.");
  }
  if (!dataId || (type !== "payment" && type !== "order")) return json({ ok: true, ignored: type ?? "unknown" });

  try {
    // "order" = Pix (Orders API); "payment" = card (Checkout Pro).
    const result = type === "order" ? await reconcileOrder(await getOrder(dataId)) : await reconcilePayment(await getPayment(dataId));
    return json({ ok: true, result });
  } catch (e) {
    return fail(500, "Couldn't process the notification.", e);
  }
}
