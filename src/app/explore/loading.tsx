import { HostCardSkeleton } from "@/components/hosts/HostCard";
import { Container, Skeleton } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <Container className="pb-24 pt-10 lg:pt-14">
      <Skeleton className="h-12 w-80 max-w-full" />
      <Skeleton className="mt-4 h-5 w-96 max-w-full" />
      <Skeleton className="mt-8 h-13 w-full rounded-full" />
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <HostCardSkeleton key={i} />)}
      </div>
    </Container>
  );
}
