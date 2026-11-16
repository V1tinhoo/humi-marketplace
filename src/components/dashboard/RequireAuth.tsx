"use client";

import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { ButtonLink } from "@/components/ui/Button";
import { Container, Skeleton } from "@/components/ui/primitives";
import type { UserRole } from "@/types";
import { useT } from "@/i18n/client";

export function RequireAuth({ role, children, next }: { role?: UserRole; children: ReactNode; next: string }) {
  const { user, ready, mode } = useAuth();
  const tr = useT();

  if (!ready) {
    return (
      <Container className="py-12">
        <Skeleton className="h-10 w-64" />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="mt-6 h-72" />
      </Container>
    );
  }

  // Admins may open every area.
  if (!user || (role && user.role !== role && user.role !== "admin")) {
    const wantsHost = role === "host";
    return (
      <Container className="grid min-h-[60vh] place-items-center py-20 text-center">
        <div className="max-w-md">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-lilac"><Lock className="size-6" /></span>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight">
            {user && wantsHost ? tr("This area is for hosts") : tr("Log in to continue")}
          </h1>
          <p className="mt-3 text-plum-soft">
            {user && wantsHost
              ? mode === "supabase"
                ? tr("You're signed in with a member account. Apply to host to unlock the host dashboard.")
                : tr("You're signed in with a member account. Log in with a host demo account to preview the host dashboard.")
              : mode === "supabase"
                ? tr("Please log in to see this page.")
                : tr("Sign in with any demo account to see this page. Nothing is sent to a server.")}
          </p>
          <div className="mt-8 flex justify-center gap-3">
            {user && wantsHost && mode === "supabase" ? (
              <ButtonLink href="/become-a-host/apply">{tr("Apply to host")}</ButtonLink>
            ) : (
            <ButtonLink href={`/login?next=${encodeURIComponent(next)}${wantsHost ? "&role=host" : ""}`}>{tr("Log in")}</ButtonLink>
            )}
            <ButtonLink href={wantsHost ? "/signup?role=host" : "/signup"} variant="secondary">{tr("Sign up")}</ButtonLink>
          </div>
        </div>
      </Container>
    );
  }

  return <>{children}</>;
}
