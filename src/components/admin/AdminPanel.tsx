"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Banknote,
  Ban,
  Eye,
  EyeOff,
  Flag,
  LayoutGrid,
  PhoneCall,
  Power,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Wallet as WalletIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Container, Skeleton } from "@/components/ui/primitives";
import { FormError } from "@/components/ui/FormError";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, formatDuration, parseReaisToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useIntlLocale, useT } from "@/i18n/client";
import { useIsAdmin } from "@/lib/admin";

/* The admin functions aren't in the generated DB types: a tiny untyped RPC helper. */
type RpcResult<T> = { data: T | null; error: { message: string; code?: string } | null };
function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<RpcResult<T>> {
  const supabase = getSupabaseBrowserClient() as unknown as { rpc: (f: string, a?: object) => Promise<RpcResult<T>> };
  return supabase.rpc(fn, args);
}

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "payouts", label: "Withdrawals", icon: Banknote },
  { id: "reports", label: "Reports", icon: Flag },
  { id: "users", label: "Users", icon: Users },
  { id: "calls", label: "Calls", icon: PhoneCall },
  { id: "topups", label: "Top-ups", icon: WalletIcon },
  { id: "sources", label: "Sign-up sources", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "log", label: "Activity log", icon: Activity },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function AdminPanel() {
  const tr = useT();
  const isAdmin = useIsAdmin();
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (isAdmin === null) return <Container className="py-12"><Skeleton className="h-64" /></Container>;
  if (!isAdmin) {
    return (
      <Container className="grid min-h-[50vh] place-items-center py-20 text-center">
        <div>
          <ShieldCheck className="mx-auto size-8 text-plum-soft" />
          <h1 className="mt-4 text-2xl font-bold">{tr("Admins only")}</h1>
          <p className="mt-2 text-plum-soft">{tr("This area is only for HUMI administrators.")}</p>
        </div>
      </Container>
    );
  }

  return (
    <Container className="pb-24 pt-8">
      <p className="flex items-center gap-2 text-sm font-semibold text-plum-soft"><ShieldCheck className="size-4" /> {tr("Administration")}</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{tr("HUMI admin")}</h1>

      <nav className="no-scrollbar -mx-4 mt-6 flex gap-1 overflow-x-auto px-4 pb-1" aria-label={tr("Admin sections")}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition", tab === t.id ? "bg-plum text-white" : "text-plum-soft hover:bg-white hover:text-plum")}
          >
            <t.icon className="size-4" /> {tr(t.label)}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "overview" && <Overview />}
        {tab === "payouts" && <Payouts notify={setToast} />}
        {tab === "reports" && <Reports notify={setToast} />}
        {tab === "users" && <UsersTab notify={setToast} />}
        {tab === "calls" && <Calls />}
        {tab === "topups" && <Topups />}
        {tab === "sources" && <Sources />}
        {tab === "settings" && <SettingsTab notify={setToast} />}
        {tab === "log" && <Log />}
      </div>

      {toast && (
        <div role="status" className="fixed bottom-8 left-1/2 z-[70] -translate-x-1/2 animate-fade-up rounded-full bg-plum px-5 py-2.5 text-sm font-medium text-white shadow-lift">
          {toast}
        </div>
      )}
    </Container>
  );
}

/* ------------------------------------------------------------------ */

