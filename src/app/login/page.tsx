"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell, Field } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { DemoNotice } from "@/components/ui/primitives";
import { FormError } from "@/components/ui/FormError";
import { useAuth } from "@/lib/auth";
import type { UserRole } from "@/types";
import { RoleSwitch } from "@/components/auth/RoleSwitch";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";
import { useT } from "@/i18n/client";

const safeNext = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") ? v : null);

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn, mode } = useAuth();
  const tr = useT();
  const [role, setRole] = useState<UserRole>(params.get("role") === "host" ? "host" : "customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({ form: params.get("error") ?? undefined });
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Enter a valid email address.";
    if (password.length < 6) next.password = "Password must be at least 6 characters.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    const { user, error } = await signIn(email.trim(), password, role);
    if (error || !user) {
      setErrors({ form: error ?? "Couldn't log you in." });
      setLoading(false);
      return;
    }
    router.push(safeNext(params.get("next")) ?? (user.role === "host" ? "/dashboard" : "/account"));
    router.refresh();
  };

  return (
    <AuthShell
      title={tr("Welcome back")}
      subtitle={<>{tr("New to HUMI?")} <Link href="/signup" className="font-semibold text-plum underline underline-offset-2">{tr("Create an account")}</Link></>}
      aside={role}
    >
      {/* With real accounts the role comes from the profile; the switch is only needed for demo accounts. */}
      {mode === "demo" && <RoleSwitch value={role} onChange={setRole} />}
      <SocialAuthButtons next={safeNext(params.get("next")) ?? undefined} className={mode === "demo" ? "mt-6" : undefined} />
      <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
        <FormError message={errors.form} />
        <Field label={tr("Email")} name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder={tr("you@example.com")} />
        <Field
          label={tr("Password")}
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={<Link href="/forgot-password" className="text-xs font-semibold text-plum-soft hover:text-plum">{tr("Forgot password?")}</Link>}
        />
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {loading ? tr("Logging in…") : mode === "demo" ? (role === "host" ? tr("Log in as host") : tr("Log in as member")) : tr("Log in")}
        </Button>
      </form>
      {mode === "demo" && (
        <DemoNotice className="mt-6">
          <strong>{tr("Demo authentication.")}</strong> {tr("Supabase isn't configured, so any email and a 6+ character password will work and the account lives in this browser only. Don't use a real password.")}
        </DemoNotice>
      )}
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
