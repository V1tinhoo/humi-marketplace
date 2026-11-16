import type { NextRequest } from "next/server";
import { dbError, fail, json, requireUser } from "@/lib/api";
import { activeProvider } from "@/lib/payments";
import { createCheckout, createPixOrder, mercadoPagoAccountKind, mpErrorMessage } from "@/lib/mercadopago";

/**
 * POST /api/wallet/topups  { amountCents, method: "pix" | "card" }
 * Creates a PENDING top-up with the active provider and returns where to pay.
 * Nothing is credited here — only a verified provider webhook can do that.
 */
export async function POST(request: NextRequest) {
  const provider = activeProvider();
  if (!provider) return fail(503, "Top-ups aren't available yet: no payment provider is configured.");
  const { supabase, user } = await requireUser();
  if (!user) return fail(401, "Please log in.");

  const body = (await request.json().catch(() => ({}))) as { amountCents?: number; method?: string };
  const amount = Number(body.amountCents);
  if (!Number.isInteger(amount) || amount <= 0) return fail(400, "Invalid amount.");
  const method = body.method === "card" ? "card" : "pix";

  // Live mode with a Mercado Pago TEST account can't work: checkout says "test version" and
  // test payments are never credited as real money. Stop here with a clear message.
  if (provider === "mercadopago" && (await mercadoPagoAccountKind()) === "test") {
    return fail(503, "Payments are misconfigured: the site is in live mode but uses a Mercado Pago TEST account. Use the production Access Token of your real account.");
  }

  const { data, error } = await supabase.rpc("create_topup", { p_amount_cents: amount, p_provider: provider, p_method: method });
  if (error || !data) return fail(error?.code === "P0001" ? 400 : 500, dbError(error, "Couldn't start the top-up."), error);

  if (provider !== "test") {
    try {
      // Pix: we create the charge and show the QR code on HUMI (no Mercado Pago login).
      if (method === "pix") {
        if (!user.email) return fail(400, "Add an email to your account to pay with Pix.");
        await createPixOrder({ topupId: data.id, amountCents: amount, email: user.email });
        return json({ topupId: data.id, checkoutUrl: `/wallet/pix/${data.id}`, provider, livemode: data.livemode });
      }
      const { checkoutUrl } = await createCheckout({ topupId: data.id, amountCents: amount, method, origin: request.nextUrl.origin });
      return json({ topupId: data.id, checkoutUrl, provider, livemode: data.livemode });
    } catch (e) {
      // Show Mercado Pago's own reason (e.g. no Pix key on the account), not just "unavailable".
      const reason = mpErrorMessage(e);
      return fail(502, reason ? `Mercado Pago: ${reason}` : "Mercado Pago is unavailable right now. Please try again.", e);
    }
  }

  // Test provider: our own clearly-labelled test checkout page. A real provider would return its hosted checkout URL.
  return json({ topupId: data.id, checkoutUrl: `/wallet/test-checkout/${data.id}`, provider, livemode: data.livemode });
}
