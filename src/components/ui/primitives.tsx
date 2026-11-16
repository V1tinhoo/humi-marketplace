import type { ComponentProps, ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)} {...props} />;
}

export function Badge({
  tone = "lilac",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: "lilac" | "blush" | "white" | "plum" | "online" }) {
  const tones = {
    lilac: "bg-lilac text-plum",
    blush: "bg-blush text-plum",
    white: "bg-white text-plum ring-1 ring-line",
    plum: "bg-plum text-white",
    online: "bg-online/10 text-online",
  };
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium leading-none", tones[tone], className)}
      {...props}
    />
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-[0.16em] text-plum-soft", className)}>{children}</p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "left",
  className,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "items-center text-center" : "md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
        <h2 className="text-balance text-3xl font-bold tracking-tight text-plum sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
          {title}
        </h2>
        {subtitle && <p className="mt-4 text-pretty text-base text-plum-soft sm:text-lg">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} aria-hidden />;
}

/** Marks anything that is simulated, so demo behaviour is never mistaken for production. */
export function DemoNotice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-2xl border border-dashed border-lavender bg-lilac/40 px-4 py-3 text-sm text-plum",
        className,
      )}
    >
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-plum-soft" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[var(--radius-card)] bg-white ring-1 ring-line", className)} {...props} />;
}
