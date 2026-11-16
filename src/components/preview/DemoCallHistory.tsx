"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, formatDuration } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useIntlLocale, useT } from "@/i18n/client";
import { pct } from "@/lib/demo";

type Row = {
  id: string; host_id: string | null; host_name: string; user_email: string; call_type: "audio" | "video"; status: string; end_reason: string | null;
  created_at: string; connected_at: string | null; ended_at: string | null; billed_seconds: number; price_cents_per_minute: number;
  charged_cents: number; host_cents: number; platform_cents: number; commission_bps: number;
};
type Rpc = { rpc: (f: string, a?: object) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

const STATUS: Record<string, string> = {
  ended: "Ended", failed: "Didn't connect", connected: "In progress", reconnecting: "Reconnecting", ringing: "Ringing",
};

/** History of simulated calls. `all` (admins) shows everyone's; otherwise your own. */
export function DemoCallHistory({ all = false, hosts }: { all?: boolean; hosts: { id: string; name: string }[] }) {
  const tr = useT();
  const loc = useIntlLocale();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [host, setHost] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient() as unknown as Rpc | null;
    if (!supabase) return;
    setRows(null);
    const { data, error: err } = await supabase.rpc("demo_call_history", {
      p_host: host || null, p_type: type || null, p_from: from || null, p_to: to || null, p_all: all,
    });
    if (err) return setError(err.message);
    setError(null);
    setRows((data as Row[] | null) ?? []);
  }, [host, type, from, to, all]);

  useEffect(() => {
    load();
  }, [load]);

  const total = (rows ?? []).reduce((a, r) => ({ c: a.c + Number(r.charged_cents), h: a.h + Number(r.host_cents), p: a.p + Number(r.platform_cents), s: a.s + r.billed_seconds }), { c: 0, h: 0, p: 0, s: 0 });
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—");
  const input = "h-10 rounded-xl bg-white px-3 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-lavender";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <select value={host} onChange={(e) => setHost(e.target.value)} className={input} aria-label={tr("Host")}>
          <option value="">{tr("All hosts")}</option>
          {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className={input} aria-label={tr("Type")}>
          <option value="">{tr("Audio and video")}</option>
          <option value="audio">{tr("Audio")}</option>
          <option value="video">{tr("Video")}</option>
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} aria-label={tr("From")} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} aria-label={tr("To")} />
      </div>

      {error && <p className="mt-4 text-sm text-[#a3324a]">{tr(error)}</p>}
      {!rows ? (
        <div className="grid h-32 place-items-center"><Loader2 className="size-5 animate-spin text-plum-soft" /></div>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-plum-soft">{tr("No test calls yet.")}</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [tr("Calls"), String(rows.length)],
              [tr("Spent (simulated)"), formatBRL(total.c)],
              [tr("Host earnings (simulated)"), formatBRL(total.h)],
              [tr("HUMI commission (simulated)"), formatBRL(total.p)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-white p-3.5 ring-1 ring-line"><p className="text-xs text-plum-soft">{l}</p><p className="mt-0.5 text-lg font-extrabold">{v}</p></div>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-line text-xs text-plum-soft">
                <tr>
                  {[tr("Host"), ...(all ? [tr("Test user")] : []), tr("Type"), tr("Date"), tr("Start"), tr("End"), tr("Duration"), tr("Price/min"), tr("Spent"), tr("Host"), tr("HUMI"), tr("Status")].map((h, i) => (
                    <th key={i} className="px-3 py-2.5 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2.5 font-semibold">{r.host_name}</td>
                    {all && <td className="max-w-[180px] truncate px-3 py-2.5 text-plum-soft">{r.user_email}</td>}
                    <td className="px-3 py-2.5">{r.call_type === "video" ? tr("Video") : tr("Audio")}</td>
                    <td className="px-3 py-2.5">{new Date(r.created_at).toLocaleDateString(loc)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{time(r.connected_at ?? r.created_at)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{time(r.ended_at)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{formatDuration(r.billed_seconds)}</td>
                    <td className="px-3 py-2.5">{formatBRL(r.price_cents_per_minute)}</td>
                    <td className="px-3 py-2.5 font-semibold">{formatBRL(r.charged_cents)}</td>
                    <td className="px-3 py-2.5">{formatBRL(r.host_cents)} <span className="text-xs text-plum-soft">({pct(10000 - r.commission_bps)})</span></td>
                    <td className="px-3 py-2.5">{formatBRL(r.platform_cents)} <span className="text-xs text-plum-soft">({pct(r.commission_bps)})</span></td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", r.status === "ended" ? "bg-online/10 text-online" : r.status === "failed" ? "bg-cream" : "bg-lilac")}>
                        {tr(STATUS[r.status] ?? r.status)}
                      </span>
                      {r.end_reason === "insufficient_funds" && <span className="ml-1 text-[11px] text-plum-soft">· {tr("no balance")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-plum-soft">{tr("Simulated calls only. They never charge, pay or count in HUMI's real figures.")}</p>
        </>
      )}
    </div>
  );
}
