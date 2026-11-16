import type { Metadata } from "next";
import Image from "next/image";
import { CalendarRange, CircleDollarSign, Globe2, HeartHandshake, ShieldCheck, Sparkles } from "lucide-react";
import { HostCtaButtons } from "@/components/home/HostCtaButtons";
import { Container, SectionHeading } from "@/components/ui/primitives";
import { getHost } from "@/data/hosts";
import { getDict, getLocale, getT } from "@/i18n/server";
import { countryLabel } from "@/data/places";
import type { Translate } from "@/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict()).nav.becomeHost };
}

const benefitIcons = [CalendarRange, Sparkles, CircleDollarSign, Globe2, HeartHandshake];

const faqsFor = (tr: Translate) => [
  { q: tr("Who can host?"), a: tr("Anyone 18 or older who enjoys meeting people and can hold a friendly, respectful conversation in at least one language. HUMI may ask hosts to confirm their identity and age at any time.") },
  { q: tr("How much can I charge?"), a: tr("You choose your own price per minute within the platform limits, and you can change it any time.") },
  { q: tr("When do I get paid?"), a: tr("Earnings from each call become available after the holding period shown in your dashboard. Then you request a withdrawal and receive it by Pix.") },
  { q: tr("What kind of sessions are allowed?"), a: tr("Friendly conversation, games, language practice and cultural exchange. HUMI isn't a dating service, and hosts may not offer therapy, medical advice or anything sexual.") },
];

export default async function BecomeHostPage() {
  const t = await getDict();
  const tr = await getT();
  const faqs = faqsFor(tr);
  const locale = await getLocale();
  const faces = ["amara", "walter", "priya", "mateo"].map((id) => getHost(id)!);
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-lilac via-blush to-cream">
        <div aria-hidden className="absolute -right-24 top-10 size-96 rounded-full border-[48px] border-white/40" />
        <Container className="relative grid items-center gap-12 py-16 lg:grid-cols-2 lg:py-24">
          <div className="animate-fade-up">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-plum-soft">{t.nav.becomeHost}</p>
            <h1 className="mt-4 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight text-plum-deep sm:text-6xl">{t.host.title}</h1>
            <p className="mt-6 max-w-lg text-lg text-plum">{t.host.body}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <HostCtaButtons />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {faces.map((f, i) => (
              <div key={f.id} className={`relative aspect-[4/5] overflow-hidden rounded-[1.75rem] shadow-lift ring-4 ring-white ${i % 2 ? "mt-10" : ""}`}>
                <Image src={f.photo} alt={tr("{name}, sample host", { name: f.firstName })} fill sizes="(min-width:1024px) 25vw, 50vw" className="object-cover" priority={i < 2} />
                <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold backdrop-blur">{f.firstName} · {countryLabel(f.country, locale)}</span>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-20 lg:py-28">
        <Container>
          <SectionHeading title={tr("Hosting, on your terms.")} subtitle={tr("You decide when you're available, what you talk about, and what your time is worth.")} />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {t.host.benefits.map((b, i) => {
              const Icon = benefitIcons[i];
              return (
                <div key={b} className="rounded-[var(--radius-card)] bg-white p-6 ring-1 ring-line transition hover:-translate-y-1 hover:shadow-soft">
                  <span className="grid size-11 place-items-center rounded-xl bg-lilac"><Icon className="size-5" strokeWidth={1.75} /></span>
                  <p className="mt-5 font-semibold leading-snug">{b}</p>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      <section className="bg-white py-20 lg:py-28">
        <Container className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading title={tr("How applying works")} />
            <ol className="mt-10 space-y-6">
              {[
                [tr("Create your host account"), tr("Tell us your first name and email.")],
                [tr("Build your profile"), tr("Add your interests, languages, a photo, and your rate.")],
                [tr("Go online"), tr("Switch on “Online now” and start receiving calls.")],
                [tr("Start hosting"), tr("Open your calendar and meet people from around the world.")],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lavender font-bold text-plum-deep">{i + 1}</span>
                  <div>
                    <p className="font-semibold">{title}</p>
                    <p className="text-sm text-plum-soft">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex items-start gap-3 rounded-2xl bg-blush p-4 text-sm">
              <ShieldCheck className="mt-0.5 size-5 shrink-0" />
              <p>{tr("Hosts must be 18+, follow our community guidelines, and never share personal contact details or move sessions off the platform.")}</p>
            </div>
          </div>
          <div>
            <SectionHeading title={tr("Questions")} />
            <div className="mt-10 divide-y divide-line rounded-[var(--radius-card)] bg-cream ring-1 ring-line">
              {faqs.map((f) => (
                <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold">
                    {f.q}
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-lg leading-none ring-1 ring-line transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-plum-soft">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="py-20">
        <Container className="text-center">
          <h2 className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">{tr("Ready to meet the world?")}</h2>
          <HostCtaButtons single className="mt-8 justify-center" />
        </Container>
      </section>
    </>
  );
}
