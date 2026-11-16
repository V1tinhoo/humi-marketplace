import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/config";
import { COUNTRY_COOKIE, LOCALE_COOKIE, detectLocale, isLocale } from "@/i18n";
import { REDIRECT_HOSTS, SITE_URL } from "@/lib/site";

/** Routes that require a signed-in user (role checks happen in the page). */
const PROTECTED = ["/account", "/dashboard", "/become-a-host/apply", "/reset-password", "/wallet", "/call", "/admin", "/preview"];

const YEAR = 60 * 60 * 24 * 365;

/**
 * Link-preview robots (WhatsApp, Instagram/Facebook, Telegram, X…) run on servers abroad, so
 * geolocation would give them English. HUMI's audience is Brazilian: previews use Portuguese.
 */
const PREVIEW_BOT = /WhatsApp|facebookexternalhit|Facebot|meta-externalagent|Twitterbot|TelegramBot|Slackbot|LinkedInBot|Discordbot|Pinterest|SkypeUriPreview|Applebot|redditbot|Embedly|Googlebot|bingbot|GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-SearchBot|Claude-User|PerplexityBot|Perplexity-User|Google-Extended|Amazonbot|DuckAssistBot|CCBot/i;

export async function middleware(request: NextRequest) {
  // One official address: other domains redirect permanently (same path and query).
  const reqHost = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
  if (REDIRECT_HOSTS.has(reqHost)) {
    return NextResponse.redirect(SITE_URL + request.nextUrl.pathname + request.nextUrl.search, 308);
  }

  // Language: picked automatically on the first visit (Brazil → Portuguese, elsewhere → English),
  // then remembered. The country comes from Vercel's IP geolocation header.
  const country = request.headers.get("x-vercel-ip-country");
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const bot = PREVIEW_BOT.test(request.headers.get("user-agent") ?? "");
  const locale = isLocale(saved) ? saved : bot ? "pt" : detectLocale({ country, acceptLanguage: request.headers.get("accept-language") });
  if (!isLocale(saved)) request.cookies.set(LOCALE_COOKIE, locale);
  if (country) request.cookies.set(COUNTRY_COOKIE, country);
  const finish = (res: NextResponse) => {
    if (!isLocale(saved)) res.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: YEAR, sameSite: "lax" });
    if (country) res.cookies.set(COUNTRY_COOKIE, country, { path: "/", maxAge: YEAR, sameSite: "lax" });
    // Canonical address for search engines and AI assistants (vercel.app copies point to humi.chat).
    if (!request.nextUrl.pathname.startsWith("/api/")) res.headers.set("Link", `<${SITE_URL}${request.nextUrl.pathname}>; rel="canonical"`);
    return res;
  };
  return finish(await handle(request));
}

async function handle(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next({ request });

  // If the Auth redirect URL isn't whitelisted, Supabase sends email links to the Site URL
  // (e.g. "/?code=…"). Forward those to the callback so the session is still created.
  // Same for OAuth errors/cancellation landing on the Site URL.
  const errDesc = request.nextUrl.searchParams.get("error_description");
  const errCode = request.nextUrl.searchParams.get("error");
  if (errCode && errDesc && !["/auth/callback", "/login"].includes(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    const errorCode = request.nextUrl.searchParams.get("error_code");
    url.search = `?error=${encodeURIComponent(errCode)}&error_description=${encodeURIComponent(errDesc)}${errorCode ? `&error_code=${encodeURIComponent(errorCode)}` : ""}`;
    return NextResponse.redirect(url);
  }

  const code = request.nextUrl.searchParams.get("code");
  if (code && request.nextUrl.pathname !== "/auth/callback") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    url.search = `?code=${encodeURIComponent(code)}&next=${encodeURIComponent(request.nextUrl.pathname === "/" ? "/account" : request.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Refreshes the session cookie if needed. getUser() validates the token with Supabase Auth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Skip static assets and image optimisation.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
