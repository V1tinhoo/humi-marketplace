import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Globe2, Languages, MapPin, MessageCircle, Mic, Star, Video } from "lucide-react";
import { HostPhoto, PresenceBadge, Rating } from "@/components/hosts/HostBits";
import { Container } from "@/components/ui/primitives";
import { DemoCallCard } from "@/components/preview/DemoCallCard";
import { demoToHost } from "@/lib/demo";
import { getCategories, getPreviewHost, getPreviewStatus } from "@/lib/preview-server";
import { formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { tzLabel } from "@/lib/time";
import { countryLabel } from "@/data/places";
import { intlLocale } from "@/i18n";
import { getLocale, getT } from "@/i18n/server";

export const dynamic = "force-dynamic";

/** A demo host's profile, laid out like the real profile page (no demo badges, by design). */
export default async function PreviewHostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ host: row, reviews }, status, cats, tr, locale] = await Promise.all([getPreviewHost(id), getPreviewStatus(), getCategories(), getT(), getLocale()]);
  if (!row) notFound();
  const host = demoToHost(row);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => tr(d));
  const catLabel = (slug: string) => {
    const c = cats.find((x) => x.slug === slug);
    return c ? (locale === "pt" ? c.label_pt : c.label_en) : slug;
  };

  return (
    <div className="pb-28 lg:pb-24">
      <Container className="pt-6 lg:pt-10">
        <Link href="/preview/explore" className="inline-flex items-center gap-1.5 text-sm font-medium text-plum-soft transition hover:text-plum">
          <ArrowLeft className="size-4" /> {tr("Back to explore")}
        </Link>

        <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_380px] lg:gap-12">
          <div className="min-w-0">
            <div className="grid gap-6 sm:grid-cols-[minmax(0,300px)_1fr] sm:items-end">
              <div className="relative">
                <HostPhoto src={host.photo} name={host.firstName} priority sizes="(min-width: 640px) 300px, 100vw" className="aspect-[4/5] rounded-[1.75rem] shadow-lift" />
                <PresenceBadge online={host.online} className="absolute left-4 top-4" />
              </div>
              <div>
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
                  {host.firstName}{host.age ? <>, <span className="font-semibold text-plum-soft">{host.age}</span></> : null}
                </h1>
                <p className="mt-3 text-lg text-plum-soft">{host.tagline}</p>
                <dl className="mt-5 grid gap-2.5 text-sm">
                  <div className="flex items-center gap-2.5"><MapPin className="size-4 shrink-0" /><dt className="sr-only">{tr("Location")}</dt><dd>{[host.city, countryLabel(host.country, locale)].filter(Boolean).join(", ")} · {tzLabel(host.timezone)}</dd></div>
                  <div className="flex items-center gap-2.5"><Languages className="size-4 shrink-0" /><dt className="sr-only">{tr("Languages")}</dt><dd>{tr("Speaks {languages}", { languages: host.languages.map((l) => tr(l)).join(", ") })}</dd></div>
                  {host.reviewCount > 0 && <div className="flex items-center gap-2.5"><Star className="size-4 shrink-0" /><dt className="sr-only">{tr("Rating")}</dt><dd><Rating value={host.rating} count={host.reviewCount} className="font-medium" /></dd></div>}
                  <div className="flex items-center gap-2.5"><CalendarDays className="size-4 shrink-0" /><dt className="sr-only">{tr("Member since")}</dt><dd>{tr("Hosting since {date}", { date: formatDate(host.memberSince, { month: "long", year: "numeric" }, intlLocale(locale)) })}</dd></div>
                </dl>
              </div>
            </div>

            <Section title={tr("About {name}", { name: host.firstName })}>
              <p className="max-w-2xl text-pretty text-[17px] leading-relaxed">{host.bio}</p>
            </Section>

            {host.interests.length > 0 && (
              <Section title={tr("Interests")}>
                <ul className="flex flex-wrap gap-2">
                  {host.interests.map((i) => <li key={i} className="rounded-full bg-blush px-4 py-2 text-sm font-medium">{tr(i)}</li>)}
                </ul>
              </Section>
            )}

            {row.categories.length > 0 && (
              <Section title={tr("What you can do together")}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {row.categories.map((c) => (
                    <div key={c} className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-line">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lilac"><MessageCircle className="size-5" strokeWidth={1.75} /></span>
                      <p className="font-semibold">{catLabel(c)}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section title={tr("Session options")}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Option icon={<Mic className="size-5" />} title={tr("Audio")} body={tr("Voice-only, relaxed and camera-free. {price}/min.", { price: formatBRL(host.priceAudioCents) })} available={host.formats.includes("audio")} notOffered={tr("not offered")} />
                <Option icon={<Video className="size-5" />} title={tr("Video")} body={tr("Face to face. {price}/min.", { price: formatBRL(host.priceVideoCents ?? host.priceAudioCents) })} available={host.formats.includes("video")} notOffered={tr("not offered")} />
                <Option icon={<Globe2 className="size-5" />} title={tr("Per-second billing")} body={tr("Talk as long as you like. You only pay while you're both connected.")} available notOffered="" />
              </div>
              <div className="mt-5 overflow-x-auto rounded-2xl bg-white p-4 ring-1 ring-line">
                <p className="mb-3 text-sm font-semibold">{tr("Usual weekly availability")} <span className="font-normal text-plum-soft">({tzLabel(host.timezone)})</span></p>
                <div className="grid min-w-[480px] grid-cols-7 gap-2 text-center text-xs">
                  {days.map((d, i) => (
                    <div key={d}>
                      <p className="mb-2 font-semibold text-plum-soft">{d}</p>
                      <div className="flex flex-col gap-1">
                        {host.availability[i]?.length
                          ? host.availability[i].slice(0, 4).map((h) => <span key={h} className="rounded-md bg-lilac py-1">{String(h).padStart(2, "0")}:00</span>)
                          : <span className="rounded-md bg-cream py-1 text-plum-soft/60">—</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            <Section title={tr("Reviews")}>
              {reviews.length === 0 ? (
                <div className="rounded-2xl bg-blush/70 p-6 text-sm text-plum-soft"><p className="font-semibold text-plum">{tr("No reviews yet")}</p></div>
              ) : (
                <>
                  <div className="mb-5 flex items-center gap-4 rounded-2xl bg-blush p-5">
                    <p className="text-4xl font-extrabold">{host.rating.toFixed(1)}</p>
                    <div>
                      <div className="flex gap-0.5" aria-hidden>
                        {Array.from({ length: 5 }).map((_, i) => <Star key={i} className={i < Math.round(host.rating) ? "size-4 fill-plum text-plum" : "size-4 text-plum/30"} />)}
                      </div>
                      <p className="mt-1 text-sm text-plum-soft">{tr(host.reviewCount === 1 ? "{n} review from completed sessions" : "{n} reviews from completed sessions", { n: host.reviewCount })}</p>
                    </div>
                  </div>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {reviews.map((r) => (
                      <li key={r.id} className="rounded-2xl bg-white p-5 ring-1 ring-line">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {r.reviewer_avatar_url ? <img src={r.reviewer_avatar_url} alt="" className="size-9 rounded-full bg-lilac" /> : <span className="grid size-9 place-items-center rounded-full bg-lilac text-sm font-bold">{r.reviewer_name[0]}</span>}
                            <div>
                              <p className="text-sm font-semibold">{r.reviewer_name}</p>
                              <p className="text-xs text-plum-soft">{formatDate(r.review_date, { day: "numeric", month: "short", year: "numeric" }, intlLocale(locale))}</p>
                            </div>
                          </div>
                          <Rating value={r.rating} />
                        </div>
                        {r.comment && <p className="mt-3 text-sm leading-relaxed">{r.comment}</p>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Section>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <DemoCallCard
              hostId={row.id}
              name={row.display_name}
              audioCents={row.audio_cents_per_minute}
              videoCents={row.video_cents_per_minute}
              formats={row.call_types}
              online={row.is_online}
              balanceCents={status?.balance_cents ?? 0}
              callsEnabled={!!status?.calls_enabled}
            />
          </aside>
        </div>
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
