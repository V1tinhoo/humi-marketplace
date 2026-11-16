"use client";

import { categories } from "@/data/categories";
import { categoryVisuals } from "@/components/home/CategoryCard";
import type { CategoryId } from "@/types";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export function CategoryPills({
  value,
  onChange,
  className,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  /** Custom categories (e.g. the preview's). Defaults to the marketplace categories. */
  options?: { id: string; label: string }[];
}) {
  const tr = useT();
  const items: { id: string; label: string }[] = [{ id: "all", label: tr("All") }, ...(options ?? categories.map((c) => ({ id: c.id, label: tr(c.title) })))];
  return (
    <div className={cn("no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)} role="tablist" aria-label={tr("Filter by category")}>
      {items.map((item) => {
        const active = value === item.id;
        const Icon = item.id !== "all" ? categoryVisuals[item.id as CategoryId]?.icon : null;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
              active ? "bg-plum text-white shadow-soft" : "bg-white text-plum ring-1 ring-line hover:ring-lavender",
            )}
          >
            {Icon && <Icon className="size-4" aria-hidden />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
