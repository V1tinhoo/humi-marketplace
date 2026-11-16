"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Eye, History, LayoutGrid, Pencil, ShieldCheck, Wallet } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, parseReaisToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Rpc = { rpc: (f: string, a?: object) => PromiseLike<{ error: { message: string } | null }> };

/** Slim bar above the preview pages (outside the profiles, so the design under test is unchanged). */
export function PreviewBar({ isAdmin, balance, callsEnabled }: { isAdmin: boolean; balance: number; callsEnabled: boolean }) {
  const tr = useT();
  const path = usePathname();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState((balance / 100).toFixed(2).replace(".", ","));
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const cents = parseReaisToCents(value);
    if (cents === null) return setError(tr("Invalid amount"));
    const supabase = getSupabaseBrowserClient() as unknown as Rpc | null;
    const res = await supabase?.rpc("demo_set_balance", { p_cents: cents });
    if (res?.error) return setError(tr(res.error.message));
    setError(null);
    setEditing(false);
    router.refresh();
  };

  const link = (href: string, label: string, Icon: typeof Eye) => (
    <Link href={href} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition", path.startsWith(href) ? "bg-white text-plum" : "text-white/85 hover:bg-white/10")}>
      <Icon className="size-3.5" /> {label}
    </Link>
  );

  return (
    <div className="bg-plum-deep text-[13px] font-semibold text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2 sm:px-6">
        <span className="mr-1 inline-flex items-center gap-1.5 text-rose"><Eye className="size-4" /> {tr("Private preview")}</span>
        {link("/preview/explore", tr("Explore"), LayoutGrid)}
        {link("/preview/history", tr("Test calls"), History)}
        {isAdmin && (
          <Link href="/admin" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white/85 hover:bg-white/10">
            <ShieldCheck className="size-3.5" /> {tr("Admin")}
          </Link>
        )}
        <span className="ml-auto inline-flex items-center gap-2">
          {!callsEnabled && <span className="rounded-full bg-[#c2405a] px-2 py-0.5 text-[11px]">{tr("Calls off")}</span>}
          <Wallet className="size-3.5 text-rose" /> {tr("Test balance")}:
          {editing ? (
            <span className="inline-flex items-center gap-1">
              R$
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                inputMode="decimal"
                className="h-7 w-20 rounded-md bg-white px-2 text-plum outline-none"
                aria-label={tr("Test balance")}
                autoFocus
              />
              <button onClick={save} className="grid size-7 place-items-center rounded-md bg-rose text-plum" aria-label={tr("Save")}><Check className="size-4" /></button>
            </span>
          ) : (
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/10">
              {formatBRL(balance)} <Pencil className="size-3" />
            </button>
          )}
        </span>
        {error && <span className="w-full text-right text-[12px] text-rose">{error}</span>}
      </div>
    </div>
  );
}
