import { Suspense } from "react";
import { ExploreView } from "@/components/explore/ExploreView";
import { HostCardSkeleton } from "@/components/hosts/HostCard";
import { Container } from "@/components/ui/primitives";
import { demoToHost } from "@/lib/demo";
import { getCategories, getPreviewHosts } from "@/lib/preview-server";
import { getLocale, getT } from "@/i18n/server";

export const dynamic = "force-dynamic";

/** Same Explore page as production, fed with the demo hosts (admins and invited testers only). */
export default async function PreviewExplorePage() {
  const [rows, cats, tr, locale] = await Promise.all([getPreviewHosts(), getCategories(), getT(), getLocale()]);
  const hosts = rows.map(demoToHost);
  const used = new Set(rows.flatMap((r) => r.categories));
  const categoryOptions = cats.filter((c) => used.has(c.slug)).map((c) => ({ id: c.slug, label: locale === "pt" ? c.label_pt : c.label_en }));
  return (
    <div className="relative">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-blush to-transparent" />
      <Container className="pb-24 pt-10 lg:pt-14">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{tr("Find someone to talk to")}</h1>
          <p className="mt-3 text-lg text-plum-soft">{tr("Browse people from around the world by interest, language and vibe.")}</p>
        </div>
        <Suspense
          fallback={
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <HostCardSkeleton key={i} />)}
            </div>
          }
        >
          <ExploreView hosts={hosts} source="supabase" hrefBase="/preview/hosts" categoryOptions={categoryOptions} />
        </Suspense>
      </Container>
    </div>
  );
}
