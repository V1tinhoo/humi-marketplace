import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getHostById } from "@/lib/data/hosts";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { Container, Skeleton } from "@/components/ui/primitives";
import { getT } from "@/i18n/server";

// Rendered per request: the page follows the visitor's language (cookie) and live presence.
export const dynamic = "force-dynamic";

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
