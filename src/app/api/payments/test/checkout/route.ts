import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { fail, json, requireUser } from "@/lib/api";
import { isTestPaymentsEnabled, signTestWebhook, type TestWebhookEvent } from "@/lib/payments";

/**
 * POST /api/payments/test/checkout  { topupId, outcome: "approve" | "decline" }
 * TEST PROVIDER ONLY. Plays the role of the provider's checkout: it does NOT touch the wallet.
 * It sends a signed webhook to /api/payments/test/webhook — the same path a real provider uses.
 * Disabled in production unless PAYMENTS_TEST_MODE=true.
 */
export async function POST(request: NextRequest) {
  if (!isTestPaymentsEnabled) return fail(404, "Not found.");
  const { supabase, user } = await requireUser();
  if (!user) return fail(401, "Please log in.");

  const body = (await request.json().catch(() => ({}))) as { topupId?: string; outcome?: string };
  if (!body.topupId) return fail(400, "Missing top-up.");
  // RLS: only the owner can see their top-up.
  const { data: topup } = await supabase.from("wallet_topups").select("*").eq("id", body.topupId).maybeSingle();
  if (!topup || topup.provider !== "test") return fail(404, "Top-up not found.");

  const event: TestWebhookEvent = {
    type: body.outcome === "decline" ? "payment.declined" : "payment.approved",
    topupId: topup.id,
    providerPaymentId: `test_${randomUUID()}`,
    amountCents: topup.amount_cents,
    method: topup.method ?? "pix",
  };
  const payload = JSON.stringify(event);
  const res = await fetch(new URL("/api/payments/test/webhook", request.nextUrl.origin), {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-signature": signTestWebhook(payload) },
    body: payload,
  });
  if (!res.ok) return fail(502, "The test provider couldn't deliver the confirmation.");
  return json(await res.json());
}
