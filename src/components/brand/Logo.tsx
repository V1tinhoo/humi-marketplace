import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * HUMI mark: two overlapping circles — two people — whose overlap forms
 * the shared space of a conversation. Paired with a lowercase wordmark.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 28" className={cn("h-7 w-10", className)} aria-hidden>
      <circle cx="14" cy="14" r="11" fill="#B9A7EF" />
      <circle cx="26" cy="14" r="11" fill="#E9BFD3" style={{ mixBlendMode: "multiply" }} />
      <path d="M20 4.8a11 11 0 0 1 0 18.4a11 11 0 0 1 0-18.4Z" fill="#493C62" />
    </svg>
  );
}

export function Logo({ className, href = "/", light = false }: { className?: string; href?: string; light?: boolean }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2", className)} aria-label="HUMI home">
      <LogoMark className="transition-transform duration-300 group-hover:scale-105" />
      <span className={cn("text-[1.6rem] font-extrabold leading-none tracking-[-0.04em]", light ? "text-white" : "text-plum")}>
        humi
      </span>
    </Link>
  );
}
