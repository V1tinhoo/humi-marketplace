import { en, type Dictionary } from "./dictionaries/en";
import { pt } from "./dictionaries/pt";
import { ptPatterns, ptPhrases } from "./pt-phrases";

export const locales = ["en", "pt"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

/** Cookie with the visitor's language ("pt" | "en"). Set automatically on the first visit. */
export const LOCALE_COOKIE = "humi_locale";
/** Cookie with the visitor's country (ISO code, e.g. "BR"), when the host tells us. */
export const COUNTRY_COOKIE = "humi_country";

export const isLocale = (v: unknown): v is Locale => v === "en" || v === "pt";

/**
 * Brazil → Portuguese; everyone else → English.
 * Country comes from the hosting provider's IP geolocation (Vercel's x-vercel-ip-country).
 * Without a country (e.g. localhost) we fall back to the browser language.
 */
export function detectLocale({ country, acceptLanguage }: { country?: string | null; acceptLanguage?: string | null }): Locale {
  if (country) return country.toUpperCase() === "BR" ? "pt" : "en";
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("pt") ? "pt" : "en";
}

const dictionaries: Record<Locale, Dictionary> = { en, pt };
export function getDictionary(locale: Locale = defaultLocale): Dictionary {
  return dictionaries[locale] ?? en;
}

export type Vars = Record<string, string | number | null | undefined>;
export type Translate = (text: string, vars?: Vars) => string;

/**
 * Phrase translation: the English text is the key, so the code stays readable and
 * anything not translated yet simply shows in English. `{name}` placeholders are filled from vars.
 */
export function makeT(locale: Locale): Translate {
  return (text, vars) => {
    let out = text;
    if (locale === "pt") {
      const hit = ptPhrases[text];
      if (hit !== undefined) out = hit;
      else
        for (const [re, fn] of ptPatterns) {
          const m = text.match(re);
          if (m) {
            out = fn(m);
            break;
          }
        }
    }
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v == null ? "" : String(v));
    return out;
  };
}

/** BCP-47 tag for dates and numbers. */
export const intlLocale = (locale: Locale) => (locale === "pt" ? "pt-BR" : "en-US");
