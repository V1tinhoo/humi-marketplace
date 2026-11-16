import type { ReactNode } from "react";
import { Container } from "@/components/ui/primitives";
import { getLocale } from "@/i18n/server";
import { intlLocale } from "@/i18n";

export async function InfoPage({
  eyebrow,
  title,
  intro,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  /** ISO date of the current version (legal documents). */
  updated?: string;
  children: ReactNode;
}) {
  const locale = await getLocale();
  const updatedLabel = updated
    ? `${locale === "pt" ? "Última atualização" : "Last updated"}: ${new Date(`${updated}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "long", year: "numeric" })}`
    : null;
  return (
    <div>
      <div className="bg-gradient-to-b from-blush to-cream">
        <Container className="max-w-3xl pb-12 pt-14 lg:pt-20">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-plum-soft">{eyebrow}</p>
          <h1 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-5 text-lg text-plum-soft">{intro}</p>
          {updatedLabel && (
            <p className="mt-6 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-plum ring-1 ring-line">{updatedLabel}</p>
          )}
        </Container>
      </div>
      <Container className="max-w-3xl pb-24">
        <div className="space-y-10 text-[15px] leading-relaxed text-plum [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_p]:text-plum-soft [&_section>*+*]:mt-3 [&_ul]:space-y-2 [&_ul]:text-plum-soft">
          {children}
        </div>
      </Container>
    </div>
  );
}

/** A legal document section: heading, paragraphs and/or a bullet list. */
export type LegalSection = { h: string; p?: string[]; list?: string[]; id?: string };

export function LegalSections({ sections }: { sections: LegalSection[] }) {
  return (
    <>
      {sections.map((s) => (
        <section key={s.h} id={s.id} className={s.id ? "scroll-mt-28" : undefined}>
          <h2>{s.h}</h2>
          {s.p?.map((t) => <p key={t}>{t}</p>)}
          {s.list && (
            <ul>
              {s.list.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
