"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowUpDown, RotateCcw, Search, SlidersHorizontal, UsersRound, X } from "lucide-react";
import { HostCard, HostCardSkeleton } from "@/components/hosts/HostCard";
import { CategoryPills } from "./CategoryPills";
import { EmptyState } from "./EmptyState";
import type { CategoryId, Host } from "@/types";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import { useLocale, useT } from "@/i18n/client";
import { countryLabel } from "@/data/places";

type Sort = "recommended" | "rating" | "price-asc" | "price-desc";
const isCategory = (v: string | null): v is CategoryId => !!v && ["talk", "play", "cultures", "meet"].includes(v);

const uniqSorted = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort();

export function ExploreView({
  hosts,
  source,
  error,
  hrefBase = "/hosts",
  categoryOptions,
}: {
  hosts: Host[];
  source: "demo" | "supabase";
  error?: string;
  /** Where cards link to (the preview uses /preview/hosts). */
  hrefBase?: string;
  /** Custom categories (the preview's); defaults to the marketplace ones. */
  categoryOptions?: { id: string; label: string }[];
}) {
  const tr = useT();
  const locale = useLocale();
  const PRICE_MAX = hosts.length ? Math.max(...hosts.map((h) => h.priceAudioCents)) : 2000;
  const PRICE_MIN = hosts.length ? Math.min(...hosts.map((h) => h.priceAudioCents)) : 50;
  const allLanguages = useMemo(() => uniqSorted(hosts.flatMap((h) => h.languages)), [hosts]);
  const allCountries = useMemo(() => uniqSorted(hosts.map((h) => h.country)), [hosts]);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialCat = params.get("category");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const validCategory = (v: string | null) => (categoryOptions ? categoryOptions.some((c) => c.id === v) : isCategory(v));
  const [category, setCategory] = useState<string>(validCategory(initialCat) ? (initialCat as string) : "all");
  const [language, setLanguage] = useState("all");
  const [country, setCountry] = useState("all");
  const [maxPrice, setMaxPrice] = useState(PRICE_MAX);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("recommended");
  const [loading, setLoading] = useState(source === "demo");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Simulated network latency so the skeleton state is visible (replace with real fetch).
  useEffect(() => {
    if (source !== "demo") return;
    const id = setTimeout(() => setLoading(false), 650);
    return () => clearTimeout(id);
  }, [source]);

  // Keep category + query shareable via URL.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (category !== "all") sp.set("category", category);
    if (query.trim()) sp.set("q", query.trim());
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [category, query, pathname, router]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = hosts.filter((h) => {
      if (category !== "all" && !(h.categories as string[]).includes(category)) return false;
      if (language !== "all" && !h.languages.includes(language)) return false;
      if (country !== "all" && h.country !== country) return false;
      if (h.priceAudioCents > maxPrice) return false;
      if (onlineOnly && !h.online) return false;
      if (q) {
        const hay = [h.firstName, h.country, countryLabel(h.country, locale), h.city, h.region ?? "", ...h.interests, ...h.interests.map((x) => tr(x)), ...h.languages, ...h.languages.map((x) => tr(x)), h.tagline].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const sorted = [...filtered];
    switch (sort) {
      case "rating":
        sorted.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
        break;
      case "price-asc":
        sorted.sort((a, b) => a.priceAudioCents - b.priceAudioCents);
        break;
      case "price-desc":
        sorted.sort((a, b) => b.priceAudioCents - a.priceAudioCents);
        break;
      default:
        sorted.sort((a, b) => Number(b.online) - Number(a.online) || b.rating * Math.log(b.reviewCount + 1) - a.rating * Math.log(a.reviewCount + 1));
    }
    return sorted;
  }, [hosts, query, category, language, country, maxPrice, onlineOnly, sort, locale, tr]);

  const activeCount = [language !== "all", country !== "all", maxPrice < PRICE_MAX, onlineOnly].filter(Boolean).length;

  const reset = () => {
    setQuery("");
    setCategory("all");
    setLanguage("all");
    setCountry("all");
    setMaxPrice(PRICE_MAX);
    setOnlineOnly(false);
    setSort("recommended");
  };

  const filterPanel = (
    <div className="space-y-6">
      <FilterSelect id="f-language" label={tr("Language")} value={language} onChange={setLanguage} options={allLanguages} allLabel={tr("Any language")} display={(o) => tr(o)} />
      <FilterSelect id="f-country" label={tr("Country")} value={country} onChange={setCountry} options={allCountries} allLabel={tr("Any country")} display={(o) => countryLabel(o, locale)} />
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="price" className="text-sm font-semibold">{tr("Max price")}</label>
          <span className="text-sm text-plum-soft">{formatBRL(maxPrice)} {tr("/ min")}</span>
        </div>
        <input
          id="price"
          type="range"
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={1}
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          className="mt-3 w-full accent-[#9b85e3]"
        />
        <div className="mt-1 flex justify-between text-xs text-plum-soft">
          <span>{formatBRL(PRICE_MIN)}</span>
          <span>{formatBRL(PRICE_MAX)}</span>
        </div>
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-semibold">{tr("Online now")}</span>
          <span className="block text-xs text-plum-soft">{tr("Only show hosts available right now")}</span>
        </span>
        <Toggle checked={onlineOnly} onChange={setOnlineOnly} label={tr("Online now")} />
      </label>
      {activeCount > 0 && (
        <button onClick={reset} className="inline-flex items-center gap-1.5 text-sm font-semibold text-plum underline-offset-4 hover:underline">
          <RotateCcw className="size-3.5" /> {tr("Reset all filters")}
        </button>
      )}
    </div>
  );

  return (
    <div>
      {/* Search + category bar */}
      <div className="flex flex-col gap-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-plum-soft" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("Search by name, interest, language or country")}
              aria-label={tr("Search hosts")}
              className="h-13 w-full rounded-full bg-white pl-12 pr-4 text-[15px] text-plum ring-1 ring-line outline-none transition placeholder:text-plum-soft/70 focus:ring-2 focus:ring-lavender"
            />
          </div>
          <button
            onClick={() => setFiltersOpen(true)}
            className="relative inline-flex h-13 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold ring-1 ring-line transition hover:ring-lavender lg:hidden"
          >
            <SlidersHorizontal className="size-4" />
            <span className="hidden sm:inline">{tr("Filters")}</span>
            {activeCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-plum text-[11px] text-white">{activeCount}</span>}
          </button>
        </div>
        <CategoryPills value={category} onChange={setCategory} options={categoryOptions} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-28 rounded-[var(--radius-card)] bg-white p-6 ring-1 ring-line">
            <h2 className="mb-6 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-plum-soft">
              <SlidersHorizontal className="size-4" /> {tr("Filters")}
            </h2>
            {filterPanel}
          </div>
        </aside>

        <div>
          <div className="mb-5 flex items-center justify-between gap-3">
            <p className="text-sm text-plum-soft" aria-live="polite">
              {loading ? tr("Finding people…") : (
                <><span className="font-semibold text-plum">{results.length}</span> {results.length === 1 ? tr("host") : tr("hosts")}{source === "demo" && ` · ${tr("sample profiles")}`}</>
              )}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <ArrowUpDown className="size-4 text-plum-soft" aria-hidden />
              <span className="sr-only">{tr("Sort by")}</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="cursor-pointer rounded-full bg-white py-2 pl-3 pr-8 text-sm font-medium ring-1 ring-line outline-none focus:ring-lavender"
              >
                <option value="recommended">{tr("Recommended")}</option>
                <option value="rating">{tr("Highest rated")}</option>
                <option value="price-asc">{tr("Price: low to high")}</option>
                <option value="price-desc">{tr("Price: high to low")}</option>
              </select>
            </label>
          </div>

          {error ? (
            <div role="alert" className="rounded-[var(--radius-card)] bg-white px-6 py-14 text-center ring-1 ring-line">
              <AlertTriangle className="mx-auto size-7 text-[#a3324a]" />
              <h3 className="mt-4 text-lg font-bold">{tr("We couldn't load hosts right now")}</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm text-plum-soft">{tr(error)}</p>
              <button onClick={() => router.refresh()} className="mt-5 rounded-full bg-plum px-5 py-2.5 text-sm font-semibold text-white">{tr("Try again")}</button>
            </div>
          ) : hosts.length === 0 ? (
            <div className="rounded-[var(--radius-card)] bg-white px-6 py-16 text-center ring-1 ring-line">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-blush"><UsersRound className="size-7" strokeWidth={1.75} /></span>
              <h3 className="mt-5 text-xl font-bold">{tr("The first hosts are on their way")}</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm text-plum-soft">{tr("No one has published a host profile yet. Want to be one of the first?")}</p>
              <Link href="/become-a-host" className="mt-6 inline-flex rounded-full bg-lavender px-5 py-2.5 text-sm font-semibold text-plum-deep">{tr("Become a host")}</Link>
            </div>
          ) : loading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <HostCardSkeleton key={i} />)}
            </div>
          ) : results.length === 0 ? (
            <EmptyState onReset={reset} />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((h, i) => (
                <div key={h.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <HostCard host={h} priority={i < 3} href={`${hrefBase}/${h.id}`} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter sheet */}
      <div className={cn("fixed inset-0 z-[60] lg:hidden", filtersOpen ? "visible" : "invisible")} aria-hidden={!filtersOpen}>
        <div
          className={cn("absolute inset-0 bg-plum-deep/40 backdrop-blur-sm transition-opacity", filtersOpen ? "opacity-100" : "opacity-0")}
          onClick={() => setFiltersOpen(false)}
        />
        <div
          role="dialog"
          aria-label={tr("Filters")}
          className={cn(
            "absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[1.75rem] bg-cream p-6 pb-8 transition-transform duration-300",
            filtersOpen ? "translate-y-0" : "translate-y-full",
          )}
        >
          <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line" />
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-bold">{tr("Filters")}</h2>
            <button onClick={() => setFiltersOpen(false)} className="grid size-9 place-items-center rounded-full hover:bg-lilac" aria-label={tr("Close filters")}>
              <X className="size-5" />
            </button>
          </div>
          {filterPanel}
          <button onClick={() => setFiltersOpen(false)} className="mt-8 h-12 w-full rounded-full bg-plum font-semibold text-white">
            {tr(results.length === 1 ? "Show {n} host" : "Show {n} hosts", { n: results.length })}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  allLabel,
  display = (o) => o,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allLabel: string;
  display?: (o: string) => string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-11 w-full cursor-pointer rounded-xl bg-cream px-3 text-sm ring-1 ring-line outline-none transition focus:ring-2 focus:ring-lavender"
      >
        <option value="all">{allLabel}</option>
        {options.map((o) => <option key={o} value={o}>{display(o)}</option>)}
      </select>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-wait disabled:opacity-60",
        checked ? "bg-plum" : "bg-[#d9cfe6]",
      )}
    >
      {/* left-0 anchors the knob; without it the button's centered content pushed it right. */}
      <span
        className={cn(
          "absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
