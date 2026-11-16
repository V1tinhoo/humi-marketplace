import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "dark" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-all duration-200 ease-out disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none";

const variants: Record<Variant, string> = {
  primary: "bg-lavender text-plum-deep hover:bg-lavender-strong shadow-[0_6px_20px_-8px_rgb(161_139_230/0.8)] hover:shadow-[0_10px_28px_-10px_rgb(161_139_230/0.9)]",
  dark: "bg-plum text-white hover:bg-plum-deep",
  secondary: "bg-white text-plum ring-1 ring-line hover:ring-lavender hover:bg-cream",
  outline: "bg-transparent text-plum ring-1 ring-plum/20 hover:ring-plum/50 hover:bg-white/60",
  ghost: "bg-transparent text-plum hover:bg-lilac/60",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-13 px-7 text-base",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

export function buttonClasses({ variant = "primary", size = "md", className }: Omit<CommonProps, "children">) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant,
  size,
  className,
  loading,
  children,
  ...props
}: CommonProps & ComponentProps<"button"> & { loading?: boolean }) {
  return (
    <button className={buttonClasses({ variant, size, className })} disabled={loading || props.disabled} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  children,
  ...props
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClasses({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}
