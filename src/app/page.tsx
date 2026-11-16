import { Hero } from "@/components/home/Hero";
import { FeaturedHosts } from "@/components/home/FeaturedHosts";
import { CategoriesSection, FinalCtaSection, HostCtaSection, HowItWorksSection, TrustSection } from "@/components/home/Sections";
import { getHosts } from "@/lib/data/hosts";

export const revalidate = 30; // keeps "Online now" close to real time

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
