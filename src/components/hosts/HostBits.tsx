"use client";

import Image from "next/image";
import { useState } from "react";
import { Star } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { isOptimizableImage as isOptimizable } from "@/lib/images";

export function HostPhoto({
  src,
  name,
  className,
  sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw",
  priority,
}: {
  src: string;
  name: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn("relative overflow-hidden bg-lilac", className)}>
      {/* Shimmer sits underneath and is simply covered once the photo paints. */}
      <div className="skeleton absolute inset-0 rounded-none" aria-hidden />
      {!failed && src ? (
        <Image
          src={src}
          alt={`Portrait of ${name}`}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={!isOptimizable(src)}
          onError={() => setFailed(true)}
          className="object-cover transition-transform duration-700"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-lilac to-blush text-3xl font-bold text-plum">
          {initials(name)}
        </div>
      )}
    </div>
  );
}

export function Rating({ value, count, className }: { value: number; count?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-semibold text-plum", className)}>
      <Star className="size-3.5 fill-plum text-plum" aria-hidden />
      {value.toFixed(1)}
      {count !== undefined && <span className="font-normal text-plum-soft">({count})</span>}
      <span className="sr-only">out of 5 stars</span>
    </span>
  );
}

export function PresenceBadge({ online, className }: { online: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold backdrop-blur-md",
        online ? "bg-white/90 text-online" : "bg-white/80 text-plum-soft",
        className,
      )}
    >
      <span className="relative flex size-2">
        {online && <span className="absolute inline-flex size-full animate-ping rounded-full bg-online opacity-60" />}
        <span className={cn("relative inline-flex size-2 rounded-full", online ? "bg-online" : "bg-plum-soft/50")} />
      </span>
      {online ? "Online" : "Offline"}
    </span>
  );
}
