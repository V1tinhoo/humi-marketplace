import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Landing point for:
 *  - Google / Apple sign-in (OAuth, PKCE `code`)
 *  - links in Supabase auth emails (sign-up confirmation, password recovery: `code` or `token_hash`)
 */

/** Friendly copy for errors Supabase / the provider send back in the URL. */
function oauthErrorMessage(error: string, description: string | null, code: string | null) {
  const d = (description ?? "").toLowerCase();
  // Email confirmation / reset link already used, opened twice, or older than its lifetime.
  if (code === "otp_expired" || d.includes("expired") || d.includes("invalid")) {
    return "This link has expired or was already used. Log in, or request a new link.";
  }
  // Supabase couldn't trade the provider's code with Google/Apple: provider keys in Supabase don't match.
  if (d.includes("unable to exchange external code") || code === "unexpected_failure") {
    return "Social sign-in isn't configured correctly yet. Please use email for now.";
  }
  if (error === "access_denied" || d.includes("cancel") || d.includes("denied")) {
    return "Sign-in was cancelled. You can try again or use your email.";
  }
  if (d.includes("provider is not enabled") || d.includes("unsupported provider")) {
    return "That sign-in option isn't switched on yet. Please use email for now.";
  }
  if (d.includes("email") && d.includes("already")) {
    return "An account with this email already exists. Log in with your email and password.";
  }
  return "We couldn't sign you in. Please try again.";
}

function loginRedirect(origin: string, message: string) {
  const to = new URL("/login", origin);
  to.searchParams.set("error", message);
  return NextResponse.redirect(to);
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const origin = url.origin;
  const rawNext = url.searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

  if (!isSupabaseConfigured) return NextResponse.redirect(new URL("/", origin));

  // Provider or Supabase reported a problem (including the user pressing "Cancel").
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    const description = url.searchParams.get("error_description");
    const errorCode = url.searchParams.get("error_code");
    // Full detail stays in the server log for debugging; users get friendly copy.
    console.error("[auth/callback]", oauthError, errorCode ?? "", description ?? "");
    return loginRedirect(origin, oauthErrorMessage(oauthError, description, errorCode));
  }

  const supabase = await createSupabaseServerClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let error: { message: string } | null = null;
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (tokenHash && type) ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  else error = { message: "Missing code" };

  if (error) {
    console.error("[auth/callback] exchange failed:", error.message);
    // The PKCE verifier lives in a cookie of the site where sign-in STARTED. If Supabase sent the
    // person back to a different address (not in Supabase → Auth → Redirect URLs), it isn't there.
    if (/code verifier/i.test(error.message)) {
      return loginRedirect(origin, "Sign-in came back to a different address than where it started. Please try again from this page.");
    }
    return loginRedirect(origin, "This sign-in link is invalid or has expired. Please try again.");
  }

  // Make sure the profile exists (social sign-ups) and pick up name/photo from the provider
  // when they're empty. Never creates duplicates and never changes the role.
  const { data: profile } = await supabase.rpc("ensure_profile");

  if (next) return NextResponse.redirect(new URL(next, origin));
  const home = profile?.role === "host" || profile?.role === "admin" ? "/dashboard" : "/account";
  return NextResponse.redirect(new URL(home, origin));
}
