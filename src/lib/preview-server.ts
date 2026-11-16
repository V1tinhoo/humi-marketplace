import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DemoHostRow, DemoReviewRow, HostCategory, PreviewStatus } from "@/lib/demo";

type Untyped = {
  rpc: (fn: string, args?: object) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
  from: (t: string) => { select: (c: string) => { order: (c: string) => PromiseLike<{ data: unknown }> } };
};

/** Server-side preview data, read as the signed-in user (permissions are checked by the database). */
export async function previewClient() {
  const supabase = (await createSupabaseServerClient()) as unknown as Untyped | null;
  return supabase;
}

export async function getPreviewStatus(): Promise<PreviewStatus | null> {
  const supabase = await previewClient();
  if (!supabase) return null;
  const { data } = await supabase.rpc("preview_status");
  return ((data as PreviewStatus[] | null) ?? [])[0] ?? null;
}

export async function getPreviewHosts(): Promise<DemoHostRow[]> {
  const supabase = await previewClient();
  if (!supabase) return [];
  const { data } = await supabase.rpc("preview_hosts");
  return (data as DemoHostRow[] | null) ?? [];
}

export async function getPreviewHost(id: string): Promise<{ host: DemoHostRow | null; reviews: DemoReviewRow[] }> {
  const supabase = await previewClient();
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(id)) return { host: null, reviews: [] };
  const [h, r] = await Promise.all([supabase.rpc("preview_host", { p_id: id }), supabase.rpc("preview_reviews", { p_host: id })]);
  return { host: ((h.data as DemoHostRow[] | null) ?? [])[0] ?? null, reviews: (r.data as DemoReviewRow[] | null) ?? [] };
}

export async function getCategories(): Promise<HostCategory[]> {
  const supabase = await previewClient();
  if (!supabase) return [];
  const { data } = await supabase.from("host_categories").select("*").order("sort_order");
  return ((data as HostCategory[] | null) ?? []).filter((c) => c.is_active);
}
