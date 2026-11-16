import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/config";

/** Routes that require a signed-in user (role checks happen in the page). */
const PROTECTED = ["/account", "/dashboard", "/become-a-host/apply", "/reset-password", "/wallet", "/call"];

export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next();

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
