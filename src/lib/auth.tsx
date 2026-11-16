"use client";

/**
 * Authentication context with two backends behind one API:
 *  - "supabase": real email/password auth (Supabase Auth). Session lives in cookies
 *    managed by @supabase/ssr, so it persists across reloads and is visible to middleware.
 *  - "demo": the original local mock (no server), used when Supabase env vars are missing.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DemoBooking, DemoUser, UserRole } from "@/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured, siteUrl } from "@/lib/supabase/config";

export type OAuthProvider = "google" | "apple";
export const PROVIDER_NAMES: Record<OAuthProvider, string> = { google: "Google", apple: "Apple" };

/**
 * Asks Supabase Auth (public settings endpoint) whether a provider is switched on,
 * so people get a clear message instead of a raw JSON error page from Supabase.
 * Returns null if the check itself couldn't run (then we just try).
 */
async function isProviderEnabled(provider: OAuthProvider): Promise<boolean | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
    if (!res.ok) return null;
    const json = (await res.json()) as { external?: Record<string, boolean> };
    return Boolean(json.external?.[provider]);
  } catch {
    return null;
  }
}

export type AppUser = Omit<DemoUser, "role"> & { role: UserRole | "admin"; avatarUrl?: string | null };
type Outcome = { error?: string };

const USER_KEY = "humi.demo.user";
const BOOKINGS_KEY = "humi.demo.bookings";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — demo state stays in memory */
  }
}

/** Turns Supabase Auth errors into copy people can act on. */
export function authErrorMessage(message?: string) {
  if (!message) return "Something went wrong. Please try again.";
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match.";
  if (m.includes("email not confirmed")) return "Please confirm your email first — check your inbox for the link.";
  if (m.includes("already registered") || m.includes("already been registered")) return "An account with this email already exists. Try logging in.";
  if (m.includes("password should be") || m.includes("weak")) return "Please choose a stronger password (at least 8 characters).";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("failed to fetch") || m.includes("network")) return "We couldn't reach the server. Check your connection.";
  return message;
}

