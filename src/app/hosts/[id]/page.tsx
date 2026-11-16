import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, CalendarDays, Globe2, Info, Languages, MapPin, Mic, ShieldQuestion, Star, Video } from "lucide-react";
import { getHostById, getHostReviews, getHosts } from "@/lib/data/hosts";
import { tzLabel } from "@/lib/time";
import { categoryById } from "@/data/categories";
import { categoryVisuals } from "@/components/home/CategoryCard";
import { HostPhoto, PresenceBadge, Rating } from "@/components/hosts/HostBits";
import { HostCard } from "@/components/hosts/HostCard";
import { BookingCard } from "@/components/profile/BookingCard";
import { ProfileActions } from "@/components/profile/ProfileActions";
import { Container } from "@/components/ui/primitives";
import { formatDate, isNewHost } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import { getLocale, getT } from "@/i18n/server";
import { intlLocale } from "@/i18n";
import { countryLabel } from "@/data/places";
import { JsonLd, ORG_ID } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/lib/site";

// Rendered per request: the page follows the visitor's language (cookie) and live presence.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { data: host } = await getHostById((await params).id);
  const tr = await getT();
  const locale = await getLocale();
  if (!host) return { title: tr("Host not found") };
  const title = tr("{name} from {country}", { name: host.firstName, country: countryLabel(host.country, locale) });
  const description = [
    host.tagline,
    tr("Speaks {languages}", { languages: host.languages.map((l) => tr(l)).join(", ") }),
    tr("From {price} per minute, billed per second", { price: formatBRL(host.priceAudioCents) }),
  ].filter(Boolean).join(" · ");
  return { title, description, openGraph: { title, description } };
}

