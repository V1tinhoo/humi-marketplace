import { SITE_URL } from "@/lib/site";

/** Structured data (schema.org) that search engines and AI assistants read to understand HUMI. */
export function JsonLd({ data }: { data: object | object[] }) {
  // "<" escaped so the JSON can't close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const ORG_ID = `${SITE_URL}/#organization`;

export function siteJsonLd(pt: boolean) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": ORG_ID,
      name: "HUMI",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      email: "contato@humi.chat",
      description: pt
        ? "Plataforma brasileira para conversar por vídeo ou áudio com pessoas reais do mundo todo, pagando por minuto: bate-papo, prática de idiomas, troca cultural e jogos."
        : "Brazilian platform for paid one-to-one video or audio calls with real people worldwide: conversation, language practice, cultural exchange and games.",
      areaServed: "BR",
      knowsLanguage: ["pt-BR", "en"],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "HUMI",
      url: SITE_URL,
      inLanguage: pt ? "pt-BR" : "en",
      publisher: { "@id": ORG_ID },
      potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/explore?q={search_term_string}`, "query-input": "required name=search_term_string" },
    },
  ];
}

export function faqJsonLd(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