interface AuthContextValue {
  mode: "demo" | "supabase";
  user: AppUser | null;
  ready: boolean;
  signIn: (email: string, password: string, demoRole?: UserRole) => Promise<Outcome & { user?: AppUser }>;
  signUp: (data: { name: string; email: string; password: string; role: UserRole }) => Promise<Outcome & { user?: AppUser; needsConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<Outcome>;
  /** Starts Google/Apple sign-in. On success the browser leaves the page; only errors return. */
  signInWithProvider: (provider: OAuthProvider, next?: string) => Promise<Outcome>;
  updatePassword: (password: string) => Promise<Outcome>;
  updateUser: (patch: Partial<Pick<DemoUser, "name">>) => Promise<Outcome>;
  refreshProfile: () => Promise<void>;
  /** Demo mode only — real bookings live in Supabase. */
  bookings: DemoBooking[];
  addBooking: (b: DemoBooking) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabaseBrowserClient();
  const mode = isSupabaseConfigured ? "supabase" : "demo";
  const [user, setUser] = useState<AppUser | null>(null);
  const [bookings, setBookings] = useState<DemoBooking[]>([]);
  const [ready, setReady] = useState(false);

  const loadProfile = useCallback(
    async (authUser: { id: string; email?: string; created_at: string } | null) => {
      if (!supabase || !authUser) {
        setUser(null);
        return null;
      }
      let { data } = await supabase.from("profiles").select("full_name, role, created_at, avatar_url").eq("id", authUser.id).maybeSingle();
      if (!data) {
        // Account created before the schema existed (or trigger missing): recreate the profile server-side.
        const { data: healed } = await supabase.rpc("ensure_profile");
        if (healed) data = { full_name: healed.full_name, role: healed.role, created_at: healed.created_at, avatar_url: healed.avatar_url };
      }
      const u: AppUser = {
        id: authUser.id,
        email: authUser.email ?? "",
        name: data?.full_name || authUser.email?.split("@")[0] || "Member",
        role: data?.role ?? "customer",
        createdAt: data?.created_at ?? authUser.created_at,
        avatarUrl: data?.avatar_url ?? null,
      };
      setUser(u);
      return u;
    },
    [supabase],
  );

  useEffect(() => {
    if (!supabase) {
      setUser(read<DemoUser | null>(USER_KEY, null));
      setBookings(read<DemoBooking[]>(BOOKINGS_KEY, []));
      setReady(true);
      return;
    }
    let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      await loadProfile(data.user);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") setUser(null);
      else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        // Defer: Supabase recommends not awaiting other calls inside this callback.
        setTimeout(() => loadProfile(session?.user ?? null), 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  /* ---------------- demo helpers ---------------- */
  const demoSignUp = useCallback(({ name, email, role }: { name: string; email: string; role: UserRole }) => {
    const u: AppUser = { id: crypto.randomUUID(), name, email, role, createdAt: new Date().toISOString() };
    setUser(u);
    write(USER_KEY, u);
    return u;
  }, []);

  /* ---------------- public API ---------------- */
  const signIn = useCallback<AuthContextValue["signIn"]>(
    async (email, password, demoRole = "customer") => {
      if (!supabase) {
        const existing = read<AppUser | null>(USER_KEY, null);
        if (existing && existing.email.toLowerCase() === email.toLowerCase()) {
          setUser(existing);
          return { user: existing };
        }
        const name = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        return { user: demoSignUp({ name, email, role: demoRole }) };
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: authErrorMessage(error.message) };
      const u = await loadProfile(data.user);
      return { user: u ?? undefined };
    },
    [supabase, loadProfile, demoSignUp],
  );

  const signUp = useCallback<AuthContextValue["signUp"]>(
    async ({ name, email, password, role }) => {
      if (!supabase) return { user: demoSignUp({ name, email, role }) };
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Read by the handle_new_user() trigger to create the profile (role is limited to customer/host there).
          data: { full_name: name, role },
          emailRedirectTo: `${siteUrl()}/auth/callback?next=${role === "host" ? "/become-a-host/apply" : "/explore"}`,
        },
      });
      if (error) return { error: authErrorMessage(error.message) };
      // With email confirmation on, there's no session until the link is clicked.
      if (!data.session) return { needsConfirmation: true };
      const u = await loadProfile(data.user);
      return { user: u ?? undefined };
    },
    [supabase, loadProfile, demoSignUp],
  );

  const signOut = useCallback(async () => {
    if (supabase) {
      // Hosts go offline immediately instead of waiting for the heartbeat to expire.
      if (user?.role === "host" || user?.role === "admin") await supabase.rpc("host_presence", { p_online: false });
      await supabase.auth.signOut();
    }
    else write(USER_KEY, null);
    setUser(null);
  }, [supabase, user?.role]);

  // Presence heartbeat: while a host has HUMI open, tell the server every 30 s.
  // The public "Online" badge needs the switch ON *and* a heartbeat in the last 90 s.
  // Closing the tab / leaving the site also sends an "offline" beacon so it's immediate;
  // if that can't be sent (crash, lost connection) the 90 s window covers it.
  const isHost = user?.role === "host" || user?.role === "admin";
  useEffect(() => {
    if (!supabase || !isHost) return;
    const beat = () => {
      supabase.rpc("host_presence", { p_online: true }).then(() => {}, () => {});
    };
    beat();
    const timer = setInterval(beat, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    // pagehide fires when the tab closes or the browser leaves the site (not on in-app navigation).
    const onLeave = () => {
      try {
        navigator.sendBeacon("/api/presence/offline");
      } catch {
        /* best effort: the 90 s window still applies */
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onLeave);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [supabase, isHost]);

  const signInWithProvider = useCallback<AuthContextValue["signInWithProvider"]>(
    async (provider, next) => {
      const name = PROVIDER_NAMES[provider];
      if (!supabase) return { error: `${name} sign-in needs Supabase. It isn't available in demo mode.` };
      if ((await isProviderEnabled(provider)) === false) {
        return { error: `${name} sign-in isn't switched on yet. Please use email for now.` };
      }
      const callback = new URL("/auth/callback", siteUrl());
      if (next) callback.searchParams.set("next", next);
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callback.toString(),
          // Google: always show the account chooser, so people can pick the right account.
          queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
        },
      });
      return error ? { error: authErrorMessage(error.message) } : {};
    },
    [supabase],
  );

  const requestPasswordReset = useCallback<AuthContextValue["requestPasswordReset"]>(
    async (email) => {
      if (!supabase) return {};
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
      });
      return error ? { error: authErrorMessage(error.message) } : {};
    },
    [supabase],
  );

  const updatePassword = useCallback<AuthContextValue["updatePassword"]>(
    async (password) => {
      if (!supabase) return { error: "Password changes need a real account (Supabase is not configured)." };
      const { error } = await supabase.auth.updateUser({ password });
      return error ? { error: authErrorMessage(error.message) } : {};
    },
    [supabase],
  );

  const updateUser = useCallback<AuthContextValue["updateUser"]>(
    async (patch) => {
      if (!user) return { error: "Not signed in." };
      if (supabase && patch.name !== undefined) {
        const { error } = await supabase.from("profiles").update({ full_name: patch.name }).eq("id", user.id);
        if (error) return { error: error.message };
      }
      const next = { ...user, ...patch };
      setUser(next);
      if (!supabase) write(USER_KEY, next);
      return {};
    },
    [supabase, user],
  );

  const refreshProfile = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    await loadProfile(data.user);
  }, [supabase, loadProfile]);

  const addBooking = useCallback((b: DemoBooking) => {
    setBookings((prev) => {
      const next = [b, ...prev];
      write(BOOKINGS_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ mode, user, ready, signIn, signUp, signOut, requestPasswordReset, signInWithProvider, updatePassword, updateUser, refreshProfile, bookings, addBooking }),
    [mode, user, ready, signIn, signUp, signOut, requestPasswordReset, signInWithProvider, updatePassword, updateUser, refreshProfile, bookings, addBooking],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