export default async function HostProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { data: host } = await getHostById((await params).id);
  if (!host) notFound();

  const [reviews, { data: all }] = await Promise.all([getHostReviews(host.id), getHosts()]);
  const similar = all.filter((h) => h.id !== host.id && h.categories.some((c) => host.categories.includes(c))).slice(0, 3);
  const tr = await getT();
  const locale = await getLocale();
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => tr(d));
  const sessions = tr(host.sessionsCompleted === 1 ? "{n} session" : "{n} sessions", { n: host.sessionsCompleted });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: tr("Video or audio conversation with {name}", { name: host.firstName }),
    url: `${SITE_URL}/hosts/${host.id}`,
    description: host.tagline || undefined,
    serviceType: tr("Online conversation"),
    availableLanguage: host.languages,
    provider: { "@type": "Person", name: host.firstName, knowsLanguage: host.languages, image: host.photo || undefined },
    broker: { "@id": ORG_ID },
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: (Math.min(host.priceAudioCents, host.priceVideoCents ?? host.priceAudioCents) / 100).toFixed(2),
      priceSpecification: { "@type": "UnitPriceSpecification", price: (host.priceAudioCents / 100).toFixed(2), priceCurrency: "BRL", unitCode: "MIN", referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MIN" } },
    },
    ...(host.reviewCount > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: host.rating.toFixed(1), reviewCount: host.reviewCount, bestRating: 5 } } : {}),
  };

  return (
    <div className="pb-28 lg:pb-24">
      {!host.isSample && <JsonLd data={jsonLd} />}
      <Container className="pt-6 lg:pt-10">
        <Link href="/explore" className="inline-flex items-center gap-1.5 text-sm font-medium text-plum-soft transition hover:text-plum">
          <ArrowLeft className="size-4" /> {tr("Back to explore")}
        </Link>

        <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_380px] lg:gap-12">
          <div className="min-w-0">
            {/* Header */}
            <div className="grid gap-6 sm:grid-cols-[minmax(0,300px)_1fr] sm:items-end">
              <div className="relative">
                <HostPhoto src={host.photo} name={host.firstName} priority sizes="(min-width: 640px) 300px, 100vw" className="aspect-[4/5] rounded-[1.75rem] shadow-lift" />
                <PresenceBadge online={host.online} className="absolute left-4 top-4" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {host.isSample && (
                    <span className="rounded-full bg-plum px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">{tr("Sample profile")}</span>
                  )}
                  {host.verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-online/10 px-2.5 py-1 text-xs font-semibold text-online">
                      <BadgeCheck className="size-3.5" /> {tr("Verified")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-plum-soft ring-1 ring-line" title={tr("Identity verification isn't active yet")}>
                      <ShieldQuestion className="size-3.5" /> {tr("Not yet verified")}
                    </span>
                  )}
                </div>
                <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
                  {host.firstName}{host.age ? <>, <span className="font-semibold text-plum-soft">{host.age}</span></> : null}
                </h1>
                <p className="mt-3 text-lg text-plum-soft">{host.tagline}</p>
                <dl className="mt-5 grid gap-2.5 text-sm">
                  <div className="flex items-center gap-2.5"><MapPin className="size-4 shrink-0" /><dt className="sr-only">{tr("Location")}</dt><dd>{[host.region || host.city, countryLabel(host.country, locale)].filter(Boolean).join(", ")} · {tzLabel(host.timezone)}</dd></div>
                  <div className="flex items-center gap-2.5"><Languages className="size-4 shrink-0" /><dt className="sr-only">{tr("Languages")}</dt><dd>{tr("Speaks {languages}", { languages: host.languages.map((l) => tr(l)).join(", ") })}</dd></div>
                  <div className="flex items-center gap-2.5"><Star className="size-4 shrink-0" /><dt className="sr-only">{tr("Rating")}</dt><dd>{host.reviewCount > 0 ? <><Rating value={host.rating} count={host.reviewCount} className="font-medium" /> · </> : isNewHost(host) ? `${tr("New host")} · ` : ""}{sessions}</dd></div>
                  <div className="flex items-center gap-2.5"><CalendarDays className="size-4 shrink-0" /><dt className="sr-only">{tr("Member since")}</dt><dd>{tr("Hosting since {date}", { date: formatDate(host.memberSince, { month: "long", year: "numeric" }, intlLocale(locale)) })}</dd></div>
                </dl>
                <div className="mt-6"><ProfileActions name={host.firstName} hostId={host.id} live={host.dataSource === "supabase"} /></div>
              </div>
            </div>

            {/* About */}
            <Section title={tr("About {name}", { name: host.firstName })}>
              <p className="max-w-2xl text-pretty text-[17px] leading-relaxed">{host.bio}</p>
            </Section>

            <Section title={tr("Interests")}>
              <ul className="flex flex-wrap gap-2">
                {host.interests.map((i) => (
                  <li key={i} className="rounded-full bg-blush px-4 py-2 text-sm font-medium">{tr(i)}</li>
                ))}
              </ul>
            </Section>

            <Section title={tr("What you can do together")}>
              <div className="grid gap-3 sm:grid-cols-2">
                {host.categories.map((c) => {
                  const cat = categoryById(c);
                  const Icon = categoryVisuals[c].icon;
                  return (
                    <div key={c} className="flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-line">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lilac"><Icon className="size-5" strokeWidth={1.75} /></span>
                      <div>
                        <p className="font-semibold">{tr(cat.title)}</p>
                        <p className="text-sm text-plum-soft">{tr(cat.description)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title={tr("Session options")}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Option icon={<Mic className="size-5" />} title={tr("Audio")} body={tr("Voice-only, relaxed and camera-free. {price}/min.", { price: formatBRL(host.priceAudioCents) })} available={host.formats.includes("audio")} notOffered={tr("not offered")} />
                <Option icon={<Video className="size-5" />} title={tr("Video")} body={host.priceVideoCents ? tr("Face to face. {price}/min.", { price: formatBRL(host.priceVideoCents) }) : tr("Face to face.")} available={host.formats.includes("video")} notOffered={tr("not offered")} />
                <Option icon={<Globe2 className="size-5" />} title={tr("Per-second billing")} body={tr("Talk as long as you like. You only pay while you're both connected.")} available notOffered="" />
              </div>
              <div className="mt-5 overflow-x-auto rounded-2xl bg-white p-4 ring-1 ring-line">
                <p className="mb-3 text-sm font-semibold">{tr("Usual weekly availability")} <span className="font-normal text-plum-soft">({tzLabel(host.timezone)})</span></p>
                <div className="grid min-w-[480px] grid-cols-7 gap-2 text-center text-xs">
                  {days.map((d, i) => (
                    <div key={d}>
                      <p className="mb-2 font-semibold text-plum-soft">{d}</p>
                      <div className="flex flex-col gap-1">
                        {host.availability[i]?.length ? (
                          host.availability[i].slice(0, 4).map((h) => (
                            <span key={h} className="rounded-md bg-lilac py-1">{String(h).padStart(2, "0")}:00</span>
                          ))
                        ) : (
                          <span className="rounded-md bg-cream py-1 text-plum-soft/60">—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            {/* Reviews */}
            <Section title={tr("Reviews")}>
              {reviews.length === 0 ? (
                <div className="rounded-2xl bg-blush/70 p-6 text-sm text-plum-soft">
                  <p className="font-semibold text-plum">{tr("No reviews yet")}</p>
                  <p className="mt-1">{tr("Reviews can only be left after a completed session — be the first.")}</p>
                </div>
              ) : (<>
              <div className="mb-5 flex items-center gap-4 rounded-2xl bg-blush p-5">
                <p className="text-4xl font-extrabold">{host.rating.toFixed(1)}</p>
                <div>
                  <div className="flex gap-0.5" aria-hidden>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={i < Math.round(host.rating) ? "size-4 fill-plum text-plum" : "size-4 text-plum/30"} />
                    ))}
                  </div>
                  <p className="mt-1 text-sm text-plum-soft">
                    {tr(host.reviewCount === 1 ? "{n} review from completed sessions" : "{n} reviews from completed sessions", { n: host.reviewCount })}{host.isSample && ` (${tr("sample")})`}
                  </p>
                </div>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-2xl bg-white p-5 ring-1 ring-line">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-full bg-lilac text-sm font-bold">{r.author[0]}</span>
                        <div>
                          <p className="text-sm font-semibold">{r.author}</p>
                          <p className="text-xs text-plum-soft">{countryLabel(r.country, locale)} · {formatDate(r.date, undefined, intlLocale(locale))}</p>
                        </div>
                      </div>
                      <Rating value={r.rating} />
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-plum">&ldquo;{r.text}&rdquo;</p>
                  </li>
                ))}
              </ul>
              </>)}
            </Section>

            <div className="mt-10 flex items-start gap-3 rounded-2xl bg-lilac/50 p-4 text-sm text-plum">
              <Info className="mt-0.5 size-4 shrink-0" />
              <p>
                {tr("HUMI sessions are social conversations between adults. Hosts don't provide therapy, medical, legal or financial advice, and sessions aren't dating.")}{" "}
                {tr("Read our")} <Link href="/guidelines" className="font-semibold underline underline-offset-2">{tr("community guidelines")}</Link>.
              </p>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <BookingCard host={host} />
          </aside>
        </div>

        {similar.length > 0 && (
          <section className="mt-20">
            <h2 className="text-2xl font-bold tracking-tight">{tr("You might also like")}</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((h) => <HostCard key={h.id} host={h} />)}
            </div>
          </section>
        )}
      </Container>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-xl font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Option({ icon, title, body, available, notOffered }: { icon: React.ReactNode; title: string; body: string; available: boolean; notOffered: string }) {
  return (
    <div className={`rounded-2xl bg-white p-4 ring-1 ring-line ${available ? "" : "opacity-45"}`}>
      <span className="grid size-10 place-items-center rounded-xl bg-blush">{icon}</span>
      <p className="mt-3 font-semibold">{title}{!available && ` · ${notOffered}`}</p>
      <p className="text-sm text-plum-soft">{body}</p>
    </div>
  );
}
