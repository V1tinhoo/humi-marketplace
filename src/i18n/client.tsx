"use client";

import { createContext, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, getDictionary, intlLocale, makeT, type Locale } from "./index";
import { cn } from "@/lib/utils";

type Ctx = { locale: Locale; country: string | null };
const I18nContext = createContext<Ctx>({ locale: "en", country: null });

export function I18nProvider({ locale, country, children }: Ctx & { children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, country }), [locale, country]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useLocale = () => useContext(I18nContext).locale;
/** Visitor's country from IP geolocation (e.g. "BR"), or null when unknown. */
export const useCountry = () => useContext(I18nContext).country;
export function useT() {
  const locale = useLocale();
  return useMemo(() => makeT(locale), [locale]);
}
export function useDict() {
  return getDictionary(useLocale());
}
export const useIntlLocale = () => intlLocale(useLocale());

/** Small PT | EN switch. The choice is remembered for a year. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const set = (l: Locale) => {
    if (l === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  };
  return (
    <div className={cn("inline-flex rounded-full bg-white p-0.5 text-xs font-bold ring-1 ring-line", className)} role="group" aria-label="Language / Idioma">
      {(["pt", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => set(l)}
          aria-pressed={locale === l}
          className={cn("rounded-full px-2.5 py-1 transition", locale === l ? "bg-plum text-white" : "text-plum-soft hover:text-plum")}
        >
          {l === "pt" ? "PT" : "EN"}
        </button>
      ))}
    </div>
  );
}
