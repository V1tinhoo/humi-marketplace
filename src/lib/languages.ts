/**
 * Hosts type their languages freely ("inglês", "Ingles", "English"…). Everywhere in the app a
 * language is identified by its English name ("English"), which the UI then translates.
 */
const MAP: Record<string, string> = {
  ingles: "English", english: "English", "ingles americano": "English", "ingles britanico": "English",
  portugues: "Portuguese", portuguese: "Portuguese", "portugues brasileiro": "Portuguese", "portugues (brasil)": "Portuguese",
  espanhol: "Spanish", spanish: "Spanish", espanol: "Spanish", castelhano: "Spanish",
  frances: "French", french: "French", francais: "French",
  italiano: "Italian", italian: "Italian",
  alemao: "German", german: "German", deutsch: "German",
  japones: "Japanese", japanese: "Japanese",
  coreano: "Korean", korean: "Korean",
  mandarim: "Mandarin", mandarin: "Mandarin", chines: "Mandarin", chinese: "Mandarin",
  russo: "Russian", russian: "Russian",
  arabe: "Arabic", arabic: "Arabic",
  holandes: "Dutch", dutch: "Dutch", neerlandes: "Dutch",
  hindi: "Hindi",
  turco: "Turkish", turkish: "Turkish",
  polones: "Polish", polish: "Polish",
  libras: "Libras",
};

const key = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

/** "inglês" → "English". Unknown languages are kept, with a capital first letter. */
export function canonicalLanguage(name: string): string {
  const t = name.trim();
  if (!t) return t;
  return MAP[key(t)] ?? t.charAt(0).toUpperCase() + t.slice(1);
}

/** Canonical names, without duplicates, keeping the order. */
export function canonicalLanguages(names: string[] | null | undefined): string[] {
  return Array.from(new Set((names ?? []).map(canonicalLanguage).filter(Boolean)));
}
