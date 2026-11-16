import { json, requireUser } from "@/lib/api";

/**
 * POST /api/presence/offline — sent by the browser (navigator.sendBeacon) when a host
 * closes the tab or leaves the site, so they stop showing as "online" right away
 * instead of waiting for the heartbeat to expire.
 */
export async function POST() {
  const { supabase, user } = await requireUser();
  if (!user) return json({ ok: true });
  await supabase.rpc("host_presence", { p_online: false });
  return json({ ok: true });
}
