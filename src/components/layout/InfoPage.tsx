import type { ReactNode } from "react";
import { Container } from "@/components/ui/primitives";
import { getT } from "@/i18n/server";

export async function InfoPage({
  eyebrow,
  title,
  intro,
  placeholder = true,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  placeholder?: boolean;
  children: ReactNode;
}) {
  const tr = await getT();
  return (
    <div>
      <div className="bg-gradient-to-b from-blush to-cream">
        <Container className="max-w-3xl pb-12 pt-14 lg:pt-20">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-plum-soft">{eyebrow}</p>
          <h1 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-5 text-lg text-plum-soft">{intro}</p>
          {placeholder && (
            <p className="mt-6 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-plum ring-1 ring-line">
              {tr("Draft placeholder — to be reviewed by legal counsel before launch")}
            </p>
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
