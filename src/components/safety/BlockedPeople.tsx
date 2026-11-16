"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useIntlLocale, useT } from "@/i18n/client";

type Blocked = { user_id: string; name: string; avatar_url: string | null; created_at: string };
type Rpc = { rpc: (f: string, a?: object) => PromiseLike<{ data: unknown; error: unknown }> };

/** "Blocked people" on the account page, with Unblock. Hidden when the list is empty. */
export function BlockedPeople({ className }: { className?: string }) {
  const tr = useT();
  const loc = useIntlLocale();
  const [list, setList] = useState<Blocked[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient() as unknown as Rpc | null;
    if (!supabase) return;
    const { data } = await supabase.rpc("my_blocks");
    setList((data as Blocked[] | null) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unblock = async (b: Blocked) => {
    if (!confirm(tr("Unblock {name}?", { name: b.name }))) return;
    setBusy(b.user_id);
    const supabase = getSupabaseBrowserClient() as unknown as Rpc | null;
    await supabase?.rpc("unblock_user", { p_user: b.user_id });
    setBusy(null);
    load();
  };

  if (list.length === 0) return null;
  return (
    <section className={cn("rounded-[var(--radius-card)] bg-white p-5 ring-1 ring-line sm:p-6", className)}>
      <h2 className="flex items-center gap-2 font-bold"><Ban className="size-4" /> {tr("Blocked people")}</h2>
      <p className="mt-1 text-sm text-plum-soft">{tr("They can't call you, book with you or see you on HUMI.")}</p>
      <ul className="mt-4 divide-y divide-line">
        {list.map((b) => (
          <li key={b.user_id} className="flex items-center gap-3 py-2.5">
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-lilac text-sm font-bold">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {b.avatar_url ? <img src={b.avatar_url} alt="" className="size-full object-cover" /> : b.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{b.name}</p>
              <p className="text-xs text-plum-soft">{tr("Blocked on {date}", { date: new Date(b.created_at).toLocaleDateString(loc, { dateStyle: "medium" }) })}</p>
            </div>
            <button onClick={() => unblock(b)} disabled={busy === b.user_id} className="rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-line hover:bg-lilac disabled:opacity-60">
              {tr("Unblock")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
