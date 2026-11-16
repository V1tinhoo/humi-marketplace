"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { COUNTRIES, countryLabel } from "@/data/places";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

const inputCls =
  "mt-2 h-12 w-full rounded-xl bg-white px-4 text-[15px] ring-1 ring-line outline-none transition placeholder:text-plum-soft/60 focus:ring-2 focus:ring-lavender";

/** Country picker. Keeps an old free-text value visible so nothing is silently lost. */
export function CountrySelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const id = useId();
  const tr = useT();
  const locale = useLocale();
  // Shown in the visitor's language and alphabetical order; the stored value stays the English name.
  const options = [...COUNTRIES].map((c) => ({ value: c, label: countryLabel(c, locale) })).sort((a, b) => a.label.localeCompare(b.label, locale === "pt" ? "pt-BR" : "en"));
  const known = (COUNTRIES as readonly string[]).includes(value);
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{label ?? tr("Country")}</label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputCls, "cursor-pointer appearance-none pr-10", !value && "text-plum-soft/70")}
        >
          <option value="">{tr("Select your country")}</option>
          {value && !known && <option value={value}>{value}</option>}
          {options.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 mt-1 size-4 -translate-y-1/2 text-plum-soft" aria-hidden />
      </div>
    </div>
  );
}

/**
 * State / province picker for the selected country (full list via /api/regions).
 * Disabled until a country is chosen; an old saved value stays visible.
 */
export function RegionSelect({ country, value, onChange, label }: { country: string; value: string; onChange: (v: string) => void; label?: string }) {
  const id = useId();
  const tr = useT();
  const enabled = (COUNTRIES as readonly string[]).includes(country);
  const [regions, setRegions] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (!enabled) {
      setRegions([]);
      return;
    }
    const ctrl = new AbortController();
    setState("loading");
    fetch(`/api/regions?country=${encodeURIComponent(country)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: { regions: string[] }) => {
        setRegions(json.regions);
        setState("idle");
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState("error");
      });
    return () => ctrl.abort();
  }, [enabled, country]);

  const known = regions.includes(value);
  const placeholder = !enabled
    ? tr("Choose a country first")
    : state === "loading"
      ? tr("Loading…")
      : state === "error"
        ? tr("Couldn't load — try again later")
        : tr("Select your state / region");

  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{label ?? tr("State / region")}</label>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={!enabled || state !== "idle"}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputCls, "cursor-pointer appearance-none pr-10 disabled:cursor-not-allowed disabled:bg-cream", !value && "text-plum-soft/70")}
        >
          <option value="">{placeholder}</option>
          {value && !known && <option value={value}>{value}</option>}
          {regions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 mt-1 size-4 -translate-y-1/2 text-plum-soft" aria-hidden />
      </div>
    </div>
  );
}

/**
 * Pick tags from suggestions or add your own.
 * Selected tags are shown first and can be removed; suggestions toggle on click.
 */
export function TagPicker({
  label,
  value,
  onChange,
  suggestions,
  max = 20,
  placeholder,
  hint,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  max?: number;
  placeholder?: string;
  hint?: string;
}) {
  const id = useId();
  const tr = useT();
  const [draft, setDraft] = useState("");
  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const full = value.length >= max;

  const add = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!t || has(t) || full) return;
    onChange([...value, t]);
  };
  const remove = (t: string) => onChange(value.filter((v) => v !== t));
  const toggle = (t: string) => (has(t) ? onChange(value.filter((v) => v.toLowerCase() !== t.toLowerCase())) : add(t));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold">{label}</label>
        <span className="text-xs text-plum-soft">{hint ?? `${value.length}/${max}`}</span>
      </div>

      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label={tr("Selected: {label}", { label })}>
          {value.map((t) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => remove(t)}
                className="inline-flex items-center gap-1.5 rounded-full bg-plum px-3 py-1.5 text-sm font-medium text-white transition hover:bg-plum-deep"
                aria-label={tr("Remove {item}", { item: t })}
              >
                {t} <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex gap-2">
        <input
          id={id}
          value={draft}
          disabled={full}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
              setDraft("");
            }
          }}
          placeholder={full ? tr("Maximum of {n} reached", { n: max }) : (placeholder ?? tr("Add your own and press Enter"))}
          className="h-10 min-w-0 flex-1 rounded-xl bg-white px-3 text-sm ring-1 ring-line outline-none transition placeholder:text-plum-soft/60 focus:ring-2 focus:ring-lavender disabled:bg-cream"
        />
        <button
          type="button"
          onClick={() => { add(draft); setDraft(""); }}
          disabled={!draft.trim() || full}
          className="inline-flex h-10 items-center gap-1 rounded-xl bg-lilac px-3 text-sm font-semibold transition hover:bg-lavender disabled:opacity-40"
        >
          <Plus className="size-4" /> {tr("Add")}
        </button>
      </div>

      <p className="mt-3 text-xs font-medium text-plum-soft">{tr("Suggestions")}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {suggestions.map((s) => tr(s)).filter((s) => !has(s)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggle(s)}
            disabled={full}
            className="rounded-full bg-cream px-3 py-1.5 text-sm text-plum ring-1 ring-line transition hover:bg-blush hover:ring-lavender disabled:opacity-40"
          >
            + {s}
          </button>
        ))}
      </div>
    </div>
  );
}
