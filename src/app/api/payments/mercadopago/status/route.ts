import { json } from "@/lib/api";
import { isMercadoPagoConfigured, isMercadoPagoSandbox, mercadoPagoAccountKind } from "@/lib/mercadopago";

/**
 * GET /api/payments/mercadopago/status — which Mercado Pago account the site is using.
 * Never returns the token: only whether it belongs to a TEST account or a REAL one,
 * so a wrong production setup (test token on the live site) is easy to spot.
 */
export async function GET() {
  if (!isMercadoPagoConfigured) return json({ configured: false });
  const account = await mercadoPagoAccountKind();
  return json({
    configured: true,
    mode: isMercadoPagoSandbox ? "sandbox" : "live",
    account, // "real" | "test" | "unknown"
    ok: !isMercadoPagoSandbox && account === "real",
  });
}
