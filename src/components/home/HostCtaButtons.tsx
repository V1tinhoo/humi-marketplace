"use client";

import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/**
 * "Become a host" calls to action that depend on who is looking:
 * signed-out → sign up as host; member → host application; host → dashboard.
 */
export function HostCtaButtons({ single, className }: { single?: boolean; className?: string }) {
  const { user, mode } = useAuth();
  const tr = useT();
  const isHost = user?.role === "host" || user?.role === "admin";

  const primary = isHost
    ? { href: "/dashboard", label: tr("Go to host dashboard") }
    : user
      ? { href: "/become-a-host/apply", label: tr("Apply to host") }
      : { href: "/signup?role=host", label: tr("Apply to host") };

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row", className)}>
      <ButtonLink href={primary.href} size="lg" variant={single ? "primary" : "dark"}>
        {primary.label} <ArrowRight className="size-4" />
      </ButtonLink>
      {!single && !isHost && (
        user ? null : (
          <ButtonLink href={mode === "demo" ? "/login?role=host&next=/dashboard" : "/login?next=/become-a-host/apply"} size="lg" variant="secondary">
            {mode === "demo" ? tr("Preview host dashboard") : tr("I already have an account")}
          </ButtonLink>
        )
      )}
    </div>
  );
}
