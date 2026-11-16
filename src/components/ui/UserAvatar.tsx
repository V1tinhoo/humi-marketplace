"use client";

import Image from "next/image";
import { useState } from "react";
import { cn, initials } from "@/lib/utils";
import { isOptimizableImage } from "@/lib/images";
import { useT } from "@/i18n/client";

/**
 * The signed-in person's photo, falling back to their initials when there's
 * no photo (or it fails to load). Size and shape come from `className`.
 */
export function UserAvatar({
  src,
  name,
  sizes = "40px",
  className,
  fallbackClassName,
}: {
  src?: string | null;
  name: string;
  sizes?: string;
  className?: string;
  /** Styling for the initials fallback (background, text size). */
  fallbackClassName?: string;
}) {
  const tr = useT();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = !!src && failedSrc !== src;

  return (
    <span className={cn("relative grid shrink-0 place-items-center overflow-hidden", className, !showPhoto && fallbackClassName)}>
      {showPhoto ? (
        <Image
          src={src}
          alt={tr("Photo of {name}", { name })}
          fill
          sizes={sizes}
          className="object-cover"
          unoptimized={!isOptimizableImage(src)}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}
