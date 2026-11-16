import { Hero } from "@/components/home/Hero";
import { FeaturedHosts } from "@/components/home/FeaturedHosts";
import { CategoriesSection, FinalCtaSection, HostCtaSection, HowItWorksSection, TrustSection } from "@/components/home/Sections";
import { getHosts } from "@/lib/data/hosts";

// Always fresh: "Online now" must change as soon as a host leaves.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { data: hosts } = await getHosts();
  return (
    <>
      <Hero />
      <CategoriesSection />
      <div className="bg-white">
        <FeaturedHosts hosts={hosts} />
      </div>
      <HowItWorksSection />
      <HostCtaSection />
      <TrustSection />
      <FinalCtaSection />
    </>
  );
}
