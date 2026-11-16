import { en, type Dictionary } from "./dictionaries/en";

export const locales = ["en", "pt"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// Portuguese is planned: add `pt: pt` once `dictionaries/pt.ts` exists.
const dictionaries: Partial<Record<Locale, Dictionary>> = { en };

export function getDictionary(locale: Locale = defaultLocale): Dictionary {
  return dictionaries[locale] ?? en;
}

/** Shortcut for the current (single) locale until routing by locale is added. */
export const t = getDictionary();
