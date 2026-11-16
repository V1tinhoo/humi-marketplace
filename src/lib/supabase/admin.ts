/**
 * SERVER-ONLY Supabase client with the service_role key.
 * Used exclusively by API route handlers for money operations that clients may never
 * run themselves (billing ticks, confirming top-ups). The key has no NEXT_PUBLIC_ prefix,
 * so Next.js never ships it to the browser. Never import this from a client component.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { SUPABASE_URL } from "./config";

export const isAdminConfigured = Boolean(SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export function createSupabaseAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server.");
  return createClient<Database>(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
