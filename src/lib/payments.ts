/**
 * SERVER-ONLY payment provider layer.
 *
 * Providers: Mercado Pago (see lib/mercadopago.ts) and a TEST provider for development. Both follow:
 *   1. /api/wallet/topups creates a PENDING top-up (nothing is credited);
 *   2. the provider confirms through a SIGNED WEBHOOK;
 *   3. the webhook calls confirm_topup() with the service role, which credits the wallet
 *      once (idempotent) and only if the confirmed amount matches.
 * Test top-ups are stored with livemode = false and shown as "test balance".
 * No real money moves until a real provider (and its legal model) is integrated.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isMercadoPagoConfigured, mercadoPagoProvider } from "@/lib/mercadopago";

export type ProviderId = "test" | "mercadopago" | "mercadopago_sandbox";

/** Test payments run in development, or in production only if explicitly enabled. */
export const isTestPaymentsEnabled = process.env.NODE_ENV !== "production" || process.env.PAYMENTS_TEST_MODE === "true";

/** The provider used for new top-ups: Mercado Pago when configured, otherwise the test provider (dev only). */
export function activeProvider(): ProviderId | null {
  if (isMercadoPagoConfigured) return mercadoPagoProvider;
  return isTestPaymentsEnabled ? "test" : null;
}

// Secret for signing test webhooks. Set PAYMENTS_TEST_WEBHOOK_SECRET in multi-instance deployments.
const secret = process.env.PAYMENTS_TEST_WEBHOOK_SECRET || (globalThis as { __humiTestSecret?: string }).__humiTestSecret || randomBytes(32).toString("hex");
(globalThis as { __humiTestSecret?: string }).__humiTestSecret = secret;

/** Signs a webhook body: "t=<unix>,v1=<hmac>" (same shape real providers use). */
export function signTestWebhook(body: string, now = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", secret).update(`${now}.${body}`).digest("hex");
  return `t=${now},v1=${sig}`;
}

/** Verifies signature and freshness (5 min) to block forged or replayed webhooks. */
export function verifyTestWebhook(body: string, header: string | null) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300 || !parts.v1) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface TestWebhookEvent {
  type: "payment.approved" | "payment.declined";
  topupId: string;
  providerPaymentId: string;
  amountCents: number;
  method: string;
}
