/**
 * Company details shown in the Terms, Privacy Policy and other legal pages.
 * Fill in the company name and CNPJ once the company exists — empty values are simply hidden.
 * The contact e-mails must be real, monitored inboxes (LGPD requires a working contact).
 */
export const LEGAL = {
  brand: "HUMI",
  /** Razão social, e.g. "HUMI Tecnologia Ltda." (empty = hidden) */
  companyName: "",
  /** CNPJ, e.g. "00.000.000/0001-00" (empty = hidden) */
  cnpj: "",
  /** General support and requests (cancellations, refunds). */
  supportEmail: "contato@humi.chat",
  /** Privacy requests (LGPD) — the data protection officer contact. */
  privacyEmail: "privacidade@humi.chat",
  website: "humi.chat",
  /** Date of the current version of the legal documents. */
  updatedAt: "2026-11-16",
};

/** "HUMI" or "HUMI (Company Ltda., CNPJ …)" when the company details are filled in. */
export function legalEntity() {
  const parts = [LEGAL.companyName, LEGAL.cnpj && `CNPJ ${LEGAL.cnpj}`].filter(Boolean);
  return parts.length ? `${LEGAL.brand} (${parts.join(", ")})` : LEGAL.brand;
}
