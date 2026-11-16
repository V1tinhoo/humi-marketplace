"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, PartyPopper } from "lucide-react";
import { Stepper } from "@/components/booking/Stepper";
import { Field } from "@/components/auth/AuthShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Container, DemoNotice } from "@/components/ui/primitives";
import { categories } from "@/data/categories";
import { categoryVisuals } from "@/components/home/CategoryCard";
import { useAuth } from "@/lib/auth";
import { cn, sleep } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import type { CategoryId } from "@/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { viewerTimeZone } from "@/lib/time";
import { FormError } from "@/components/ui/FormError";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { CountrySelect, RegionSelect, TagPicker } from "@/components/ui/ProfileFields";
import { INTEREST_SUGGESTIONS, countryFromCode, countryLabel } from "@/data/places";
import { useCountry, useLocale, useT } from "@/i18n/client";

const STEPS = ["About you", "Interests", "Rates", "Confirm"];
const LANGS = ["English", "Portuguese", "Spanish", "French", "German", "Italian", "Arabic", "Hindi", "Japanese", "Mandarin"];

export default function HostApplyPage() {
  const { user, mode, refreshProfile } = useAuth();
  const tr = useT();
  const locale = useLocale();
  const geoCountry = countryFromCode(useCountry());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  // Show the photo already on the profile, if any.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) return;
    supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle().then(({ data: p }) => setAvatar(p?.avatar_url ?? null));
  }, [user]);
  const [step, setStep] = useState(0);
  const [limits, setLimits] = useState({ min: 30, max: 500 });
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase
      ?.from("platform_settings")
      .select("key, value")
      .in("key", ["price_min_cents_per_minute", "price_max_cents_per_minute"])
      .then(({ data: rows }) => {
        const m = Object.fromEntries((rows ?? []).map((r) => [r.key, Number(r.value)]));
        if (m.price_min_cents_per_minute && m.price_max_cents_per_minute) setLimits({ min: m.price_min_cents_per_minute, max: m.price_max_cents_per_minute });
      });
  }, []);
  const [data, setData] = useState({
    name: user?.name ?? "",
    // Pre-filled with the country detected from the visitor's location (they can change it).
    country: geoCountry ?? "",
    region: "",
    bio: "",
    languages: [] as string[],
    interests: [] as string[],
    cats: [] as CategoryId[],
    rate: 50, // starting price per minute in cents (R$ 0,50)
    adult: false,
    rules: false,
  });
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  const toggleIn = <K extends "languages" | "interests" | "cats">(k: K, v: (typeof data)[K][number]) =>
    setData((d) => {
      const arr = d[k] as string[];
      return { ...d, [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] };
    });

  const valid = [
    data.name.trim().length > 1 && data.country.trim().length > 1 && data.bio.trim().length >= 20 && data.languages.length > 0,
    data.interests.length >= 2 && data.cats.length >= 1,
    true,
    data.adult && data.rules,
  ][step];

  const submit = async () => {
    setState("loading");
    setSubmitError(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) {
      await sleep(1400);
      setState("done");
      return;
    }
    // Members become hosts through a server-side function (roles can't be edited directly).
    const { data: hostId, error: rpcError } = await supabase.rpc("become_host");
    const fail = (msg: string) => {
      setSubmitError(msg);
      setState("idle");
    };
    if (rpcError || !hostId) return fail(rpcError?.message ?? tr("Couldn't create your host profile."));
    const firstName = data.name.trim().split(" ")[0].slice(0, 40);
    const [a, b] = await Promise.all([
      supabase
        .from("host_profiles")
        .update({
          display_name: firstName,
          description: data.bio.trim(),
          categories: data.cats,
          // Availability is entered in the host's local time, so the profile needs their real zone (not the UTC default).
          timezone: viewerTimeZone(),
        })
        .eq("id", hostId),
      supabase
        .from("profiles")
        .update({ full_name: data.name.trim(), country: data.country.trim(), region: data.region || null, languages: data.languages, interests: data.interests })
        .eq("id", user.id),
    ]);
    const err = a.error ?? b.error;
    if (err) return fail(err.message);
    // The real price (per minute) lives in host_pricing and is validated by the server.
    const price = Math.min(limits.max, Math.max(limits.min, data.rate));
    const { error: priceErr } = await supabase.rpc("set_host_pricing", { p_audio_cents: price, p_video_cents: null });
    if (priceErr) return fail(priceErr.message);
    await refreshProfile();
    setState("done");
  };

  if (state === "done") {
    return (
      <Container className="max-w-xl py-24 text-center">
        <span className="mx-auto grid size-20 place-items-center rounded-full bg-lavender"><PartyPopper className="size-9" strokeWidth={1.75} /></span>
        <h1 className="mt-8 text-3xl font-extrabold tracking-tight sm:text-4xl">{mode === "supabase" ? tr("Your host profile is ready") : tr("Application received (demo)")}</h1>
        <p className="mt-3 text-plum-soft">
          {mode === "supabase"
            ? tr("Thanks, {name}! Next: add a photo, your price and your weekly availability in the dashboard, then switch on “Listed in Explore”.", { name: data.name.split(" ")[0] })
            : tr("Thanks, {name}! In the live product, our team would review your profile and invite you to verify your identity. In this preview, nothing was submitted.", { name: data.name.split(" ")[0] })}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href={mode === "supabase" || user?.role === "host" ? "/dashboard" : "/login?role=host&next=/dashboard"}>{mode === "supabase" ? tr("Go to host dashboard") : tr("Preview host dashboard")}</ButtonLink>
          <ButtonLink href="/" variant="secondary">{tr("Back home")}</ButtonLink>
        </div>
      </Container>
    );
  }

  return (
    <Container className="max-w-3xl pb-24 pt-10">
      <p className="text-sm font-medium text-plum-soft">{tr("Host application")}</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">{tr("Let's set up your host profile")}</h1>
      <div className="mt-8">
        <Stepper steps={STEPS.map((s) => tr(s))} current={step} onJump={setStep} />
      </div>

      <div key={step} className="mt-10 animate-fade-up rounded-[var(--radius-card)] bg-white p-6 ring-1 ring-line sm:p-8">
        {step === 0 && (
          <div className="space-y-5">
            {mode === "supabase" ? (
              <AvatarUpload value={avatar} name={data.name} onChange={setAvatar} size="md" />
            ) : (
              <div className="flex items-center gap-4">
                <span className="grid size-20 shrink-0 place-items-center rounded-2xl border-2 border-dashed border-lavender bg-cream text-plum-soft" aria-hidden>
                  <Camera className="size-6" />
                </span>
                <p className="text-sm text-plum-soft">{tr("A clear, friendly photo of your face. Photo uploads work once Supabase is connected.")}</p>
              </div>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={tr("First name")} name="hname" value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} />
              <CountrySelect value={data.country} onChange={(v) => setData((d) => ({ ...d, country: v, region: v === d.country ? d.region : "" }))} />
              <RegionSelect country={data.country} value={data.region} onChange={(v) => setData((d) => ({ ...d, region: v }))} />
            </div>
            <div>
              <label htmlFor="hbio" className="text-sm font-semibold">{tr("Introduce yourself")}</label>
              <textarea
                id="hbio"
                rows={4}
                value={data.bio}
                onChange={(e) => setData({ ...data, bio: e.target.value })}
                placeholder={tr("What do you love talking about? What's a conversation with you like?")}
                className="mt-2 w-full rounded-xl bg-white p-4 text-[15px] ring-1 ring-line outline-none focus:ring-2 focus:ring-lavender"
              />
              <p className="mt-1 text-xs text-plum-soft">{tr("{n}/20 characters minimum", { n: data.bio.trim().length })}</p>
            </div>
            <ChipGroup label={tr("Languages you speak")} options={LANGS} display={(o) => tr(o)} selected={data.languages} onToggle={(v) => toggleIn("languages", v)} />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-8">
            <div>
              <p className="text-sm font-semibold">{tr("What kind of sessions do you want to offer?")}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {categories.map((c) => {
                  const Icon = categoryVisuals[c.id].icon;
                  const on = data.cats.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleIn("cats", c.id)}
                      aria-pressed={on}
                      className={cn("flex items-start gap-3 rounded-2xl p-4 text-left transition", on ? "bg-lilac ring-2 ring-plum" : "bg-cream ring-1 ring-line hover:ring-lavender")}
                    >
                      <Icon className="mt-0.5 size-5 shrink-0" />
                      <span>
                        <span className="block font-semibold">{tr(c.title)}</span>
                        <span className="block text-sm text-plum-soft">{tr(c.description)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <TagPicker
              label={tr("Pick at least two interests")}
              value={data.interests}
              onChange={(v) => setData((d) => ({ ...d, interests: v }))}
              suggestions={INTEREST_SUGGESTIONS}
              max={20}
            />
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="hrate" className="font-semibold">{tr("Your price per minute")}</label>
              <span className="text-4xl font-extrabold">{formatBRL(data.rate)}<span className="text-base font-semibold text-plum-soft">/min</span></span>
            </div>
            <input id="hrate" type="range" min={limits.min} max={limits.max} step={10} value={Math.min(limits.max, Math.max(limits.min, data.rate))} onChange={(e) => setData({ ...data, rate: Number(e.target.value) })} className="mt-5 w-full accent-[#493C62]" />
            <div className="mt-1 flex justify-between text-xs text-plum-soft">
              <span>{formatBRL(limits.min)}/min</span>
              <span>{tr("{price} limit", { price: `${formatBRL(limits.max)}/min` })}</span>
            </div>
            <p className="mt-4 text-sm text-plum-soft">{tr("A 30-minute call at this price: {total}. Guests pay per second, only while you're both connected.", { total: formatBRL(data.rate * 30) })}</p>
            <p className="mt-6 rounded-2xl bg-blush p-4 text-sm">{tr("You can change your price, and add a video price, any time in the dashboard.")}</p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-cream p-5 text-sm">
              <p><span className="text-plum-soft">{tr("Name")}:</span> <strong>{data.name}</strong> · {countryLabel(data.country, locale)}</p>
              <p className="mt-1"><span className="text-plum-soft">{tr("Languages")}:</span> {data.languages.map((l) => tr(l)).join(", ")}</p>
              <p className="mt-1"><span className="text-plum-soft">{tr("Interests")}:</span> {data.interests.join(", ")}</p>
              <p className="mt-1"><span className="text-plum-soft">{tr("Price")}:</span> {formatBRL(data.rate)}/min</p>
            </div>
            <Check label={tr("I'm 18 or older and will complete identity verification before hosting.")} checked={data.adult} onChange={(v) => setData({ ...data, adult: v })} />
            <Check
              label={tr("I'll follow the community guidelines: no dating, no therapy or professional advice, no sexual content, and no moving sessions off HUMI.")}
              checked={data.rules}
              onChange={(v) => setData({ ...data, rules: v })}
            />
            {mode === "demo" && <DemoNotice>{tr("This application isn't sent anywhere in the beta preview.")}</DemoNotice>}
            <FormError message={submitError} />
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-between">
        <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>
          <ArrowLeft className="size-4" /> {tr("Back")}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button size="lg" onClick={() => setStep(step + 1)} disabled={!valid}>{tr("Continue")} <ArrowRight className="size-4" /></Button>
        ) : (
          <Button size="lg" onClick={submit} disabled={!valid} loading={state === "loading"}>{tr("Submit application")}</Button>
        )}
      </div>
    </Container>
  );
}

function ChipGroup({ label, options, selected, onToggle, display = (o) => o }: { label: string; options: string[]; selected: string[]; onToggle: (v: string) => void; display?: (o: string) => string }) {
  return (
    <div>
      <p className="text-sm font-semibold">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onToggle(o)}
              aria-pressed={on}
              className={cn("rounded-full px-3.5 py-2 text-sm font-medium transition", on ? "bg-plum text-white" : "bg-cream ring-1 ring-line hover:ring-lavender")}
            >
              {display(o)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-4 text-sm ring-1 ring-line">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#493C62]" />
      <span>{label}</span>
    </label>
  );
}
