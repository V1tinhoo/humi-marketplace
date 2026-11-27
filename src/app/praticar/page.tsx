import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Globe2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/primitives";
import { SITE_URL } from "@/lib/site";
import { SEO_PAGES } from "@/data/seo-pages";

export const metadata: Metadata = {
  title: "Praticar idiomas conversando com pessoas reais",
  description: "Pratique inglês, espanhol, francês, italiano e alemão conversando por vídeo ou áudio com pessoas reais. Sem aula e sem mensalidade: pague por minuto.",
  alternates: { canonical: `${SITE_URL}/praticar` },
};

/** Hub of the SEO pages: links every language/intent page. */
export default function PracticeHubPage() {
  return (
    <>
      <section className="bg-gradient-to-br from-lilac via-blush to-cream">
        <Container className="py-14 lg:py-20">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-sm font-semibold text-plum ring-1 ring-line"><Globe2 className="size-4" /> Praticar idiomas</p>
          <h1 className="mt-5 max-w-3xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight text-plum-deep sm:text-6xl">Pratique idiomas conversando com pessoas reais</h1>
          <p className="mt-5 max-w-2xl text-lg text-plum">
            Escolha o idioma, encontre alguém online e converse por vídeo ou áudio. Sem aula, sem pacote e sem mensalidade: você paga só os minutos que usar.
          </p>
          <div className="mt-8"><ButtonLink href="/signup?utm_source=seo&utm_medium=organic&utm_campaign=praticar_hub" size="lg">Criar conta grátis <ArrowRight className="size-4" /></ButtonLink></div>
        </Container>
      </section>
      <section className="py-16">
        <Container>
          <h2 className="text-3xl font-bold tracking-tight">Escolha o que você quer praticar</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SEO_PAGES.map((p) => (
              <Link key={p.slug} href={`/praticar/${p.slug}`} className="group rounded-[var(--radius-card)] bg-white p-6 ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-lift hover:ring-lavender">
                <p className="text-sm font-semibold text-plum-soft">{p.eyebrow}</p>
                <p className="mt-2 text-lg font-bold leading-snug">{p.title}</p>
                <p className="mt-2 line-clamp-2 text-sm text-plum-soft">{p.description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-plum">Ver página <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></span>
              </Link>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
