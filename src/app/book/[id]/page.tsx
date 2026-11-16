import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { hosts as sampleHosts } from "@/data/hosts";
import { getHostById } from "@/lib/data/hosts";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { Container, Skeleton } from "@/components/ui/primitives";
import { getT } from "@/i18n/server";

export const revalidate = 30; // keeps "Online now" close to real time

export function generateStaticParams() {
  return isSupabaseConfigured ? [] : sampleHosts.map((h) => ({ id: h.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { data: host } = await getHostById((await params).id);
  const tr = await getT();
  return { title: host ? tr("Book {name}", { name: host.firstName }) : tr("Booking") };
}

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { data: host } = await getHostById((await params).id);
  if (!host) notFound();

  return (
    <div className="bg-gradient-to-b from-blush/70 to-cream to-40%">
      <Container className="pb-24 pt-8 lg:pt-12">
        <Suspense fallback={<Skeleton className="h-[480px] w-full" />}>
          <BookingFlow host={host} />
        </Suspense>
      </Container>
    </div>
  );
}
