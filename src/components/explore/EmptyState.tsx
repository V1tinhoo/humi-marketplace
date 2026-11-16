import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-white px-6 py-16 text-center ring-1 ring-line">
      <div aria-hidden className="absolute left-1/2 top-10 size-40 -translate-x-1/2 rounded-full bg-blush blur-2xl" />
      <div className="relative mx-auto grid size-20 place-items-center">
        <span className="absolute size-20 rounded-full bg-lilac" />
        <span className="absolute size-14 translate-x-5 rounded-full bg-rose/70 mix-blend-multiply" />
        <SearchX className="relative size-7 text-plum" strokeWidth={1.75} />
      </div>
      <h3 className="relative mt-6 text-xl font-bold">No one matches that — yet.</h3>
      <p className="relative mx-auto mt-2 max-w-sm text-sm text-plum-soft">
        Try a different interest, widen your price range, or turn off &ldquo;Online now&rdquo;. New hosts join all the time.
      </p>
      <Button onClick={onReset} variant="dark" className="relative mt-6">
        Clear filters
      </Button>
    </div>
  );
}