function Box({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] bg-white p-5 ring-1 ring-line sm:p-6">
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function useLoad<T>(fn: () => Promise<RpcResult<T>>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fn().then(({ data: d, error: e }) => {
      if (e) setError(e.message);
      else {
        setError(null);
        setData(d);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load };
}

function Overview() {
  const tr = useT();
  const { data, error } = useLoad<Record<string, number>>(() => rpc("admin_overview"));
  if (error) return <FormError message={error} />;
  if (!data) return <Skeleton className="h-48" />;
  const cards: [string, string, string?][] = [
    ["Users", String(data.users)],
    ["Hosts", `${data.hosts_published} / ${data.hosts}`, tr("published / total")],
    ["Online now", String(data.hosts_online)],
    ["Calls in progress", String(data.calls_live_now)],
    ["Calls today", String(data.calls_today), tr("{n} in total", { n: data.calls_total })],
    ["Minutes talked", String(data.minutes_total)],
    ["Revenue (real)", formatBRL(data.revenue_cents), tr("charged in calls")],
    ["HUMI commission", formatBRL(data.commission_cents)],
    ["Top-ups received", formatBRL(data.topups_cents)],
    ["Wallet balances", formatBRL(data.wallets_cents), tr("customers' money not spent yet")],
    ["Owed to hosts", formatBRL(data.host_owed_cents), tr("on hold + available")],
    ["Withdrawals to pay", formatBRL(data.payouts_open_cents), tr("{n} open", { n: data.payouts_open })],
    ["Open reports", String(data.reports_open)],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(([label, value, sub]) => (
        <div key={label} className="rounded-[var(--radius-card)] bg-white p-5 ring-1 ring-line">
          <p className="text-sm text-plum-soft">{tr(label)}</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight">{value}</p>
          {sub && <p className="text-xs text-plum-soft">{sub}</p>}
        </div>
      ))}
    </div>
  );
}

type Payout = { id: string; created_at: string; status: string; amount_cents: number; display_name: string; full_name: string; email: string; pix_key_type: string | null; pix_key: string | null };
function Payouts({ notify }: { notify: (s: string) => void }) {
  const tr = useT();
  const loc = useIntlLocale();
  const { data, error, reload } = useLoad<Payout[]>(() => rpc("admin_list_payouts"));
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (id: string, status: "processing" | "paid" | "failed") => {
    if (status !== "processing" && !confirm(status === "paid" ? tr("Mark as paid? Do this only after sending the Pix.") : tr("Mark as failed? The amount goes back to the host."))) return;
    setBusy(id + status);
    const { error: e } = await rpc("admin_update_payout", { p_payout_id: id, p_status: status });
    setBusy(null);
    if (e) return notify(tr(e.message));
    notify(tr("Withdrawal updated"));
    reload();
  };
  if (error) return <FormError message={error} />;
  if (!data) return <Skeleton className="h-48" />;
  return (
    <Box title={tr("Withdrawals")}>
      {data.length === 0 ? <p className="text-sm text-plum-soft">{tr("No withdrawals yet.")}</p> : (
        <ul className="divide-y divide-line">
          {data.map((p) => {
            const open = p.status === "requested" || p.status === "processing";
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.display_name} <span className="font-normal text-plum-soft">· {p.full_name} · {p.email}</span></p>
                  <p className="text-xs text-plum-soft">
                    {new Date(p.created_at).toLocaleString(loc, { dateStyle: "short", timeStyle: "short" })} · Pix ({p.pix_key_type ?? "?"}):{" "}
                    <span className="select-all font-mono text-plum">{p.pix_key ?? "—"}</span>
                  </p>
                </div>
                <span className="text-base font-bold">{formatBRL(p.amount_cents)}</span>
                <StatusPill status={p.status} />
                {open && (
                  <div className="flex gap-2">
                    {p.status === "requested" && <Button size="sm" variant="secondary" loading={busy === p.id + "processing"} onClick={() => act(p.id, "processing")}>{tr("Processing")}</Button>}
                    <Button size="sm" loading={busy === p.id + "paid"} onClick={() => act(p.id, "paid")}>{tr("Mark as paid")}</Button>
                    <Button size="sm" variant="ghost" loading={busy === p.id + "failed"} onClick={() => act(p.id, "failed")}>{tr("Failed")}</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Box>
  );
}

type Report = { id: string; created_at: string; status: string; reason: string; context: string; details: string | null; admin_note: string | null; reporter_name: string; reported_name: string; reported_email: string; reported_user_id: string };
const REASON_LABELS: Record<string, string> = {
  harassment: "Harassment or bullying",
  inappropriate_content: "Inappropriate behaviour",
  sexual_content: "Sexual content or requests",
  hate_speech: "Hate speech or discrimination",
  spam_or_scam: "Spam or scam",
  off_platform_payment: "Asked to pay or talk outside HUMI",
  underage: "May be under 18",
  safety_concern: "I'm worried about someone's safety",
  other: "Something else",
};
function Reports({ notify }: { notify: (s: string) => void }) {
  const tr = useT();
  const loc = useIntlLocale();
  const { data, error, reload } = useLoad<Report[]>(() => rpc("admin_list_reports"));
  const set = async (id: string, status: string) => {
    const note = status === "open" ? null : prompt(tr("Note for the team (optional)")) ?? null;
    const { error: e } = await rpc("admin_update_report", { p_report_id: id, p_status: status, p_note: note });
    if (e) return notify(tr(e.message));
    notify(tr("Report updated"));
    reload();
  };
  if (error) return <FormError message={error} />;
  if (!data) return <Skeleton className="h-48" />;
  return (
    <Box title={tr("Reports")}>
      {data.length === 0 ? <p className="text-sm text-plum-soft">{tr("No reports.")}</p> : (
        <ul className="divide-y divide-line">
          {data.map((r) => (
            <li key={r.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={r.status} />
                <span className="font-semibold">{tr(REASON_LABELS[r.reason] ?? r.reason)}</span>
                <span className="text-plum-soft">· {new Date(r.created_at).toLocaleString(loc, { dateStyle: "short", timeStyle: "short" })}</span>
              </div>
              <p className="mt-1">
                {tr("{reporter} reported {reported}", { reporter: r.reporter_name, reported: r.reported_name })} <span className="text-plum-soft">({r.reported_email})</span>
              </p>
              {r.details && <p className="mt-1 rounded-lg bg-cream px-3 py-2 text-plum">“{r.details}”</p>}
              {r.admin_note && <p className="mt-1 text-xs text-plum-soft">{tr("Team note")}: {r.admin_note}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {r.status !== "reviewing" && <Button size="sm" variant="secondary" onClick={() => set(r.id, "reviewing")}>{tr("Reviewing")}</Button>}
                {r.status !== "action_taken" && <Button size="sm" onClick={() => set(r.id, "action_taken")}>{tr("Action taken")}</Button>}
                {r.status !== "dismissed" && <Button size="sm" variant="ghost" onClick={() => set(r.id, "dismissed")}>{tr("Dismiss")}</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}

type Presence = { is_available: boolean; is_online: boolean; last_seen_at: string | null; forced_online_until?: string | null };
type AdminUser = {
  id: string; email: string; full_name: string; role: string; created_at: string; country: string | null; is_admin: boolean; banned: boolean;
  host_id: string | null; host_published: boolean | null; balance_cents: number; test_balance_cents: number; host_available_cents: number; reports_against: number;
};
function UsersTab({ notify }: { notify: (s: string) => void }) {
  const tr = useT();
  const loc = useIntlLocale();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const [error, setError] = useState<string | null>(null);
  const search = useCallback(async (term: string) => {
    const [{ data, error: e }, pr] = await Promise.all([
      rpc<AdminUser[]>("admin_list_users", { p_search: term || null, p_limit: 100 }),
      rpc<(Presence & { host_id: string })[]>("admin_hosts_presence"),
    ]);
    if (e) return setError(e.message);
    setError(null);
    setUsers(data ?? []);
    setPresence(Object.fromEntries((pr.data ?? []).map((p) => [p.host_id, p])));
  }, []);
  useEffect(() => {
    search("");
  }, [search]);

  const money = async (u: AdminUser, kind: "wallet" | "earnings") => {
    const amount = prompt(kind === "wallet" ? tr("Wallet adjustment in R$ (use - to remove), e.g. 10 or -5,50") : tr("Host earnings adjustment in R$ (use - to remove), e.g. 0,33"));
    if (!amount) return;
    const negative = amount.trim().startsWith("-");
    const cents = parseReaisToCents(amount.replace("-", "").trim());
    if (!cents) return notify(tr("Enter a valid amount, e.g. 35 or 35,50."));
    const reason = prompt(tr("Reason (shown in the activity log)"));
    if (!reason) return;
    const value = negative ? -cents : cents;
    const { error: e } =
      kind === "wallet"
        ? await rpc("admin_adjust_wallet", { p_user_id: u.id, p_amount_cents: value, p_reason: reason, p_test: false })
        : await rpc("admin_adjust_earnings", { p_host_id: u.host_id, p_amount_cents: value, p_reason: reason });
    if (e) return notify(tr(e.message));
    notify(tr("Adjustment saved"));
    search(q);
  };

  const setOffline = async (u: AdminUser) => {
    const { error: e } = await rpc("admin_set_host_available", { p_host_id: u.host_id, p_on: false });
    if (e) return notify(tr(e.message));
    notify(tr("{name} is now offline", { name: u.full_name }));
    search(q);
  };
  const [forceHours, setForceHours] = useState<Record<string, number>>({});
  const forceOnline = async (u: AdminUser) => {
    const hours = forceHours[u.host_id!] ?? 4;
    const { error: e } = await rpc("admin_force_host_online", { p_host_id: u.host_id, p_hours: hours });
    if (e) return notify(tr(e.message));
    notify(tr("{name} is online for {n} h", { name: u.full_name, n: hours }));
    search(q);
  };
  const time = (iso: string) => new Date(iso).toLocaleString(loc, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const toggleHost = async (u: AdminUser) => {
    const { error: e } = await rpc("admin_set_host_published", { p_host_id: u.host_id, p_published: !u.host_published });
    if (e) return notify(tr(e.message));
    notify(u.host_published ? tr("Host hidden from Explore") : tr("Host shown in Explore"));
    search(q);
  };
  const toggleBan = async (u: AdminUser) => {
    if (!confirm(u.banned ? tr("Unblock {name}?", { name: u.full_name }) : tr("Block {name}? They won't be able to log in.", { name: u.full_name }))) return;
    const res = await fetch(`/api/admin/users/${u.id}/ban`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ban: !u.banned }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return notify(tr(j.error ?? "Couldn't update this account."));
    notify(u.banned ? tr("Account unblocked") : tr("Account blocked"));
    search(q);
  };
  const toggleAdmin = async (u: AdminUser) => {
    if (!confirm(u.is_admin ? tr("Remove admin access from {name}?", { name: u.full_name }) : tr("Make {name} an admin? They'll be able to do everything here.", { name: u.full_name }))) return;
    const { error: e } = await rpc("admin_set_admin", { p_user_id: u.id, p_admin: !u.is_admin });
    if (e) return notify(tr(e.message));
    notify(tr("Admin access updated"));
    search(q);
  };

  return (
    <Box
      title={tr("Users")}
      action={
        <form onSubmit={(e) => { e.preventDefault(); search(q); }} className="flex h-10 items-center gap-2 rounded-full bg-cream px-3 ring-1 ring-line">
          <Search className="size-4 text-plum-soft" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Name or email")} aria-label={tr("Search users")} className="w-48 bg-transparent text-sm outline-none" />
        </form>
      }
    >
      <FormError message={error} />
      {!users ? <Skeleton className="h-48" /> : users.length === 0 ? <p className="text-sm text-plum-soft">{tr("No users found.")}</p> : (
        <ul className="divide-y divide-line">
          {users.map((u) => (
            <li key={u.id} className="flex flex-col gap-3 py-3 text-sm lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {u.full_name}
                  <span className="ml-2 rounded-full bg-lilac px-2 py-0.5 text-[11px] font-semibold">{u.role === "host" ? tr("Host") : u.role === "admin" ? "Admin" : tr("Member")}</span>
                  {u.is_admin && <span className="ml-1 rounded-full bg-plum px-2 py-0.5 text-[11px] font-semibold text-white">Admin</span>}
                  {u.banned && <span className="ml-1 rounded-full bg-[#fde8ea] px-2 py-0.5 text-[11px] font-semibold text-[#7a2232]">{tr("Blocked")}</span>}
                  {u.reports_against > 0 && <span className="ml-1 rounded-full bg-blush px-2 py-0.5 text-[11px] font-semibold">{tr("{n} reports", { n: u.reports_against })}</span>}
                  {u.host_id && presence[u.host_id]?.forced_online_until && (
                    <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-online/10 px-2 py-0.5 text-[11px] font-semibold text-online">
                      <span className="size-1.5 rounded-full bg-online" /> {tr("Online until {time}", { time: time(presence[u.host_id].forced_online_until!) })}
                    </span>
                  )}
                  {u.host_id && presence[u.host_id] && !presence[u.host_id].forced_online_until && (
                    presence[u.host_id].is_online ? (
                      <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-online/10 px-2 py-0.5 text-[11px] font-semibold text-online"><span className="size-1.5 rounded-full bg-online" /> {tr("Online now")}</span>
                    ) : presence[u.host_id].is_available ? (
                      <span className="ml-1 rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold text-plum-soft ring-1 ring-line" title={tr("Online switch is on, but the host doesn't have the site open")}>{tr("On, away from the site")}</span>
                    ) : (
                      <span className="ml-1 rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold text-plum-soft ring-1 ring-line">{tr("Offline")}</span>
                    )
                  )}
                </p>
                <p className="truncate text-xs text-plum-soft">{u.email} · {tr("since {date}", { date: new Date(u.created_at).toLocaleDateString(loc) })}</p>
                <p className="text-xs text-plum-soft">
                  {tr("Wallet")}: <b className="text-plum">{formatBRL(u.balance_cents)}</b>
                  {u.test_balance_cents > 0 && <> + {formatBRL(u.test_balance_cents)} {tr("test")}</>}
                  {u.host_id && <> · {tr("Available to withdraw")}: <b className="text-plum">{formatBRL(u.host_available_cents)}</b></>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => money(u, "wallet")}><WalletIcon className="size-3.5" /> {tr("Wallet")}</Button>
                {u.host_id && <Button size="sm" variant="secondary" onClick={() => money(u, "earnings")}><Banknote className="size-3.5" /> {tr("Earnings")}</Button>}
                {u.host_id && (
                  <span className="inline-flex items-center overflow-hidden rounded-full ring-1 ring-line">
                    <select
                      value={forceHours[u.host_id] ?? 4}
                      onChange={(e) => setForceHours((m) => ({ ...m, [u.host_id!]: Number(e.target.value) }))}
                      aria-label={tr("For how long")}
                      className="h-8 bg-white pl-2.5 text-xs font-semibold outline-none"
                    >
                      {[1, 4, 12, 24].map((n) => <option key={n} value={n}>{n} h</option>)}
                    </select>
                    <button type="button" onClick={() => forceOnline(u)} className="inline-flex h-8 items-center gap-1 bg-online/10 px-3 text-xs font-semibold text-online hover:bg-online/20">
                      <Power className="size-3.5" /> {tr("Set online")}
                    </button>
                  </span>
                )}
                {u.host_id && (presence[u.host_id]?.is_available || presence[u.host_id]?.forced_online_until) && (
                  <Button size="sm" variant="secondary" onClick={() => setOffline(u)}><Power className="size-3.5" /> {tr("Set offline")}</Button>
                )}
                {u.host_id && (
                  <Button size="sm" variant="secondary" onClick={() => toggleHost(u)}>
                    {u.host_published ? <><EyeOff className="size-3.5" /> {tr("Hide")}</> : <><Eye className="size-3.5" /> {tr("Show")}</>}
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => toggleAdmin(u)}><ShieldCheck className="size-3.5" /> {u.is_admin ? tr("Remove admin") : tr("Make admin")}</Button>
                <Button size="sm" variant="ghost" onClick={() => toggleBan(u)}><Ban className="size-3.5" /> {u.banned ? tr("Unblock") : tr("Block")}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}

type Call = { id: string; created_at: string; status: string; call_type: string; livemode: boolean; customer_name: string; host_name: string; billed_seconds: number; charged_cents: number; host_earnings_cents: number; platform_fee_cents: number; end_reason: string | null };
function Calls() {
  const tr = useT();
  const loc = useIntlLocale();
  const { data, error } = useLoad<Call[]>(() => rpc("admin_list_calls", { p_limit: 150 }));
  if (error) return <FormError message={error} />;
  if (!data) return <Skeleton className="h-48" />;
  return (
    <Box title={tr("Calls")}>
      {data.length === 0 ? <p className="text-sm text-plum-soft">{tr("No calls yet.")}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-xs text-plum-soft">
              <th className="py-2">{tr("Date")}</th><th>{tr("Guest")}</th><th>Host</th><th>{tr("Time")}</th><th>{tr("Total")}</th><th>Host</th><th>HUMI</th><th>{tr("Status")}</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {data.map((c) => (
                <tr key={c.id}>
                  <td className="py-2">{new Date(c.created_at).toLocaleString(loc, { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>{c.customer_name}</td>
                  <td>{c.host_name}</td>
                  <td>{formatDuration(c.billed_seconds)}</td>
                  <td className="font-semibold">{formatBRL(c.charged_cents)}{!c.livemode && <span className="ml-1 text-[10px] uppercase text-plum-soft">{tr("test")}</span>}</td>
                  <td>{formatBRL(c.host_earnings_cents)}</td>
                  <td>{formatBRL(c.platform_fee_cents)}</td>
                  <td><StatusPill status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Box>
  );
}

type Topup = { id: string; created_at: string; status: string; amount_cents: number; method: string | null; provider: string; livemode: boolean; user_name: string; user_email: string };
function Topups() {
  const tr = useT();
  const loc = useIntlLocale();
  const { data, error } = useLoad<Topup[]>(() => rpc("admin_list_topups", { p_limit: 150 }));
  if (error) return <FormError message={error} />;
  if (!data) return <Skeleton className="h-48" />;
  return (
    <Box title={tr("Top-ups")}>
      {data.length === 0 ? <p className="text-sm text-plum-soft">{tr("No top-ups yet.")}</p> : (
        <ul className="divide-y divide-line">
          {data.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
              <span className="w-32 text-plum-soft">{new Date(t.created_at).toLocaleString(loc, { dateStyle: "short", timeStyle: "short" })}</span>
              <span className="min-w-0 flex-1 truncate">{t.user_name} <span className="text-plum-soft">· {t.user_email}</span></span>
              <span className="text-plum-soft">{t.method === "card" ? tr("Card") : "Pix"}{!t.livemode && ` · ${tr("test")}`}</span>
              <span className="font-semibold">{formatBRL(t.amount_cents)}</span>
              <StatusPill status={t.status} />
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}

type Source = { source: string; campaign: string; signups: number; paying: number };
function Sources() {
  const tr = useT();
  const [days, setDays] = useState(30);
  return (
    <Box
      title={tr("Where new users came from")}
      action={
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-lg bg-white px-2 text-sm ring-1 ring-line">
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>{tr("Last {n} days", { n: d })}</option>)}
        </select>
      }
    >
      <SourcesTable key={days} days={days} />
    </Box>
  );
}
function SourcesTable({ days }: { days: number }) {
  const tr = useT();
  const { data, error } = useLoad<Source[]>(() => rpc("admin_signup_sources", { p_days: days }));
  const total = (data ?? []).reduce((a, r) => a + Number(r.signups), 0);
  return (
    <>
      {error ? <FormError message={error} /> : !data ? <Skeleton className="h-32" /> : data.length === 0 ? (
        <p className="text-sm text-plum-soft">{tr("No sign-ups in this period.")}</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          <li className="flex gap-3 pb-2 text-xs font-semibold text-plum-soft">
            <span className="flex-1">{tr("Source")} · {tr("Campaign")}</span>
            <span className="w-20 text-right">{tr("Sign-ups")}</span>
            <span className="w-24 text-right">{tr("Paid a top-up")}</span>
          </li>
          {data.map((r) => (
            <li key={r.source + r.campaign} className="flex gap-3 py-2">
              <span className="min-w-0 flex-1 truncate font-semibold">
                {r.source === "direct" ? tr("Direct / unknown") : r.source === "referral" ? tr("Referral") : r.source}
                {r.campaign && <span className="font-normal text-plum-soft"> · {r.campaign}</span>}
              </span>
              <span className="w-20 text-right">{r.signups} <span className="text-xs text-plum-soft">({Math.round((Number(r.signups) / total) * 100)}%)</span></span>
              <span className="w-24 text-right">{r.paying}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* Friendly labels and units for platform settings. */
const SETTINGS: Record<string, { label: string; unit: "brl" | "percent" | "seconds" | "days" | "toggle" | "count" }> = {
  commission_bps: { label: "HUMI commission", unit: "percent" },
  price_min_cents_per_minute: { label: "Minimum price per minute", unit: "brl" },
  price_max_cents_per_minute: { label: "Maximum price per minute", unit: "brl" },
  topup_min_cents: { label: "Minimum top-up", unit: "brl" },
  topup_max_cents: { label: "Maximum top-up", unit: "brl" },
  payout_min_cents: { label: "Minimum withdrawal", unit: "brl" },
  earnings_hold_days: { label: "Holding period for host earnings", unit: "days" },
  call_min_start_seconds: { label: "Balance needed to start a call", unit: "seconds" },
  call_grace_seconds: { label: "Connection drop tolerance", unit: "seconds" },
  call_ring_timeout_seconds: { label: "Ringing time limit", unit: "seconds" },
  allow_test_calls: { label: "Allow calls paid with test balance", unit: "toggle" },
  first_topup_bonus_cents: { label: "First top-up bonus (0 = off)", unit: "brl" },
  first_topup_bonus_min_cents: { label: "Minimum top-up for the bonus", unit: "brl" },
  referral_bonus_cents: { label: "Referral credit per friend (0 = off)", unit: "brl" },
  auto_suspend_reports: { label: "Reports from different people (7 days) that suspend an account (0 = off)", unit: "count" },
  declined_call_limit: { label: "Declined calls in a row before a 24 h pause (0 = off)", unit: "count" },
  package_1_minutes: { label: "Package 1: minutes (0 = off)", unit: "count" },
  package_1_discount_bps: { label: "Package 1: discount", unit: "percent" },
  package_2_minutes: { label: "Package 2: minutes (0 = off)", unit: "count" },
  package_2_discount_bps: { label: "Package 2: discount", unit: "percent" },
  package_3_minutes: { label: "Package 3: minutes (0 = off)", unit: "count" },
  package_3_discount_bps: { label: "Package 3: discount", unit: "percent" },
  package_validity_days: { label: "Package validity (unused minutes go back to the wallet)", unit: "days" },
  package_renewal_days: { label: "Days between monthly package renewals", unit: "days" },
};
const toInput = (unit: string, v: number) => (unit === "brl" ? (v / 100).toFixed(2).replace(".", ",") : unit === "percent" ? String(v / 100).replace(".", ",") : String(v));
const fromInput = (unit: string, s: string) => {
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return unit === "brl" ? Math.round(n * 100) : unit === "percent" ? Math.round(n * 100) : Math.round(n);
};

function SettingsTab({ notify }: { notify: (s: string) => void }) {
  const tr = useT();
  const { data, error, reload } = useLoad<{ key: string; value: number; description: string }[]>(() => rpc("admin_list_settings"));
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = async (key: string, unit: string, raw: string) => {
    const value = unit === "toggle" ? Number(raw) : fromInput(unit, raw);
    if (value == null) return notify(tr("Invalid value for this setting."));
    const { error: e } = await rpc("admin_set_setting", { p_key: key, p_value: value });
    if (e) return notify(tr(e.message));
    notify(tr("Setting saved"));
    setDraft((d) => ({ ...d, [key]: "" }));
    reload();
  };
  if (error) return <FormError message={error} />;
  if (!data) return <Skeleton className="h-48" />;
  return (
    <Box title={tr("Settings")}>
      <ul className="divide-y divide-line">
        {data.filter((s) => SETTINGS[s.key]).map((s) => {
          const meta = SETTINGS[s.key];
          const unitLabel = meta.unit === "brl" ? "R$" : meta.unit === "percent" ? "%" : meta.unit === "days" ? tr("days") : meta.unit === "seconds" ? tr("seconds") : "";
          return (
            <li key={s.key} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{tr(meta.label)}</p>
                <p className="text-xs text-plum-soft">{tr("Now")}: {meta.unit === "toggle" ? (s.value === 1 ? tr("On") : tr("Off")) : `${meta.unit === "brl" ? "R$ " : ""}${toInput(meta.unit, s.value)}${meta.unit === "brl" ? "" : ` ${unitLabel}`}`}</p>
              </div>
              {meta.unit === "toggle" ? (
                <Button size="sm" variant="secondary" onClick={() => save(s.key, "toggle", String(s.value === 1 ? 0 : 1))}>{s.value === 1 ? tr("Turn off") : tr("Turn on")}</Button>
              ) : (
                <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); save(s.key, meta.unit, draft[s.key] ?? ""); }}>
                  <div className="flex h-10 w-36 items-center rounded-xl bg-cream px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-lavender">
                    {meta.unit === "brl" && <span className="text-xs text-plum-soft">R$</span>}
                    <input
                      inputMode="decimal"
                      value={draft[s.key] ?? ""}
                      placeholder={toInput(meta.unit, s.value)}
                      onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                      aria-label={tr(meta.label)}
                      className="h-full min-w-0 flex-1 bg-transparent px-1.5 outline-none"
                    />
                    {meta.unit !== "brl" && <span className="text-xs text-plum-soft">{unitLabel}</span>}
                  </div>
                  <Button size="sm" type="submit" disabled={!draft[s.key]}>{tr("Save")}</Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </Box>
  );
}

type LogRow = { id: number; created_at: string; admin_name: string | null; action: string; target: string | null; details: Record<string, unknown> };
function Log() {
  const tr = useT();
  const loc = useIntlLocale();
  const { data, error } = useLoad<LogRow[]>(() => rpc("admin_list_actions", { p_limit: 200 }));
  if (error) return <FormError message={error} />;
  if (!data) return <Skeleton className="h-48" />;
  return (
    <Box title={tr("Activity log")}>
      {data.length === 0 ? <p className="text-sm text-plum-soft">{tr("Nothing yet.")}</p> : (
        <ul className="divide-y divide-line text-sm">
          {data.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-3 py-2">
              <span className="w-32 text-plum-soft">{new Date(a.created_at).toLocaleString(loc, { dateStyle: "short", timeStyle: "short" })}</span>
              <span className="font-semibold">{a.admin_name ?? "SQL"}</span>
              <span>{a.action === "auto_suspend" ? tr("Automatic suspension (reports)") : a.action}</span>
              <span className="min-w-0 flex-1 truncate text-plum-soft">{Object.keys(a.details ?? {}).length ? JSON.stringify(a.details) : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}

const PILL: Record<string, string> = {
  requested: "bg-blush", processing: "bg-lilac", paid: "bg-online/10 text-online", failed: "bg-[#fde8ea] text-[#7a2232]", canceled: "bg-cream",
  open: "bg-blush", reviewing: "bg-lilac", action_taken: "bg-online/10 text-online", dismissed: "bg-cream",
  ringing: "bg-lilac", connected: "bg-online/10 text-online", ended: "bg-cream", pending: "bg-blush", approved: "bg-online/10 text-online", declined: "bg-[#fde8ea] text-[#7a2232]", refunded: "bg-lilac",
};
const PILL_LABEL: Record<string, string> = {
  requested: "Requested", processing: "Processing", paid: "Paid", failed: "Failed", canceled: "Canceled",
  open: "Open", reviewing: "Reviewing", action_taken: "Action taken", dismissed: "Dismissed",
  ringing: "Ringing", connected: "In progress", ended: "Ended", pending: "Pending", approved: "Approved", declined: "Declined", refunded: "Refunded",
};
function StatusPill({ status }: { status: string }) {
  const tr = useT();
  return <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold text-plum", PILL[status] ?? "bg-cream")}>{tr(PILL_LABEL[status] ?? status)}</span>;
}
