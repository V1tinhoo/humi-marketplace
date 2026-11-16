import Image from "next/image";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  CreditCard,
  Eye,
  Flag,
  Heart,
  MessagesSquare,
  ScrollText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Container, SectionHeading } from "@/components/ui/primitives";
import { CategoryCard } from "./CategoryCard";
import { categories } from "@/data/categories";
import { hosts } from "@/data/hosts";
import { getDict, getT } from "@/i18n/server";
import { cn } from "@/lib/utils";

export async function CategoriesSection() {
  const t = await getDict();
  const tr = await getT();
  return (
    <section className="py-20 lg:py-28">
      <Container>
        <SectionHeading title={t.categories.title} subtitle={t.categories.subtitle} />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((c, i) => (
            <CategoryCard key={c.id} category={{ ...c, title: tr(c.title), description: tr(c.description) }} index={i} browseLabel={tr("Browse hosts")} />
          ))}
        </div>
      </Container>
    </section>
  );
}

const stepIcons = [Search, SlidersHorizontal, MessagesSquare, Star];

export async function HowItWorksSection({ withHeading = true }: { withHeading?: boolean }) {
  const t = await getDict();
  return (
    <section className="bg-blush/60 py-20 lg:py-28" id="how-it-works">
      <Container>
        {withHeading && <SectionHeading align="center" eyebrow={t.nav.howItWorks} title={t.how.title} />}
        <ol className="relative mt-14 grid gap-4 lg:grid-cols-4 lg:gap-6">
          {/* desktop connector */}
          <div aria-hidden className="absolute left-[12.5%] right-[12.5%] top-8 hidden h-px border-t-2 border-dashed border-lavender lg:block" />
          {t.how.steps.map((s, i) => {
            const Icon = stepIcons[i];
            return (
              <li key={s.title} className="relative flex gap-5 rounded-[var(--radius-card)] bg-white p-6 ring-1 ring-line lg:flex-col lg:items-center lg:bg-transparent lg:p-0 lg:text-center lg:ring-0">
                {/* mobile connector */}
                {i < 3 && <div aria-hidden className="absolute left-[2.95rem] top-[5.5rem] h-[calc(100%-4.5rem)] w-px border-l-2 border-dashed border-lavender lg:hidden" />}
                <span className="relative z-10 grid size-14 shrink-0 place-items-center rounded-2xl bg-white text-plum shadow-soft ring-1 ring-line lg:size-16">
                  <Icon className="size-6" strokeWidth={1.75} />
                  <span className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-lavender text-xs font-bold text-plum-deep">{i + 1}</span>
                </span>
                <div className="lg:mt-6">
                  <h3 className="text-lg font-bold">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-plum-soft lg:mx-auto lg:max-w-[15rem]">{s.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Container>
    </section>
  );
}

export async function HostCtaSection() {
  const t = await getDict();
  const tr = await getT();
  const faces = ["maya", "mateo", "priya", "jonas", "zara"].map((id) => hosts.find((h) => h.id === id)!);
  return (
    <section className="py-20 lg:py-28">
      <Container>
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-lavender via-lilac to-blush px-6 py-12 sm:px-12 lg:grid lg:grid-cols-[1.2fr_1fr] lg:gap-12 lg:px-16 lg:py-20">
          <div aria-hidden className="absolute -right-24 -top-24 size-80 rounded-full border-[40px] border-white/30" />
          <div aria-hidden className="absolute -bottom-32 left-1/3 size-72 rounded-full bg-rose/40 blur-2xl" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-plum/80">{t.nav.becomeHost}</p>
            <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight text-plum-deep sm:text-5xl sm:leading-[1.05]">{t.host.title}</h2>
            <p className="mt-5 max-w-lg text-lg text-plum">{t.host.body}</p>
            <ButtonLink href="/become-a-host" variant="dark" size="lg" className="mt-8">
              {t.host.cta} <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
          <div className="relative mt-10 lg:mt-0">
            <ul className="space-y-3">
              {t.host.benefits.map((b) => (
                <li key={b} className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3.5 text-[15px] font-medium text-plum backdrop-blur">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-plum text-white">
                    <Check className="size-4" strokeWidth={2.5} />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center gap-3">
              <div className="flex -space-x-3">
                {faces.map((f) => (
                  <Image key={f.id} src={f.photo} alt="" width={40} height={40} className="size-10 rounded-full object-cover ring-2 ring-white" />
                ))}
              </div>
              <p className="text-sm text-plum">{tr("Start today and meet people from all over the world.")}</p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

const trustIcons = [BadgeCheck, CreditCard, Star, Flag, ScrollText, Eye];

export async function TrustSection() {
  const t = await getDict();
  const tr = await getT();
  return (
    <section className="py-20 lg:py-28">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <span className="grid size-14 place-items-center rounded-2xl bg-lilac text-plum">
              <ShieldCheck className="size-7" strokeWidth={1.75} />
            </span>
            <h2 className="mt-6 text-balance text-3xl font-bold tracking-tight sm:text-4xl">{t.trust.title}</h2>
            <p className="mt-4 text-lg text-plum-soft">{t.trust.subtitle}</p>
            <ButtonLink href="/safety" variant="secondary" className="mt-8">
              {tr("Read our safety approach")}
            </ButtonLink>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {t.trust.items.map((item, i) => {
              const Icon = trustIcons[i];
              return (
                <div key={item.title} className={cn("group rounded-[var(--radius-card)] p-6 transition-colors", i % 3 === 0 ? "bg-blush" : "bg-white ring-1 ring-line hover:ring-lavender")}>
                  <div className="flex items-center justify-between">
                    <Icon className="size-6 text-plum" strokeWidth={1.75} />
                    <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-plum-soft ring-1 ring-line">
                      {tr("Planned")}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-plum-soft">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}

export async function FinalCtaSection() {
  const t = await getDict();
  const tr = await getT();
  return (
    <section className="pb-20 lg:pb-28">
      <Container>
        <div className="relative overflow-hidden rounded-[2rem] bg-plum px-6 py-16 text-center sm:py-24">
          <div aria-hidden className="absolute left-1/2 top-0 size-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lavender/30 blur-3xl" />
          <div aria-hidden className="absolute -bottom-16 -left-16 size-56 rounded-full border-[28px] border-white/5" />
          <Heart className="relative mx-auto size-8 text-rose" strokeWidth={1.75} />
          <h2 className="relative mx-auto mt-6 max-w-3xl text-balance text-3xl font-extrabold tracking-tight text-white sm:text-5xl sm:leading-[1.08]">
            {t.finalCta.title}
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-white/75">{t.brand.alt}</p>
          <ButtonLink href="/explore" size="lg" className="relative mt-9">
            {t.finalCta.cta} <ArrowRight className="size-4" />
          </ButtonLink>
          <p className="relative mt-6 flex items-center justify-center gap-1.5 text-xs text-white/60">
            <CalendarClock className="size-3.5" /> {tr("Free to browse. 18+ only.")}
          </p>
        </div>
      </Container>
    </section>
  );
}
