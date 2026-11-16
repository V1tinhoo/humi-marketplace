"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Whether the signed-in person is a HUMI admin (null while checking). Only decides what
 * to SHOW: every admin action is checked again in the database (is_admin()).
 */
export function useIsAdmin(enabled = true) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient() as unknown as { rpc: (f: string) => Promise<{ data: boolean | null }> } | null;
    if (!enabled || !supabase) return setIsAdmin(false);
    supabase.rpc("am_i_admin").then(({ data }) => setIsAdmin(Boolean(data)), () => setIsAdmin(false));
  }, [enabled]);
  return isAdmin;
}
