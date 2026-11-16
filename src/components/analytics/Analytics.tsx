"use client";

import Link from "next/link";
import Script from "next/script";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Cookie } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";
import {
  GA_ID,
  META_PIXEL_ID,
  analyticsConfigured,
  captureAttribution,
  getAttribution,
  getConsent,
  getReferralCode,
  onConsentChange,
  setConsent,
  track,
  type Consent,
} from "@/lib/analytics";

/**
 * - Records where the visitor came from (ads, referral link) and saves it on sign-up.
 * - Shows the cookie choice; Google Analytics and Meta Pixel load only after "Accept".
 * - Sends page views on in-app navigation and the "sign_up" event after a new account.
 */
export function Analytics() {
  const pathname = usePathname();
  const router = useRouter();
  const tr = useT();
  const { user, mode } = useAuth();
  const [consent, setConsentState] = useState<Consent>("denied");
  const [decided, setDecided] = useState(true);
  const sentFor = useRef<string | null>(null);

  // Attribution + consent state (browser only).
  useEffect(() => {
    captureAttribution();
    const sync = () => {
      const c = getConsent();
      setConsentState(c);
      setDecided(c !== null);
    };
    sync();
    return onConsentChange(sync);
  }, []);

  // New accounts: save the source / referral code once (the database ignores old accounts).
  useEffect(() => {
    if (mode !== "supabase" || !user || sentFor.current === user.id) return;
    sentFor.current = user.id;
    const supabase = getSupabaseBrowserClient() as unknown as { rpc: (f: string, a: object) => PromiseLike<unknown> } | null;
    supabase?.rpc("set_signup_source", { p_source: getAttribution(), p_ref: getReferralCode() }).then(undefined, () => {});
  }, [mode, user]);

  // "welcome=1" is added by the auth callback for brand-new accounts (Google / e-mail link).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("welcome") !== "1") return;
    track("sign_up", { method: url.searchParams.get("method") ?? "email" });
    url.searchParams.delete("welcome");
    url.searchParams.delete("method");
    router.replace(url.pathname + (url.search ? url.search : ""), { scroll: false });
  }, [pathname, router]);

  // Page views on in-app navigation (the first one is sent by the scripts themselves).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    track("page_view", { page_path: pathname });
  }, [pathname]);

  if (!analyticsConfigured) return null;

  return (
    <>
      {consent === "granted" && GA_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}');`}
          </Script>
        </>
      )}
      {consent === "granted" && META_PIXEL_ID && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`}
        </Script>
      )}

      {!decided && (
        <div role="dialog" aria-label={tr("Cookies")} className="fixed inset-x-3 bottom-3 z-[85] mx-auto max-w-3xl animate-fade-up rounded-2xl bg-white p-4 shadow-lift ring-1 ring-line sm:inset-x-6 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Cookie className="hidden size-6 shrink-0 text-plum sm:block" />
            <p className="flex-1 text-sm text-plum">
              {tr("We use essential cookies to run the site and, with your permission, analytics and advertising cookies (Google and Meta) to measure and improve our campaigns.")}{" "}
              <Link href="/privacy#cookies" className="font-semibold underline underline-offset-2">{tr("Privacy Policy")}</Link>
            </p>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => setConsent("denied")} className="h-10 rounded-full px-4 text-sm font-semibold text-plum-soft ring-1 ring-line hover:text-plum">
                {tr("Reject")}
              </button>
              <button onClick={() => setConsent("granted")} className="h-10 rounded-full bg-plum px-5 text-sm font-semibold text-white hover:bg-plum-deep">
                {tr("Accept")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Footer link to change the cookie choice. */
export function CookieSettingsLink({ label }: { label: string }) {
  if (!analyticsConfigured) return null;
  return (
    <button
      type="button"
      onClick={() => import("@/lib/analytics").then((m) => m.resetConsent())}
      className="text-left text-sm text-plum-soft transition-colors hover:text-plum"
    >
      {label}
    </button>
  );
}
