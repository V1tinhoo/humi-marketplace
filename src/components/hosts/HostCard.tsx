import Link from "next/link";
import { ArrowUpRight, Languages, MapPin } from "lucide-react";
import type { Host } from "@/types";
import { HostPhoto, PresenceBadge, Rating } from "./HostBits";
import { Skeleton } from "@/components/ui/primitives";
import { formatBRL } from "@/lib/money";
import { isNewHost, sessionsLabel } from "@/lib/utils";

export function HostCard({ host, priority }: { host: Host; priority?: boolean }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] bg-white ring-1 ring-line transition-all duration-300 hover:-translate-y-1 hover:shadow-lift hover:ring-lavender/70">
      <div className="relative">
        <HostPhoto
          src={host.photo}
          name={host.firstName}
          priority={priority}
          className="aspect-[4/4.2] [&_img]:group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-plum-deep/60 to-transparent" />
        <PresenceBadge online={host.online} className="absolute left-3 top-3" />
        {host.isSample && (
          <span className="absolute right-3 top-3 rounded-full bg-plum/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
            Sample
          </span>
        )}
        <div className="absolute inset-x-4 bottom-3 flex items-end justify-between text-white">
          <h3 className="text-xl font-bold tracking-tight">
            {host.firstName}{host.age ? <>, <span className="font-medium">{host.age}</span></> : null}
          </h3>
          <span className="flex items-center gap-1 text-xs font-medium text-white/90">
            <MapPin className="size-3.5" aria-hidden /> {host.country}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          {host.reviewCount > 0 ? (
            <Rating value={host.rating} count={host.reviewCount} />
          ) : isNewHost(host) ? (
            <span className="rounded-full bg-lilac px-2 py-0.5 text-xs font-semibold text-plum">New host</span>
          ) : (
            <span className="text-xs font-semibold text-plum">{sessionsLabel(host.sessionsCompleted)}</span>
          )}
          <span className="flex min-w-0 items-center gap-1 text-xs text-plum-soft">
            <Languages className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{host.languages.join(", ")}</span>
          </span>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-plum-soft">{host.tagline}</p>

        <ul className="mb-4 mt-3 flex flex-wrap gap-1.5" aria-label="Interests">
          {host.interests.map((i) => (
            <li key={i} className="rounded-full bg-blush px-2.5 py-1 text-xs font-medium text-plum">
              {i}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex items-center justify-between border-t border-line pt-4">
          <p className="text-sm text-plum-soft">
            <span className="text-lg font-bold text-plum">{formatBRL(host.priceAudioCents)}</span> / min
          </p>
          <Link
            href={`/hosts/${host.id}`}
            className="inline-flex items-center gap-1 rounded-full bg-lilac px-3.5 py-2 text-sm font-semibold text-plum transition-colors group-hover:bg-lavender after:absolute after:inset-0"
            aria-label={`View ${host.firstName}'s profile`}
          >
            View profile <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function HostCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] bg-white ring-1 ring-line" aria-hidden>
      <Skeleton className="aspect-[4/4.2] rounded-none" />
      <div className="space-y-3 p-4">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-1.5">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-14 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="flex justify-between border-t border-line pt-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
      </div>
    </div>
  );
}
