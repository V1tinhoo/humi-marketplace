"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import { HostCard } from "@/components/hosts/HostCard";
import { Container, SectionHeading } from "@/components/ui/primitives";
import { CategoryPills } from "@/components/explore/CategoryPills";
import { featuredHostIds } from "@/data/hosts";
import type { CategoryId, Host } from "@/types";
import { t } from "@/i18n";

export function FeaturedHosts({ hosts }: { hosts: Host[] }) {
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const featured = useMemo(() => {
    const curated = featuredHostIds.map((id) => hosts.find((h) => h.id === id)).filter((h): h is Host => !!h);
    return curated.length ? curated : hosts.slice(0, 12); // live data: already sorted by availability + rating
  }, [hosts]);
  const list = (category === "all" ? featured : featured.filter((h) => h.categories.includes(category))).slice(0, 8);
  const anySample = list.some((h) => h.isSample);

  if (hosts.length === 0) return null;

  return (
    <section className="py-20 lg:py-28" id="hosts">
      <Container>
        <SectionHeading
          title={t.featured.title}
          subtitle={t.featured.subtitle}
          action={
            <Link href="/explore" className="group inline-flex items-center gap-1.5 text-sm font-semibold text-plum">
              {t.featured.viewAll}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          }
        />
        <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CategoryPills value={category} onChange={setCategory} />
          {anySample && (
            <p className="flex items-center gap-1.5 text-xs text-plum-soft">
              <Info className="size-3.5" /> {t.featured.sampleNote}
            </p>
          )}
        </div>
        {list.length === 0 ? (
          <p className="mt-8 rounded-[var(--radius-card)] bg-cream p-8 text-center text-sm text-plum-soft ring-1 ring-line">
            No featured hosts in this category yet. <Link href={`/explore?category=${category}`} className="font-semibold text-plum underline underline-offset-2">Browse all</Link>
          </p>
        ) : (
          <div key={category} className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {list.map((h, i) => (
              <div key={h.id} className={i >= 4 ? "hidden animate-fade-up sm:block" : "animate-fade-up"} style={{ animationDelay: `${i * 50}ms` }}>
                <HostCard host={h} />
              </div>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
