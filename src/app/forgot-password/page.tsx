"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { AuthShell, Field } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { DemoNotice } from "@/components/ui/primitives";
import { sleep } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const { mode, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [state, setState] = useState<"idle" | "loading" | "sent">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address.");
    setError(undefined);
    setState("loading");
    if (mode === "demo") await sleep(900);
    else {
      const { error: err } = await requestPasswordReset(email.trim());
      if (err) {
        setError(err);
        setState("idle");
        return;
      }
    }
    setState("sent");
  };

  return (
    <AuthShell title={state === "sent" ? "Check your inbox" : "Reset your password"} subtitle={state === "sent" ? undefined : "Enter the email you signed up with and we'll send you a reset link."}>
      {state === "sent" ? (
        <div className="animate-fade-up">
          <div className="flex items-start gap-4 rounded-2xl bg-white p-5 ring-1 ring-line">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lilac"><MailCheck className="size-5" /></span>
            <p className="text-sm">
              If an account exists for <strong>{email}</strong>, {mode === "demo" ? "a reset link would be on its way." : "a reset link is on its way. It expires after one hour."}
            </p>
          </div>
          {mode === "demo" && <DemoNotice className="mt-4">Demo mode: no email was actually sent. Configure Supabase to send real reset emails.</DemoNotice>}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Field label="Email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} placeholder="you@example.com" />
          <Button type="submit" size="lg" className="w-full" loading={state === "loading"}>Send reset link</Button>
        </form>
      )}
      <Link href="/login" className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-plum-soft hover:text-plum">
        <ArrowLeft className="size-4" /> Back to log in
      </Link>
    </AuthShell>
  );
}
