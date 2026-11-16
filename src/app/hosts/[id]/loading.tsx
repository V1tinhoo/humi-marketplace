import { Container, Skeleton } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <Container className="pb-24 pt-10">
      <Skeleton className="h-4 w-32" />
      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="grid gap-6 sm:grid-cols-[300px_1fr] sm:items-end">
            <Skeleton className="aspect-[4/5] rounded-[1.75rem]" />
            <div className="space-y-4">
              <Skeleton className="h-6 w-40 rounded-full" />
              <Skeleton className="h-12 w-64" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Skeleton className="mt-12 h-6 w-40" />
          <Skeleton className="mt-4 h-24 w-full" />
        </div>
        <Skeleton className="h-[460px] rounded-[1.25rem]" />
      </div>
    </Container>
  );
}
