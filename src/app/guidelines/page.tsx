import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";

export const metadata: Metadata = { title: "Community guidelines" };

export default function GuidelinesPage() {
  return (
    <InfoPage eyebrow="Community" title="Community guidelines" intro="A few simple rules so every conversation on HUMI feels welcoming, respectful and safe.">
      <section>
        <h2>Be kind and respectful</h2>
        <p>Treat people the way you&apos;d like to be treated. No harassment, hate speech, bullying, or discrimination of any kind.</p>
      </section>
      <section>
        <h2>Know what HUMI is — and isn&apos;t</h2>
        <ul>
          <li>HUMI is for friendly conversation, games, language practice and cultural exchange.</li>
          <li>HUMI is not a dating platform. Romantic or sexual requests are not allowed.</li>
          <li>Hosts don&apos;t provide therapy, medical, legal or financial advice.</li>
          <li>No one is promised friendship or emotional support — just a genuine conversation.</li>
        </ul>
      </section>
      <section>
        <h2>Adults only</h2>
        <p>Everyone on HUMI must be 18 or older.</p>
      </section>
      <section>
        <h2>Keep it on HUMI</h2>
        <p>Don&apos;t ask for or share personal contact details, and don&apos;t arrange payments outside the platform.</p>
      </section>
      <section>
        <h2>Consent and recording</h2>
        <p>Never record, screenshot, or share a session without the clear consent of everyone involved.</p>
      </section>
      <section>
        <h2>Reporting</h2>
        <p>If someone breaks these rules, report them. Violations can lead to warnings, suspension, or permanent removal.</p>
      </section>
    </InfoPage>
  );
}
