import type { Metadata } from "next";
import { FinalCtaSection, HowItWorksSection, TrustSection } from "@/components/home/Sections";
import { Container } from "@/components/ui/primitives";
import { getDict, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict()).nav.howItWorks };
}

export default async function HowItWorksPage() {
  const t = await getDict();
  const tr = await getT();
  return (
    <>
      <div className="bg-blush/60">
        <Container className="max-w-3xl pt-14 text-center lg:pt-20">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-plum-soft">{t.nav.howItWorks}</p>
          <h1 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-6xl">{t.how.title}</h1>
          <p className="mt-5 text-lg text-plum-soft">{tr("From browsing to your first hello in four simple steps.")}</p>
        </Container>
      </div>
      <HowItWorksSection withHeading={false} />
      <TrustSection />
      <FinalCtaSection />
    </>
  );
}
