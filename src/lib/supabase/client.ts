"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

export type HumiClient = SupabaseClient<Database>;

let browserClient: HumiClient | null = null;

/** Browser client (anon key + user session from cookies). Returns null in demo mode. */
export function getSupabaseBrowserClient(): HumiClient | null {
  if (!isSupabaseConfigured) return null;
  browserClient ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  return browserClient;
}
