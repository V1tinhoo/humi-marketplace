/**
 * Portuguese (Brazil) translations, keyed by the English text used in the code.
 * Missing keys simply show in English. Grouped by area in ./phrases.
 */
import { home } from "./phrases/home";
import { pages } from "./phrases/pages";
import { auth } from "./phrases/auth";
import { hosts } from "./phrases/hosts";
import { wallet, walletPatterns } from "./phrases/wallet";
import { call } from "./phrases/call";
import { booking } from "./phrases/booking";
import { dashboard } from "./phrases/dashboard";

export const ptPhrases: Record<string, string> = {
  ...home,
  ...pages,
  ...auth,
  ...hosts,
  ...wallet,
  ...call,
  ...booking,
  ...dashboard,
};

/** Dynamic messages (numbers/names inside) that can't be looked up exactly. */
export const ptPatterns: [RegExp, (m: RegExpMatchArray) => string][] = [...walletPatterns];
