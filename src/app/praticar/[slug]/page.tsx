import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, ChevronRight, Lightbulb, MessageCircleHeart, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/primitives";
import { HostCard } from "@/components/hosts/HostCard";
import { JsonLd, faqJsonLd } from "@/components/seo/JsonLd";
import { getHosts } from "@/lib/data/hosts";
import { formatBRL } from "@/lib/money";
import { SITE_URL } from "@/lib/site";
import { seoPageBySlug } from "@/data/seo-pages";

// Live list of hosts (who is online changes all the time).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = seoPageBySlug((await params).slug);
  if (!page) return {};
  const url = `${SITE_URL}/praticar/${page.slug}`;
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: url },
    openGraph: { title: page.title, description: page.description, url, locale: "pt_BR", type: "website" },
  };
}

export default async function PracticePage({ params }: { params: Promise<{ slug: string }> }) {
  const page = seoPageBySlug((await params).slug);
  if (!page) notFound();

  const { data: hosts } = await getHosts();
  const speakers = hosts
    .filter((h) => !h.isSample && h.languages.includes(page.language))
    .sort((a, b) => Number(b.online) - Number(a.online) || b.rating - a.rating)
    .slice(0, 6);
  const onlineNow = speakers.filter((h) => h.online).length;
  const minPrice = speakers.length ? Math.min(...speakers.map((h) => h.priceAudioCents)) : null;
  const signup = `/signup?utm_source=seo&utm_medium=organic&utm_campaign=praticar_${page.slug}`;
  const related = page.related.map(seoPageBySlug).filter((p): p is NonNullable<typeof p> => !!p);

  return (
    <>
      <JsonLd data={faqJsonLd(page.faq)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "HUMI", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "Praticar idiomas", item: `${SITE_URL}/praticar` },
            { "@type": "ListItem", position: 3, name: page.name, item: `${SITE_URL}/praticar/${page.slug}` },
          ],
        }}
      />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-lilac via-blush to-cream">
        <Container className="relative py-12 lg:py-20">
          <nav aria-label="Navegação" className="flex flex-wrap items-center gap-1 text-sm text-plum-soft">
            <Link href="/" className="hover:text-plum">HUMI</Link>
            <ChevronRight className="size-3.5" />
            <Link href="/praticar" className="hover:text-plum">Praticar idiomas</Link>
            <ChevronRight className="size-3.5" />
            <span className="text-plum">{page.name}</span>
          </nav>
          <div className="mt-6 max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-sm font-semibold text-plum ring-1 ring-line">
              <MessageCircleHeart className="size-4" /> {page.eyebrow}
            </p>
            <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight text-plum-deep sm:text-5xl lg:text-6xl">{page.h1}</h1>
            {page.intro.map((p) => (
              <p key={p} className="mt-5 max-w-2xl text-lg text-plum">{p}</p>
            ))}
            <ul className="mt-6 grid gap-2 text-[15px] text-plum">
              {[
                minPrice != null ? `A partir de ${formatBRL(minPrice)} por minuto, cobrado por segundo` : "Cobrado por segundo, só enquanto vocês conversam",
                "Sem mensalidade e sem pacote: Pix ou cartão",
                "Vídeo ou áudio, com quem você escolher",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-plum text-white"><Check className="size-3.5" strokeWidth={3} /></span>
                  {b}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={signup} size="lg">Criar conta grátis <ArrowRight className="size-4" /></ButtonLink>
              <ButtonLink href="/explore" size="lg" variant="secondary">Ver quem está online</ButtonLink>
            </div>
          </div>
        </Container>
      </section>

      {/* Why */}
      <section className="py-16">
        <Container>
          <h2 className="text-3xl font-bold tracking-tight">{page.whyTitle}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {page.why.map((w) => (
              <div key={w.title} className="rounded-[var(--radius-card)] bg-white p-6 ring-1 ring-line">
                <span className="grid size-10 place-items-center rounded-xl bg-lilac"><Sparkles className="size-5" /></span>
                <p className="mt-4 font-semibold">{w.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-plum-soft">{w.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Hosts */}
      <section className="bg-blush/50 py-16">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Pessoas para praticar {page.name.toLowerCase().startsWith("inglês") || page.name.toLowerCase().startsWith("conversação") ? "inglês" : page.name.toLowerCase()}</h2>
              <p className="mt-2 text-plum-soft">
                {speakers.length === 0 ? "Novas pessoas entram todos os dias. Veja quem está disponível agora." : onlineNow > 0 ? `${onlineNow} online agora` : "Agende um horário ou volte quando estiverem online."}
              </p>
            </div>
            <Link href="/explore" className="inline-flex items-center gap-1.5 text-sm font-semibold text-plum">Ver todos <ArrowRight className="size-4" /></Link>
          </div>
          {speakers.length > 0 && (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {speakers.map((h) => <HostCard key={h.id} host={h} />)}
            </div>
          )}
        </Container>
      </section>

      {/* Situations + tips */}
      <section className="py-16">
        <Container className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{page.situationsTitle}</h2>
            <ul className="mt-6 space-y-3">
              {page.situations.map((s) => (
                <li key={s} className="flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-line">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-plum text-white"><Check className="size-3.5" strokeWidth={3} /></span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{page.tipsTitle}</h2>
            <ol className="mt-6 space-y-3">
              {page.tips.map((t, i) => (
                <li key={t} className="flex items-start gap-3 rounded-2xl bg-cream p-4 ring-1 ring-line">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-lavender text-sm font-bold text-plum-deep">{i + 1}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 flex items-start gap-2 text-sm text-plum-soft"><Lightbulb className="mt-0.5 size-4 shrink-0" /> Dica: escolha alguém com interesses parecidos com os seus — a conversa flui muito mais.</p>
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section className="bg-lilac/40 py-16">
        <Container className="max-w-4xl">
          <h2 className="text-center text-3xl font-bold tracking-tight">Como funciona</h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ["Crie sua conta", "Grátis, em menos de 1 minuto, com e-mail ou Google."],
              ["Coloque saldo", "Pix ou cartão, a partir de poucos reais. Sem mensalidade."],
              ["Ligue e converse", "Escolha alguém online e comece por vídeo ou áudio."],
            ].map(([title, body], i) => (
              <li key={title} className="rounded-[var(--radius-card)] bg-white p-6 ring-1 ring-line">
                <span className="grid size-10 place-items-center rounded-full bg-lavender font-bold text-plum-deep">{i + 1}</span>
                <p className="mt-4 font-semibold">{title}</p>
                <p className="mt-1 text-sm text-plum-soft">{body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <Container className="max-w-3xl">
          <h2 className="text-3xl font-bold tracking-tight">Perguntas frequentes</h2>
          <div className="mt-8 divide-y divide-line rounded-2xl bg-white ring-1 ring-line">
            {page.faq.map((f) => (
              <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold">
                  {f.q}
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-cream text-lg leading-none ring-1 ring-line transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>

      {/* CTA + related */}
      <section className="bg-gradient-to-br from-plum to-plum-deep py-16 text-white">
        <Container className="max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Sua próxima conversa começa agora</h2>
          <p className="mt-3 text-white/80">Criar conta é grátis. Só para maiores de 18 anos.</p>
          <div className="mt-8 flex justify-center">
            <ButtonLink href={signup} size="lg" variant="secondary">Criar minha conta grátis <ArrowRight className="size-4" /></ButtonLink>
          </div>
          {related.length > 0 && (
            <div className="mt-10">
              <p className="text-sm font-semibold text-white/70">Veja também</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {related.map((r) => (
                  <Link key={r.slug} href={`/praticar/${r.slug}`} className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/20 hover:bg-white/20">{r.title}</Link>
                ))}
              </div>
            </div>
          )}
        </Container>
      </section>
    </>
  );
}

