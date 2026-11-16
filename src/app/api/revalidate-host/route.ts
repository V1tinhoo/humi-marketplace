import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Called by the host dashboard after a host changes something public (online status,
 * listing, profile, price, availability) so cached marketplace pages refresh immediately
 * instead of after the 60 s revalidation window. Only refreshes the caller's own pages.
 */
export async function POST() {
  if (!isSupabaseConfigured) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  // RLS: a user can only read their own host profile.
  const { data: host } = await supabase.from("host_profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!host) return NextResponse.json({ ok: false }, { status: 404 });

  revalidatePath("/");
  revalidatePath("/explore");
  revalidatePath(`/hosts/${host.id}`);
  revalidatePath(`/book/${host.id}`);
  return NextResponse.json({ ok: true });
}
