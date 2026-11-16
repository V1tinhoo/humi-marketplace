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

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signUp, mode, user } = useAuth();
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
    if (form.password.length < minPw) next.password = `Use at least ${minPw} characters.`;
    if (!adult) next.adult = "HUMI is for adults 18 and over.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    const res = await signUp({ name: form.name.trim(), email: form.email.trim(), password: form.password, role });
    setLoading(false);
    if (res.error) return setErrors({ form: res.error });
    if (res.needsConfirmation) return setSentTo(form.email.trim());
    router.push(role === "host" ? "/become-a-host/apply" : "/explore");
    router.refresh();
  };

  return (
    <AuthShell
      title={role === "host" ? "Start hosting on HUMI" : "Join HUMI"}
      subtitle={<>Already have an account? <Link href="/login" className="font-semibold text-plum underline underline-offset-2">Log in</Link></>}
      aside={role}
    >
      {user && !sentTo ? (
        <div className="animate-fade-up rounded-2xl bg-white p-5 ring-1 ring-line">
          <p className="font-semibold">You&apos;re already logged in as {user.name}.</p>
          <p className="mt-1 text-sm text-plum-soft">
            {user.role === "host" || user.role === "admin"
              ? "Your account is already a host account."
              : "You don't need a new account — you can turn this one into a host account."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {user.role === "host" || user.role === "admin" ? (
              <ButtonLink href="/dashboard">Go to host dashboard</ButtonLink>
            ) : (
              <ButtonLink href="/become-a-host/apply">Become a host with this account</ButtonLink>
            )}
            <ButtonLink href="/account" variant="secondary">My account</ButtonLink>
          </div>
        </div>
      ) : sentTo ? (
        <div className="animate-fade-up">
          <div className="flex items-start gap-4 rounded-2xl bg-white p-5 ring-1 ring-line">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lilac"><MailCheck className="size-5" /></span>
            <div>
              <p className="font-semibold">Check your inbox</p>
              <p className="mt-1 text-sm text-plum-soft">We sent a confirmation link to <strong className="text-plum">{sentTo}</strong>. Click it to activate your account.</p>
            </div>
          </div>
        </div>
      ) : (<>
      <RoleSwitch value={role} onChange={setRole} />
      {/* Social sign-up never sets a role: people who chose "host" land on the host application instead. */}
      <SocialAuthButtons className="mt-6" next={role === "host" ? "/become-a-host/apply" : "/explore"} />
      <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
        <FormError message={errors.form} />
        <Field label="First name" name="name" autoComplete="given-name" value={form.name} onChange={set("name")} error={errors.name} placeholder="Only your first name is shown publicly" />
        <Field label="Email" name="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} error={errors.email} placeholder="you@example.com" />
        <Field label="Password" name="password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} error={errors.password} placeholder={`At least ${minPw} characters`} />
        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#493C62]" />
            <span>
              I confirm I&apos;m 18 or older and agree to the <Link href="/terms" className="font-semibold underline underline-offset-2">Terms</Link>,{" "}
              <Link href="/privacy" className="font-semibold underline underline-offset-2">Privacy Policy</Link> and{" "}
              <Link href="/guidelines" className="font-semibold underline underline-offset-2">Community guidelines</Link>.
            </span>
          </label>
          {errors.adult && <p className="mt-1.5 text-xs font-medium text-[#a3324a]">{errors.adult}</p>}
        </div>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {loading ? "Creating account…" : role === "host" ? "Continue to host application" : "Create account"}
        </Button>
      </form>
      {mode === "demo" && (
        <DemoNotice className="mt-6">
          <strong>Demo sign-up.</strong> Supabase isn&apos;t configured, so no account is created on a server and no email is sent. Data stays in this browser&apos;s local storage.
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
