/**
 * SERVER-ONLY Mercado Pago integration (wallet top-ups: Pix via the Orders API with the QR code shown on HUMI; card via Checkout Pro).
 *
 * Money only reaches a wallet after we READ the payment from Mercado Pago's API with our
 * access token (never from what the browser or a webhook body says). Webhooks and the
 * "back from checkout" sync both end in reconcilePayment(), which calls confirm_topup()
 * — idempotent, amount-checked, credits once.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN ?? "";
const WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "";
const API = "https://api.mercadopago.com";

export const isMercadoPagoConfigured = Boolean(TOKEN);
/** Test credentials ("TEST-…") or MERCADOPAGO_SANDBOX=true → balance is marked as test, not real money. */
export const isMercadoPagoSandbox = TOKEN.startsWith("TEST-") || process.env.MERCADOPAGO_SANDBOX === "true";
export const mercadoPagoProvider = isMercadoPagoSandbox ? "mercadopago_sandbox" : "mercadopago";

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function mp<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${(body as { message?: string }).message ?? "request failed"}`);
  return body as T;
}

/** Hosted checkout for one pending top-up. `method` narrows the options shown (Pix or card). */
export async function createCheckout(opts: { topupId: string; amountCents: number; method: "pix" | "card" }) {
  const back = `${siteUrl()}/wallet?topup=${opts.topupId}`;
  const isPublic = siteUrl().startsWith("https://");
  const pref = await mp<{ id: string; init_point: string; sandbox_init_point?: string }>("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify({
      items: [{ id: "humi-wallet-topup", title: "Crédito HUMI", quantity: 1, currency_id: "BRL", unit_price: opts.amountCents / 100 }],
      external_reference: opts.topupId,
      statement_descriptor: "HUMI",
      payment_methods: {
        installments: 1,
        excluded_payment_types:
          opts.method === "pix"
            ? [{ id: "credit_card" }, { id: "debit_card" }, { id: "prepaid_card" }, { id: "ticket" }, { id: "atm" }]
            : [{ id: "bank_transfer" }, { id: "ticket" }, { id: "atm" }],
      },
      back_urls: { success: back, pending: back, failure: back },
      // Mercado Pago rejects auto-return and webhooks for localhost: there the buyer clicks
      // "Voltar ao site" and the return-page sync confirms the payment.
      ...(isPublic ? { auto_return: "approved", notification_url: `${siteUrl()}/api/payments/mercadopago/webhook` } : {}),
      // Unpaid checkouts expire after 1 day.
      expires: true,
      expiration_date_to: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    }),
  });
  const url = TOKEN.startsWith("TEST-") ? (pref.sandbox_init_point ?? pref.init_point) : pref.init_point;
  return { preferenceId: pref.id, checkoutUrl: url };
}

export const PIX_MINUTES = 30;

type MpOrder = {
  id: string; // "ORD…" (live) / "ORDTST…" (test)
  status: string; // action_required | processed | expired | canceled | refunded | failed …
  status_detail?: string;
  external_reference?: string | null;
  total_amount: string;
  currency?: string;
  transactions?: {
    payments?: {
      id: string;
      status: string;
      date_of_expiration?: string;
      payment_method?: { id?: string; type?: string; qr_code?: string; qr_code_base64?: string; ticket_url?: string };
    }[];
  };
};

const isTestOrder = (o: MpOrder) => o.id.startsWith("ORDTST");

/**
 * Pix charge created by our server through Mercado Pago's Orders API (no Mercado Pago
 * login for the buyer). The idempotency key is the top-up id: retries never create a
 * second charge. The order id is saved on the top-up so we can look it up later.
 */
export async function createPixOrder(opts: { topupId: string; amountCents: number; email: string }) {
  const amount = (opts.amountCents / 100).toFixed(2);
  const order = await mp<MpOrder>("/v1/orders", {
    method: "POST",
    headers: { "x-idempotency-key": `pix-${opts.topupId}` },
    body: JSON.stringify({
      type: "online",
      processing_mode: "automatic",
      external_reference: opts.topupId,
      total_amount: amount,
      description: "Crédito HUMI",
      payer: { email: opts.email },
      transactions: {
        payments: [{ amount, payment_method: { id: "pix", type: "bank_transfer" }, expiration_time: `PT${PIX_MINUTES}M` }],
      },
    }),
  });
  const admin = createSupabaseAdminClient();
  // wallet_topups is read-only for app code; only this server step (service role) records the order id.
  const topups = admin.from("wallet_topups") as unknown as {
    update: (v: { provider_payment_id: string }) => { eq: (c: string, v: string) => { eq: (c: string, v: string) => PromiseLike<{ error: unknown }> } };
  };
  const { error } = await topups.update({ provider_payment_id: order.id }).eq("id", opts.topupId).eq("status", "pending");
  if (error) throw new Error("Couldn't save the Pix order id.");
  return order;
}

export const getOrder = (id: string) => mp<MpOrder>(`/v1/orders/${encodeURIComponent(id)}`);

/** What the buyer needs to pay a pending Pix (QR image + copy-and-paste code). */
export function pixDetails(o: MpOrder) {
  const p = o.transactions?.payments?.[0];
  const m = p?.payment_method;
  return {
    orderId: o.id,
    status: o.status,
    qrCode: m?.qr_code ?? null,
    qrCodeBase64: m?.qr_code_base64 ?? null,
    ticketUrl: m?.ticket_url ?? null,
    expiresAt: p?.date_of_expiration ?? null,
    amountCents: Math.round(Number(o.total_amount) * 100),
  };
}

type MpPayment = {
  id: number;
  status: string; // approved | pending | in_process | authorized | rejected | cancelled | refunded | charged_back
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount: number;
  currency_id: string;
  payment_method_id?: string;
  payment_type_id?: string;
  live_mode?: boolean;
};

export const getPayment = (id: string) => mp<MpPayment>(`/v1/payments/${encodeURIComponent(id)}`);
export const findPayments = (topupId: string) =>
  mp<{ results: MpPayment[] }>(`/v1/payments/search?external_reference=${encodeURIComponent(topupId)}&sort=date_created&criteria=desc`).then((r) => r.results ?? []);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Credits (or reverses) a top-up from data we just read from Mercado Pago's API. */
async function applyToTopup(opts: {
  topupId: string;
  providerPaymentId: string;
  amountCents: number;
  status: "approved" | "refunded" | null;
  method: string | null;
  rawStatus: string;
}): Promise<string> {
  if (!UUID.test(opts.topupId)) return "ignored: not a HUMI top-up";
  const admin = createSupabaseAdminClient();
  const { data: topup } = await admin.from("wallet_topups").select("*").eq("id", opts.topupId).maybeSingle();
  if (!topup || topup.provider !== mercadoPagoProvider) return "ignored: unknown top-up";
  if (!opts.status) return `no change (${opts.rawStatus})`;
  if (opts.status === "refunded" && topup.provider_payment_id !== opts.providerPaymentId) return "ignored: refund of another payment";

  if (opts.status === "approved" && topup.status === "approved" && topup.provider_payment_id !== opts.providerPaymentId) {
    // Same top-up paid twice: the first payment was credited; this one needs a manual refund.
    console.error("[mercadopago] duplicate payment for top-up", opts.topupId, opts.providerPaymentId);
    return "duplicate payment — refund manually";
  }

  const { data, error } = await admin.rpc("confirm_topup", {
    p_topup_id: opts.topupId,
    p_provider: mercadoPagoProvider,
    p_provider_payment_id: opts.providerPaymentId,
    p_amount_cents: opts.amountCents,
    p_status: opts.status,
    p_method: opts.method,
    p_reason: null,
  });
  if (error) throw new Error(`confirm_topup: ${error.message}`);
  return data?.status ?? "ok";
}

/** Pix order (Orders API): "processed" = paid. */
export async function reconcileOrder(o: MpOrder): Promise<string> {
  if (o.currency && o.currency !== "BRL") return "ignored: currency";
  // A real-money integration must never accept test orders.
  if (!isMercadoPagoSandbox && isTestOrder(o)) return "ignored: test order on a live account";
  const status = o.status === "processed" ? "approved" : o.status === "refunded" || o.status === "charged_back" ? "refunded" : null;
  return applyToTopup({
    topupId: o.external_reference ?? "",
    providerPaymentId: o.id,
    amountCents: Math.round(Number(o.total_amount) * 100),
    status,
    method: "pix",
    rawStatus: o.status,
  });
}

/**
 * Card payment from Checkout Pro. Rejected attempts are ignored on purpose:
 * the buyer can retry with another card, so the top-up stays pending.
 */
export async function reconcilePayment(p: MpPayment): Promise<string> {
  if (p.currency_id !== "BRL") return "ignored: currency";
  if (!isMercadoPagoSandbox && p.live_mode === false) return "ignored: test payment on a live account";
  const id = String(p.id);
  const status = p.status === "approved" ? "approved" : p.status === "refunded" || p.status === "charged_back" ? "refunded" : null;
  return applyToTopup({
    topupId: p.external_reference ?? "",
    providerPaymentId: id,
    amountCents: Math.round(p.transaction_amount * 100),
    status,
    method: p.payment_method_id === "pix" ? "pix" : p.payment_type_id?.includes("card") ? "card" : (p.payment_type_id ?? null),
    rawStatus: p.status,
  });
}

/**
 * Verifies Mercado Pago's webhook signature (x-signature: "ts=…,v1=…").
 * Signed text: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" with the webhook secret.
 * Without a configured secret we still only trust what we read back from the API.
 */
export function verifyWebhookSignature(opts: { dataId: string | null; requestId: string | null; signature: string | null }) {
  if (!WEBHOOK_SECRET) return true;
  if (!opts.signature) return false;
  const parts = Object.fromEntries(opts.signature.split(",").map((kv) => kv.trim().split("=") as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  const id = opts.dataId && /^[a-z0-9]+$/i.test(opts.dataId) ? opts.dataId.toLowerCase() : opts.dataId;
  let manifest = "";
  if (id) manifest += `id:${id};`;
  if (opts.requestId) manifest += `request-id:${opts.requestId};`;
  manifest += `ts:${parts.ts};`;
  const expected = Buffer.from(createHmac("sha256", WEBHOOK_SECRET).update(manifest).digest("hex"));
  const got = Buffer.from(parts.v1);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
