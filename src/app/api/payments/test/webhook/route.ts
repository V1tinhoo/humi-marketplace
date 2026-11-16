import { fail, json } from "@/lib/api";
import { isTestPaymentsEnabled, verifyTestWebhook, type TestWebhookEvent } from "@/lib/payments";
import { createSupabaseAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

/**
 * POST /api/payments/test/webhook — test provider's webhook (signed, time-limited).
 * The ONLY place that credits a test top-up. confirm_topup() is idempotent: repeated or
 * replayed events never credit twice, and the amount must match the pending top-up.
 * A real provider gets its own route with its own signature check, calling the same function.
 */
export async function POST(request: Request) {
  if (!isTestPaymentsEnabled) return fail(404, "Not found.");
  if (!isAdminConfigured) return fail(503, "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const body = await request.text();
  if (!verifyTestWebhook(body, request.headers.get("x-test-signature"))) return fail(401, "Invalid signature.");

  let event: TestWebhookEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return fail(400, "Invalid payload.");
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("confirm_topup", {
    p_topup_id: event.topupId,
    p_provider: "test",
    p_provider_payment_id: event.providerPaymentId,
    p_amount_cents: event.amountCents,
    p_status: event.type === "payment.approved" ? "approved" : "declined",
    p_method: event.method,
    p_reason: event.type === "payment.declined" ? "Declined by the test provider" : null,
  });
  if (error || !data) return fail(400, "Couldn't confirm the top-up.", error);
  return json({ status: data.status });
}
