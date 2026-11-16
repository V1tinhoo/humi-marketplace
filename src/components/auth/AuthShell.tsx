import type { ReactNode } from "react";
import Image from "next/image";
import { hosts } from "@/data/hosts";
import { LogoMark } from "@/components/brand/Logo";

export function AuthShell({ title, subtitle, children, aside }: { title: string; subtitle?: ReactNode; children: ReactNode; aside?: "customer" | "host" }) {
  const faces = (aside === "host" ? ["amara", "walter", "leo", "elena"] : ["sophie", "alex", "maya", "omar"]).map((id) => hosts.find((h) => h.id === id)!);
  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-24 pt-8 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:pt-14">
      <div className="mx-auto w-full max-w-md lg:py-8">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <div className="mt-3 text-plum-soft">{subtitle}</div>}
        <div className="mt-8">{children}</div>
      </div>

      <div className="relative hidden overflow-hidden rounded-[2rem] bg-gradient-to-br from-lilac via-blush to-cream p-10 lg:flex lg:flex-col">
        <div aria-hidden className="absolute -right-20 -top-20 size-72 rounded-full border-[36px] border-white/40" />
        <LogoMark className="relative h-10 w-14" />
        <p className="relative mt-auto max-w-sm text-balance text-3xl font-bold leading-tight tracking-tight text-plum-deep">
          {aside === "host" ? "Share what you love with people around the world." : "A little more human. A little less alone."}
        </p>
        <div className="relative mt-8 grid grid-cols-4 gap-3">
          {faces.map((f, i) => (
            <div key={f.id} className={`relative aspect-[3/4] overflow-hidden rounded-2xl ring-4 ring-white/70 ${i % 2 ? "translate-y-4" : ""}`}>
              <Image src={f.photo} alt="" fill sizes="140px" className="object-cover" />
            </div>
          ))}
        </div>
        <p className="relative mt-10 text-xs text-plum-soft">Sample portraits for demonstration.</p>
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  ...props
}: React.ComponentProps<"input"> & { label: string; hint?: ReactNode; error?: string }) {
  const id = props.id ?? props.name;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-semibold">{label}</label>
        {hint}
      </div>
      <input
        id={id}
        {...props}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-2 h-12 w-full rounded-xl bg-white px-4 text-[15px] ring-1 outline-none transition placeholder:text-plum-soft/60 focus:ring-2 ${error ? "ring-[#c2405a] focus:ring-[#c2405a]" : "ring-line focus:ring-lavender"}`}
      />
      {error && <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-[#a3324a]">{error}</p>}
    </div>
  );
}
