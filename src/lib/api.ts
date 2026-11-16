/** Small helpers for API route handlers. */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

/** Error response without leaking internals; details go to the server log. */
export function fail(status: number, message: string, logDetail?: unknown) {
  if (logDetail) console.error("[api]", message, logDetail instanceof Error ? logDetail.message : logDetail);
  return NextResponse.json({ error: message }, { status });
}

/** The signed-in user (validated with Supabase Auth) and a client acting as them (RLS applies). */
export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Maps Postgres raise messages (P0001) to friendly API errors. */
export function dbError(error: { code?: string; message: string } | null, fallback: string) {
  if (!error) return fallback;
  return error.code === "P0001" ? error.message : fallback;
}
