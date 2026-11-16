"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, Pencil, Plus, Shuffle, Star, Trash2, UserPlus, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, parseReaisToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/i18n/client";
import { DemoCallHistory } from "@/components/preview/DemoCallHistory";
import type { DemoHostRow, DemoReviewRow, HostCategory } from "@/lib/demo";

type Res<T = unknown> = { data: T | null; error: { message: string } | null };
type Q = PromiseLike<Res> & {
  select: (c?: string) => Q; eq: (c: string, v: unknown) => Q; order: (c: string, o?: object) => Q; single: () => Q;
};
type Db = {
  rpc: (f: string, a?: object) => PromiseLike<Res>;
  from: (t: string) => { select: (c: string) => Q; insert: (v: object) => Q; update: (v: object) => Q; delete: () => Q };
};
const db = () => getSupabaseBrowserClient() as unknown as Db;

const AVATAR = (seed: string) => `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=e5ddfb,fceaf2,ffe9d6`;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const reais = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

/** Admin → Demo hosts: switches, fictional hosts (with simulated reviews), categories, testers and test-call history. */
export function DemoHostsAdmin({ notify }: { notify: (s: string) => void }) {
  const tr = useT();
  const [hosts, setHosts] = useState<DemoHostRow[] | null>(null);
  const [cats, setCats] = useState<HostCategory[]>([]);
  const [settings, setSettings] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<DemoHostRow | "new" | null>(null);

  const load = useCallback(async () => {
    const [h, c, s] = await Promise.all([
      db().from("demo_hosts").select("*").order("sort_order"),
      db().from("host_categories").select("*").order("sort_order"),
      db().rpc("admin_list_settings"),
    ]);
    setHosts((h.data as DemoHostRow[] | null) ?? []);
    setCats((c.data as HostCategory[] | null) ?? []);
    setSettings(Object.fromEntries(((s.data as { key: string; value: number }[] | null) ?? []).map((r) => [r.key, Number(r.value)])));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const setSetting = async (key: string, value: number) => {
    const { error } = await db().rpc("admin_set_setting", { p_key: key, p_value: value });
    if (error) return notify(tr(error.message));
    notify(tr("Setting saved"));
    load();
  };
  const patch = async (h: DemoHostRow, v: Partial<DemoHostRow>) => {
    const { error } = await db().from("demo_hosts").update(v).eq("id", h.id);
    if (error) return notify(tr(error.message));
    load();
  };
  const remove = async (h: DemoHostRow) => {
    if (!confirm(tr("Delete {name}? Their simulated reviews are deleted too. Test-call history keeps the name.", { name: h.display_name }))) return;
    const { error } = await db().from("demo_hosts").delete().eq("id", h.id);
    if (error) return notify(tr(error.message));
    notify(tr("Demo host deleted"));
    load();
  };

  const visible = (hosts ?? []).filter((h) => h.is_active && h.show_in_preview).length;

  return (
    <div className="space-y-6">
      {/* Switches */}
      <section className="rounded-[var(--radius-card)] bg-gradient-to-br from-lilac to-blush p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">{tr("Demo hosts & private preview")}</h2>
            <p className="mt-1 max-w-xl text-sm text-plum">{tr("Fictional hosts for internal tests. They live in separate tables, never appear on the public site and never move real money.")}</p>
          </div>
          <Link href="/preview/explore" target="_blank" className="inline-flex items-center gap-2 rounded-full bg-plum px-4 py-2 text-sm font-semibold text-white hover:bg-plum-deep"><Eye className="size-4" /> {tr("Open preview")}</Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Switch label={tr("Demo hosts on")} checked={settings.demo_enabled === 1} onChange={(v) => setSetting("demo_enabled", v ? 1 : 0)} />
          <Switch label={tr("Simulated calls on")} checked={settings.demo_calls_enabled === 1} onChange={(v) => setSetting("demo_calls_enabled", v ? 1 : 0)} />
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3.5 text-sm font-semibold">
            {tr("Hosts shown in the preview")}
            <input type="number" min={0} max={500} defaultValue={settings.demo_max_hosts ?? 24} key={settings.demo_max_hosts}
              onBlur={(e) => Number(e.target.value) !== settings.demo_max_hosts && setSetting("demo_max_hosts", Number(e.target.value))}
              className="h-9 w-20 rounded-lg bg-cream px-2 text-right ring-1 ring-line" />
          </label>
        </div>
        <p className="mt-3 text-xs text-plum">{tr("{n} of {total} hosts are active and listed. HUMI commission in every simulation: {pct}.", { n: visible, total: hosts?.length ?? 0, pct: `${(settings.commission_bps ?? 2000) / 100}%` })}</p>
      </section>

      {/* Hosts */}
      <section className="rounded-[var(--radius-card)] bg-white p-5 ring-1 ring-line sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-bold">{tr("Demo hosts")}</h3>
          <button onClick={() => setEditing("new")} className="inline-flex items-center gap-1.5 rounded-full bg-plum px-4 py-2 text-sm font-semibold text-white hover:bg-plum-deep"><Plus className="size-4" /> {tr("New host")}</button>
        </div>
        {!hosts ? <Loader2 className="size-5 animate-spin text-plum-soft" /> : (
          <ul className="divide-y divide-line">
            {hosts.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {h.photo_url ? <img src={h.photo_url} alt="" className="size-11 rounded-full bg-lilac object-cover" /> : <span className="grid size-11 place-items-center rounded-full bg-lilac font-bold">{h.display_name[0]}</span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{h.display_name}{h.age ? `, ${h.age}` : ""} <span className="font-normal text-plum-soft">· {h.city}, {h.country}</span></p>
                  <p className="truncate text-xs text-plum-soft">
                    {formatBRL(h.audio_cents_per_minute)}/min · <Star className="inline size-3 fill-plum" /> {Number(h.rating_avg).toFixed(1)} ({h.review_count}) · {h.languages.join(", ")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip on={h.is_active} onClick={() => patch(h, { is_active: !h.is_active })}>{h.is_active ? tr("Active") : tr("Inactive")}</Chip>
                  <Chip on={h.show_in_preview} onClick={() => patch(h, { show_in_preview: !h.show_in_preview })}>{h.show_in_preview ? tr("In preview") : tr("Hidden")}</Chip>
                  <Chip on={h.is_online} onClick={() => patch(h, { is_online: !h.is_online })}>{h.is_online ? tr("Online") : tr("Offline")}</Chip>
                  <Link href={`/preview/hosts/${h.id}`} target="_blank" className="grid size-8 place-items-center rounded-full ring-1 ring-line hover:bg-lilac" title={tr("View as a client")}><Eye className="size-4" /></Link>
                  <button onClick={() => setEditing(h)} className="grid size-8 place-items-center rounded-full ring-1 ring-line hover:bg-lilac" title={tr("Edit")}><Pencil className="size-4" /></button>
                  <button onClick={() => remove(h)} className="grid size-8 place-items-center rounded-full ring-1 ring-line hover:bg-[#fde8ea] hover:text-[#a3324a]" title={tr("Delete")}><Trash2 className="size-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Testers notify={notify} />
        <Categories cats={cats} notify={notify} reload={load} />
      </div>

      <section className="rounded-[var(--radius-card)] bg-white p-5 ring-1 ring-line sm:p-6">
        <h3 className="mb-4 font-bold">{tr("Test call history")}</h3>
        <DemoCallHistory all hosts={(hosts ?? []).map((h) => ({ id: h.id, name: h.display_name }))} />
      </section>

      {editing && <HostEditor host={editing === "new" ? null : editing} cats={cats} notify={notify} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function HostEditor({ host, cats, notify, onClose, onSaved }: { host: DemoHostRow | null; cats: HostCategory[]; notify: (s: string) => void; onClose: () => void; onSaved: () => void }) {
  const tr = useT();
  const locale = useLocale();
  const [f, setF] = useState(() => ({
    display_name: host?.display_name ?? "",
    age: host?.age ? String(host.age) : "",
    country: host?.country ?? "",
    city: host?.city ?? "",
    timezone: host?.timezone ?? "America/Sao_Paulo",
    languages: (host?.languages ?? []).join(", "),
    interests: (host?.interests ?? []).join(", "),
    categories: host?.categories ?? [],
    tagline: host?.tagline ?? "",
    bio: host?.bio ?? "",
    photo_url: host?.photo_url ?? "",
    audio: reais(host?.audio_cents_per_minute ?? 100),
    video: reais(host?.video_cents_per_minute),
    call_types: host?.call_types ?? (["audio", "video"] as ("audio" | "video")[]),
    sort_order: String(host?.sort_order ?? 100),
    availability: host?.availability ?? [],
  }));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const dayWin = (d: number) => f.availability.find((w) => w.day_of_week === d);
  const setDay = (d: number, on: boolean, start?: string, end?: string) => {
    const rest = f.availability.filter((w) => w.day_of_week !== d);
    if (!on) return set("availability", rest);
    const cur = dayWin(d);
    set("availability", [...rest, { day_of_week: d, start_time: start ?? cur?.start_time ?? "18:00", end_time: end ?? cur?.end_time ?? "22:00", timezone: f.timezone }].sort((a, b) => a.day_of_week - b.day_of_week));
  };

  const save = async () => {
    const audio = parseReaisToCents(f.audio);
    const video = f.video.trim() ? parseReaisToCents(f.video) : null;
    if (!f.display_name.trim()) return notify(tr("Give the host a name."));
    if (!audio || audio < 1 || (f.video.trim() && !video)) return notify(tr("Invalid price."));
    if (f.call_types.length === 0) return notify(tr("Choose audio, video or both."));
    if (f.photo_url && !/^https:\/\//.test(f.photo_url)) return notify(tr("The photo link must start with https://"));
    const row = {
      display_name: f.display_name.trim(), age: f.age ? Number(f.age) : null, country: f.country.trim(), city: f.city.trim(), timezone: f.timezone.trim(),
      languages: list(f.languages), interests: list(f.interests), categories: f.categories, tagline: f.tagline.trim(), bio: f.bio.trim(),
      photo_url: f.photo_url.trim() || null, audio_cents_per_minute: audio, video_cents_per_minute: video, call_types: f.call_types,
      sort_order: Number(f.sort_order) || 100, availability: f.availability.map((w) => ({ ...w, timezone: f.timezone })),
    };
    setSaving(true);
    const { error } = host ? await db().from("demo_hosts").update(row).eq("id", host.id) : await db().from("demo_hosts").insert(row);
    setSaving(false);
    if (error) return notify(tr(error.message));
    notify(host ? tr("Demo host saved") : tr("Demo host created"));
    onSaved();
  };

  const field = "w-full rounded-xl bg-cream px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-lavender";
  const L = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
    <label className={cn("block text-sm font-semibold", className)}><span className="mb-1 block">{label}</span>{children}</label>
  );

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-plum-deep/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal className="relative flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[1.5rem] bg-white shadow-lift sm:rounded-[1.5rem]">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-bold">{host ? tr("Edit {name}", { name: host.display_name }) : tr("New demo host")}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-lilac" aria-label={tr("Close")}><X className="size-5" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {f.photo_url ? <img src={f.photo_url} alt="" className="size-20 rounded-2xl bg-lilac object-cover" /> : <span className="grid size-20 place-items-center rounded-2xl bg-lilac text-2xl font-bold">{f.display_name[0] ?? "?"}</span>}
            <div className="flex-1 space-y-2">
              <L label={tr("Photo link (https)")}><input value={f.photo_url} onChange={(e) => set("photo_url", e.target.value)} placeholder="https://…" className={field} /></L>
              <button type="button" onClick={() => set("photo_url", AVATAR(`${f.display_name || "host"}-${Math.random().toString(36).slice(2, 7)}`))} className="inline-flex items-center gap-1.5 text-xs font-semibold text-plum underline-offset-2 hover:underline">
                <Shuffle className="size-3.5" /> {tr("Illustrated avatar")}
              </button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <L label={tr("Name")}><input value={f.display_name} onChange={(e) => set("display_name", e.target.value)} className={field} maxLength={40} /></L>
            <L label={tr("Age (18+)")}><input type="number" min={18} max={99} value={f.age} onChange={(e) => set("age", e.target.value)} className={field} /></L>
            <L label={tr("Order in the list")}><input type="number" value={f.sort_order} onChange={(e) => set("sort_order", e.target.value)} className={field} /></L>
            <L label={tr("Country (English name)")}><input value={f.country} onChange={(e) => set("country", e.target.value)} placeholder="Canada" className={field} /></L>
            <L label={tr("City")}><input value={f.city} onChange={(e) => set("city", e.target.value)} className={field} /></L>
            <L label={tr("Time zone")}><input value={f.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="America/Toronto" className={field} /></L>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <L label={tr("Languages (comma separated, in English)")}><input value={f.languages} onChange={(e) => set("languages", e.target.value)} placeholder="English, Spanish" className={field} /></L>
            <L label={tr("Interests (comma separated)")}><input value={f.interests} onChange={(e) => set("interests", e.target.value)} placeholder="Music, Travel" className={field} /></L>
          </div>
          <L label={tr("Short headline")}><input value={f.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={140} className={field} /></L>
          <L label={tr("Bio")}><textarea rows={5} value={f.bio} onChange={(e) => set("bio", e.target.value)} maxLength={2000} className={field} /></L>
          <div>
            <p className="mb-2 text-sm font-semibold">{tr("Categories")}</p>
            <div className="flex flex-wrap gap-2">
              {cats.filter((c) => c.is_active).map((c) => {
                const on = f.categories.includes(c.slug);
                return (
                  <button key={c.slug} type="button" onClick={() => set("categories", on ? f.categories.filter((x) => x !== c.slug) : [...f.categories, c.slug])}
                    className={cn("rounded-full px-3 py-1.5 text-sm font-medium ring-1", on ? "bg-plum text-white ring-plum" : "bg-white ring-line hover:ring-lavender")}>
                    {locale === "pt" ? c.label_pt : c.label_en}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <L label={tr("Audio price (R$/min)")}><input value={f.audio} onChange={(e) => set("audio", e.target.value)} inputMode="decimal" className={field} /></L>
            <L label={tr("Video price (R$/min, empty = same)")}><input value={f.video} onChange={(e) => set("video", e.target.value)} inputMode="decimal" className={field} /></L>
            <div>
              <p className="mb-1 text-sm font-semibold">{tr("Offers")}</p>
              <div className="flex gap-2">
                {(["audio", "video"] as const).map((t) => {
                  const on = f.call_types.includes(t);
                  return (
                    <button key={t} type="button" onClick={() => set("call_types", on ? f.call_types.filter((x) => x !== t) : [...f.call_types, t])}
                      className={cn("flex-1 rounded-xl py-2.5 text-sm font-semibold ring-1", on ? "bg-plum text-white ring-plum" : "bg-white ring-line")}>
                      {t === "audio" ? tr("Audio") : tr("Video")}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">{tr("Weekly availability")} <span className="font-normal text-plum-soft">({f.timezone})</span></p>
            <div className="grid gap-2 sm:grid-cols-2">
              {DAYS.map((d, i) => {
                const w = dayWin(i);
                return (
                  <div key={d} className="flex items-center gap-2 rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-line">
                    <label className="flex w-16 items-center gap-2 font-semibold"><input type="checkbox" checked={!!w} onChange={(e) => setDay(i, e.target.checked)} className="accent-[#493C62]" />{tr(d)}</label>
                    {w && (
                      <>
                        <input type="time" value={w.start_time.slice(0, 5)} onChange={(e) => setDay(i, true, e.target.value, w.end_time)} className="rounded-md bg-white px-1.5 py-1 ring-1 ring-line" />
                        –
                        <input type="time" value={w.end_time.slice(0, 5)} onChange={(e) => setDay(i, true, w.start_time, e.target.value)} className="rounded-md bg-white px-1.5 py-1 ring-1 ring-line" />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {host && <Reviews hostId={host.id} notify={notify} />}
        </div>
        <div className="flex gap-2 border-t border-line px-6 py-4">
          <button onClick={onClose} className="h-11 flex-1 rounded-full bg-cream font-semibold ring-1 ring-line hover:bg-lilac">{tr("Cancel")}</button>
          <button onClick={save} disabled={saving} className="h-11 flex-[2] rounded-full bg-plum font-semibold text-white hover:bg-plum-deep disabled:opacity-60">{saving ? tr("Saving…") : tr("Save")}</button>
        </div>
      </div>
    </div>
  );
}

function Reviews({ hostId, notify }: { hostId: string; notify: (s: string) => void }) {
  const tr = useT();
  const [rows, setRows] = useState<DemoReviewRow[]>([]);
  const [r, setR] = useState({ name: "", rating: 5, comment: "", language: "pt", date: new Date().toISOString().slice(0, 10) });
  const load = useCallback(async () => {
    const { data } = await db().from("demo_reviews").select("*").eq("demo_host_id", hostId).order("review_date", { ascending: false });
    setRows((data as DemoReviewRow[] | null) ?? []);
  }, [hostId]);
  useEffect(() => {
    load();
  }, [load]);
  const add = async () => {
    if (!r.name.trim()) return notify(tr("Give the reviewer a name."));
    const { error } = await db().from("demo_reviews").insert({
      demo_host_id: hostId, reviewer_name: r.name.trim(), reviewer_avatar_url: AVATAR(`${r.name}-r`), rating: r.rating, comment: r.comment.trim(), language: r.language, review_date: r.date,
    });
    if (error) return notify(tr(error.message));
    setR((x) => ({ ...x, name: "", comment: "" }));
    load();
  };
  const del = async (id: string) => {
    const { error } = await db().from("demo_reviews").delete().eq("id", id);
    if (error) return notify(tr(error.message));
    load();
  };
  const field = "rounded-lg bg-white px-2.5 py-2 text-sm ring-1 ring-line outline-none";
  return (
    <div className="rounded-2xl bg-blush/60 p-4">
      <p className="text-sm font-semibold">{tr("Simulated reviews")} <span className="font-normal text-plum-soft">· {tr("kept apart from real reviews, only shown in the preview")}</span></p>
      <ul className="mt-3 space-y-2">
        {rows.map((x) => (
          <li key={x.id} className="flex items-start gap-3 rounded-xl bg-white p-3 text-sm">
            <span className="shrink-0 font-semibold">{x.reviewer_name} · {"★".repeat(x.rating)}</span>
            <span className="min-w-0 flex-1 text-plum-soft">{x.comment} <span className="text-xs">({x.language}, {x.review_date})</span></span>
            <button onClick={() => del(x.id)} className="shrink-0 text-plum-soft hover:text-[#a3324a]" aria-label={tr("Delete")}><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder={tr("Reviewer name")} className={cn(field, "w-36")} />
        <select value={r.rating} onChange={(e) => setR({ ...r, rating: Number(e.target.value) })} className={field}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}</select>
        <select value={r.language} onChange={(e) => setR({ ...r, language: e.target.value })} className={field}><option value="pt">PT</option><option value="en">EN</option><option value="es">ES</option></select>
        <input type="date" value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} className={field} />
        <input value={r.comment} onChange={(e) => setR({ ...r, comment: e.target.value })} placeholder={tr("Comment")} className={cn(field, "min-w-48 flex-1")} />
        <button onClick={add} className="inline-flex items-center gap-1 rounded-lg bg-plum px-3 py-2 text-sm font-semibold text-white"><Plus className="size-4" /> {tr("Add")}</button>
      </div>
    </div>
  );
}

function Testers({ notify }: { notify: (s: string) => void }) {
  const tr = useT();
  const [rows, setRows] = useState<{ user_id: string; email: string; full_name: string }[]>([]);
  const [email, setEmail] = useState("");
  const load = useCallback(async () => {
    const { data } = await db().rpc("admin_preview_testers");
    setRows((data as typeof rows | null) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const add = async () => {
    const { error } = await db().rpc("admin_add_preview_tester", { p_email: email });
    if (error) return notify(tr(error.message));
    setEmail("");
    notify(tr("Tester added"));
    load();
  };
  const remove = async (id: string) => {
    await db().rpc("admin_remove_preview_tester", { p_user: id });
    load();
  };
  return (
    <section className="rounded-[var(--radius-card)] bg-white p-5 ring-1 ring-line sm:p-6">
      <h3 className="font-bold">{tr("Preview testers")}</h3>
      <p className="mt-1 text-sm text-plum-soft">{tr("Admins always have access. Add other people by the e-mail of their HUMI account.")}</p>
      <div className="mt-4 flex gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="email@exemplo.com" className="h-10 flex-1 rounded-xl bg-cream px-3 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-lavender" />
        <button onClick={add} className="inline-flex items-center gap-1.5 rounded-xl bg-plum px-3 text-sm font-semibold text-white"><UserPlus className="size-4" /> {tr("Add")}</button>
      </div>
      <ul className="mt-3 divide-y divide-line text-sm">
        {rows.length === 0 && <li className="py-2 text-plum-soft">{tr("No testers yet.")}</li>}
        {rows.map((t) => (
          <li key={t.user_id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 truncate">{t.full_name || "—"} <span className="text-plum-soft">· {t.email}</span></span>
            <button onClick={() => remove(t.user_id)} className="text-xs font-semibold text-plum-soft hover:text-[#a3324a]">{tr("Remove")}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Categories({ cats, notify, reload }: { cats: HostCategory[]; notify: (s: string) => void; reload: () => void }) {
  const tr = useT();
  const [en, setEn] = useState("");
  const [pt, setPt] = useState("");
  const add = async () => {
    const slug = en.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    if (slug.length < 2 || !pt.trim()) return notify(tr("Fill in both names."));
    const { error } = await db().from("host_categories").insert({ slug, label_en: en.trim(), label_pt: pt.trim(), sort_order: (cats.at(-1)?.sort_order ?? 100) + 10 });
    if (error) return notify(tr(error.message));
    setEn("");
    setPt("");
    reload();
  };
  const toggle = async (c: HostCategory) => {
    await db().from("host_categories").update({ is_active: !c.is_active }).eq("slug", c.slug);
    reload();
  };
  return (
    <section className="rounded-[var(--radius-card)] bg-white p-5 ring-1 ring-line sm:p-6">
      <h3 className="font-bold">{tr("Categories")}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {cats.map((c) => (
          <button key={c.slug} onClick={() => toggle(c)} title={tr("Click to switch on/off")} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold ring-1", c.is_active ? "bg-lilac ring-lavender" : "bg-white text-plum-soft line-through ring-line")}>
            {c.label_pt} <span className="font-normal text-plum-soft">/ {c.label_en}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <input value={en} onChange={(e) => setEn(e.target.value)} placeholder={tr("Name in English")} className="h-10 min-w-32 flex-1 rounded-xl bg-cream px-3 text-sm ring-1 ring-line outline-none" />
        <input value={pt} onChange={(e) => setPt(e.target.value)} placeholder={tr("Name in Portuguese")} className="h-10 min-w-32 flex-1 rounded-xl bg-cream px-3 text-sm ring-1 ring-line outline-none" />
        <button onClick={add} className="inline-flex items-center gap-1.5 rounded-xl bg-plum px-3 text-sm font-semibold text-white"><Plus className="size-4" /> {tr("Add")}</button>
      </div>
    </section>
  );
}

const Switch = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3.5 text-left text-sm font-semibold">
    {label}
    <span className={cn("relative h-6 w-11 rounded-full transition", checked ? "bg-online" : "bg-line")}>
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
    </span>
  </button>
);
const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition", on ? "bg-online/10 text-online ring-online/30" : "bg-cream text-plum-soft ring-line")}>{children}</button>
);
