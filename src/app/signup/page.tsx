"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell, Field } from "@/components/auth/AuthShell";
import { RoleSwitch } from "@/components/auth/RoleSwitch";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";
import { Button, ButtonLink } from "@/components/ui/Button";
import { DemoNotice } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";
import { FormError } from "@/components/ui/FormError";
import { MailCheck } from "lucide-react";
import type { UserRole } from "@/types";
import { useT } from "@/i18n/client";
import { track } from "@/lib/analytics";

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signUp, mode, user } = useAuth();
  const tr = useT();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const minPw = mode === "supabase" ? 8 : 6;
  const [role, setRole] = useState<UserRole>(params.get("role") === "host" ? "host" : "customer");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [adult, setAdult] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = "Tell us what to call you.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid email address.";
    if (form.password.length < minPw) next.password = tr("Use at least {n} characters.", { n: minPw });
    if (!adult) next.adult = "HUMI is for adults 18 and over.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    const res = await signUp({ name: form.name.trim(), email: form.email.trim(), password: form.password, role });
    setLoading(false);
    if (res.error) return setErrors({ form: res.error });
    if (res.needsConfirmation) return setSentTo(form.email.trim());
    track("sign_up", { method: "email" });
    router.push(role === "host" ? "/become-a-host/apply" : "/explore");
    router.refresh();
  };

  return (
    <AuthShell
      title={role === "host" ? tr("Start hosting on HUMI") : tr("Join HUMI")}
      subtitle={<>{tr("Already have an account?")} <Link href="/login" className="font-semibold text-plum underline underline-offset-2">{tr("Log in")}</Link></>}
      aside={role}
    >
      {user && !sentTo ? (
        <div className="animate-fade-up rounded-2xl bg-white p-5 ring-1 ring-line">
          <p className="font-semibold">{tr("You're already logged in as {name}.", { name: user.name })}</p>
          <p className="mt-1 text-sm text-plum-soft">
            {user.role === "host" || user.role === "admin"
              ? tr("Your account is already a host account.")
              : tr("You don't need a new account — you can turn this one into a host account.")}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {user.role === "host" || user.role === "admin" ? (
              <ButtonLink href="/dashboard">{tr("Go to host dashboard")}</ButtonLink>
            ) : (
              <ButtonLink href="/become-a-host/apply">{tr("Become a host with this account")}</ButtonLink>
            )}
            <ButtonLink href="/account" variant="secondary">{tr("My account")}</ButtonLink>
          </div>
        </div>
      ) : sentTo ? (
        <div className="animate-fade-up">
          <div className="flex items-start gap-4 rounded-2xl bg-white p-5 ring-1 ring-line">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lilac"><MailCheck className="size-5" /></span>
            <div>
              <p className="font-semibold">{tr("Check your inbox")}</p>
              <p className="mt-1 text-sm text-plum-soft">{tr("We sent a confirmation link to")} <strong className="text-plum">{sentTo}</strong>. {tr("Click it to activate your account.")}</p>
            </div>
          </div>
        </div>
      ) : (<>
      <RoleSwitch value={role} onChange={setRole} />
      {/* Social sign-up never sets a role: people who chose "host" land on the host application instead. */}
      <SocialAuthButtons className="mt-6" next={role === "host" ? "/become-a-host/apply" : "/explore"} />
      <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
        <FormError message={errors.form} />
        <Field label={tr("First name")} name="name" autoComplete="given-name" value={form.name} onChange={set("name")} error={errors.name} placeholder={tr("Only your first name is shown publicly")} />
        <Field label={tr("Email")} name="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} error={errors.email} placeholder={tr("you@example.com")} />
        <Field label={tr("Password")} name="password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} error={errors.password} placeholder={tr("At least {n} characters", { n: minPw })} />
        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#493C62]" />
            <span>
              {tr("I confirm I'm 18 or older and agree to the")} <Link href="/terms" className="font-semibold underline underline-offset-2">{tr("Terms")}</Link>,{" "}
              <Link href="/privacy" className="font-semibold underline underline-offset-2">{tr("Privacy Policy")}</Link> {tr("and")}{" "}
              <Link href="/guidelines" className="font-semibold underline underline-offset-2">{tr("Community guidelines")}</Link>.
            </span>
          </label>
          {errors.adult && <p className="mt-1.5 text-xs font-medium text-[#a3324a]">{tr(errors.adult)}</p>}
        </div>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {loading ? tr("Creating account…") : role === "host" ? tr("Continue to host application") : tr("Create account")}
        </Button>
      </form>
      {mode === "demo" && (
        <DemoNotice className="mt-6">
          <strong>{tr("Demo sign-up.")}</strong> {tr("Supabase isn't configured, so no account is created on a server and no email is sent. Data stays in this browser's local storage.")}
        </DemoNotice>
      )}
      </>)}
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
