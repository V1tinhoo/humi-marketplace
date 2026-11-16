import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Clock, Gift, Globe2, MessageCircleHeart, ShieldCheck, Wallet } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/primitives";
import { HostCard } from "@/components/hosts/HostCard";
import { getHosts } from "@/lib/data/hosts";
import { getPromo } from "@/lib/promo";
import { formatBRL } from "@/lib/money";
import { getT } from "@/i18n/server";

/**
 * Landing page for ads: "practise languages by talking to real people".
 * Use it as the destination of paid campaigns, with utm_* parameters in the link.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return {
    title: tr("Practise languages by talking to real people"),
    description: tr("Video and audio conversations with people from around the world, billed per minute. No lessons, no homework: just real conversation."),
  };
}

const PRACTICE = ["English", "Spanish", "French", "Italian", "German", "Japanese", "Mandarin", "Korean"];

export default async function PracticeLanguagesPage() {
  const tr = await getT();
  const [{ data: hosts }, promo] = await Promise.all([getHosts(), getPromo()]);
  const speakers = hosts
    .filter((h) => h.languages.some((l) => PRACTICE.includes(l)))
    .sort((a, b) => Number(b.online) - Number(a.online) || b.rating - a.rating)
    .slice(0, 6);
  const onlineNow = speakers.filter((h) => h.online).length;
  const minPrice = hosts.length ? Math.min(...hosts.map((h) => h.priceAudioCents)) : null;
  const bonus = promo && promo.firstBonusCents > 0 ? promo : null;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-lilac via-blush to-cream">
        <Container className="relative grid gap-10 py-14 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-20">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-sm font-semibold text-plum ring-1 ring-line">
              <Globe2 className="size-4" /> {tr("English, Spanish and more")}
            </p>
            <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight text-plum-deep sm:text-6xl">
              {tr("Practise languages by talking to real people")}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-plum">
              {tr("Video or audio conversations with people from around the world. No lessons, no homework: you talk about what you like and lose your fear of speaking.")}
            </p>
            <ul className="mt-6 grid gap-2 text-[15px] text-plum">
              {[
                minPrice != null ? tr("From {price} per minute, billed per second", { price: formatBRL(minPrice) }) : tr("Billed per second, only while you're talking"),
                tr("No subscription: top up with Pix or card and use whenever you want"),
                tr("Pick who you talk to by language, interests and ratings"),
              ].map((b) => (
                <li key={b} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-plum text-white"><Check className="size-3.5" strokeWidth={3} /></span>
                  {b}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/signup" size="lg">
                {tr("Start talking")} <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href="/explore" size="lg" variant="secondary">{tr("See who's online")}</ButtonLink>
            </div>
            {bonus && (
              <p className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-plum shadow-soft ring-1 ring-line">
                <Gift className="size-4 text-[#c2405a]" />
                {tr("Welcome bonus: {bonus} extra on your first top-up of {min} or more", { bonus: formatBRL(bonus.firstBonusCents), min: formatBRL(bonus.firstBonusMinCents) })}
              </p>
            )}
          </div>

          <div className="grid gap-3 rounded-[2rem] bg-white/70 p-5 ring-1 ring-white backdrop-blur sm:p-6">
            {[
              [MessageCircleHeart, tr("Real conversation"), tr("Talk about travel, games, films, work — whatever you enjoy. That's how fluency comes.")],
              [Clock, tr("Your time, your pace"), tr("5 minutes or an hour. Pay only for the time you're connected.")],
              [Wallet, tr("Pay as you go"), tr("Add balance with Pix or card. No monthly fee, no commitment.")],
              [ShieldCheck, tr("Safe and respectful"), tr("Adults only, report button in every call, and calls aren't recorded.")],
            ].map(([Icon, title, body]) => {
              const I = Icon as typeof Clock;
              return (
                <div key={title as string} className="flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-line">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lilac"><I className="size-5" /></span>
                  <div>
                    <p className="font-semibold">{title as string}</p>
                    <p className="text-sm text-plum-soft">{body as string}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* Hosts */}
      {speakers.length > 0 && (
        <section className="py-16">
          <Container>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">{tr("People you can practise with")}</h2>
                <p className="mt-2 text-plum-soft">
                  {onlineNow > 0 ? tr("{n} online right now", { n: onlineNow }) : tr("Book a time or come back when they're online.")}
                </p>
              </div>
              <Link href="/explore" className="inline-flex items-center gap-1.5 text-sm font-semibold text-plum">
                {tr("See everyone")} <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {speakers.map((h) => <HostCard key={h.id} host={h} />)}
            </div>
          </Container>
        </section>
      )}

      {/* How it works */}
      <section className="bg-blush/60 py-16">
        <Container className="max-w-4xl">
          <h2 className="text-center text-3xl font-bold tracking-tight">{tr("How it works")}</h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              [tr("Create your account"), tr("It takes less than a minute, with e-mail or Google.")],
              [tr("Add balance"), tr("Pix or card, starting at a few reais.")],
              [tr("Call and talk"), tr("Choose someone online and start an audio or video call.")],
            ].map(([title, body], i) => (
              <li key={title} className="rounded-[var(--radius-card)] bg-white p-6 ring-1 ring-line">
                <span className="grid size-10 place-items-center rounded-full bg-lavender font-bold text-plum-deep">{i + 1}</span>
                <p className="mt-4 font-semibold">{title}</p>
                <p className="mt-1 text-sm text-plum-soft">{body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 text-center">
            <ButtonLink href="/signup" size="lg">
              {tr("Create my free account")} <ArrowRight className="size-4" />
            </ButtonLink>
            <p className="mt-3 text-xs text-plum-soft">{tr("Creating an account is free. 18+ only.")}</p>
          </div>
        </Container>
      </section>
    </>
  );
}
