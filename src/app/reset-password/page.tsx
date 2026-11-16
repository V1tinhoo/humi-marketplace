"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { AuthShell, Field } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { DemoNotice } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { mode, user, updatePassword } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [errors, setErrors] = useState<{ pw?: string; pw2?: string; form?: string }>({});
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (pw.length < 8) next.pw = "Use at least 8 characters.";
    if (pw2 !== pw) next.pw2 = "Passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setState("loading");
    const { error } = await updatePassword(pw);
    if (error) {
      setErrors({ form: error });
      setState("idle");
      return;
    }
    setState("done");
    setTimeout(() => router.push(user?.role === "host" ? "/dashboard" : "/account"), 1500);
  };

  return (
    <AuthShell title="Choose a new password" subtitle="Pick something you haven't used before.">
      {mode === "demo" ? (
        <DemoNotice>Password reset needs Supabase. Add your project keys to <code>.env.local</code> to enable it.</DemoNotice>
      ) : state === "done" ? (
        <div className="flex animate-fade-up items-center gap-3 rounded-2xl bg-white p-5 ring-1 ring-line">
          <CheckCircle2 className="size-6 text-online" />
          <p className="font-semibold">Password updated. Taking you to your account…</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Field label="New password" name="password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={errors.pw} />
          <Field label="Confirm password" name="password2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} error={errors.pw2} />
          {errors.form && <p role="alert" className="rounded-xl bg-[#fde8ea] px-4 py-3 text-sm text-[#7a2232]">{errors.form}</p>}
          <Button type="submit" size="lg" className="w-full" loading={state === "loading"}>Update password</Button>
        </form>
      )}
    </AuthShell>
  );
}
