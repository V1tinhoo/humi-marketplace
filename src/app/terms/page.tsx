import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";

export const metadata: Metadata = { title: "Terms of Service" };

const sections = [
  ["1. The service", "HUMI is a marketplace that lets adults book paid conversation and social sessions with independent hosts. HUMI is not a party to the conversation itself."],
  ["2. Eligibility", "You must be at least 18 years old to create an account, book, or host."],
  ["3. Prices and payments", "Hosts set a price per minute within platform limits. Guests add balance to a prepaid wallet and are billed per second, only while both people are connected. Reserving a time is free. Payments will be processed by a third-party payment provider."],
  ["4. Cancellations and refunds", "See the draft cancellation policy in the Help Center. Final terms will be published before launch."],
  ["5. Prohibited conduct", "Using HUMI for dating, sexual services, therapy, harassment, fraud, or to move transactions off-platform is prohibited."],
  ["6. Hosts", "Hosts are independent and responsible for their own conduct and any taxes on their earnings."],
  ["7. Changes", "We may update these terms and will notify members of material changes."],
];

export default function TermsPage() {
  return (
    <InfoPage eyebrow="Legal" title="Terms of Service" intro="These placeholder terms outline how HUMI is intended to work. They are not yet legally binding.">
      {sections.map(([h, p]) => (
        <section key={h}>
          <h2>{h}</h2>
          <p>{p}</p>
        </section>
      ))}
    </InfoPage>
  );
}
