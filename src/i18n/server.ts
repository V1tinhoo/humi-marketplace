// Server-only: reads request cookies.
import { cookies } from "next/headers";
import { LOCALE_COOKIE, defaultLocale, getDictionary, isLocale, makeT, type Locale } from "./index";

/** The visitor's language on the server (middleware sets the cookie on the first visit). */
export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : defaultLocale;
}

export async function getT() {
  return makeT(await getLocale());
}

export async function getDict() {
  return getDictionary(await getLocale());
}
