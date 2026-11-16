/** All money in HUMI is integer cents (BRL). These helpers only format for display. */
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** The host's per-minute price for a format (video falls back to audio). */
export const hostPriceCents = (h: { priceAudioCents: number; priceVideoCents: number | null }, format: "audio" | "video") =>
  format === "video" ? h.priceVideoCents ?? h.priceAudioCents : h.priceAudioCents;

export const formatBRL = (cents: number) => brl.format((cents ?? 0) / 100);

/** "R$ 1,00/min" */
export const formatPerMinute = (cents: number) => `${formatBRL(cents)}/min`;

/** Display-only estimate; the server calculates every real charge. */
export const estimateCents = (centsPerMinute: number, seconds: number) => Math.floor((centsPerMinute * seconds) / 60);

/** Converts "12,50" / "12.50" / "12" (reais) to cents, or null if invalid. */
export function parseReaisToCents(input: string): number | null {
  const clean = input.trim().replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export const formatDuration = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
};
