import type { Metadata } from "next";
import { Suspense } from "react";
import { ExploreView } from "@/components/explore/ExploreView";
import { HostCardSkeleton } from "@/components/hosts/HostCard";
import { Container } from "@/components/ui/primitives";
import { getHosts } from "@/lib/data/hosts";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Explore hosts") };
}
// Public marketplace data is cached briefly and refreshed in the background.
export const revalidate = 30; // keeps "Online now" close to real time

export default async function ExplorePage() {
  const { data: hosts, source, error } = await getHosts();
  const tr = await getT();
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
          <ExploreView hosts={hosts} source={source} error={error} />
        </Suspense>
      </Container>
    </div>
  );
}
