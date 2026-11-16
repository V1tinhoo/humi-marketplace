import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <InfoPage eyebrow="Legal" title="Privacy Policy" intro="A placeholder summary of how HUMI intends to handle personal data.">
      <section>
        <h2>Beta preview</h2>
        <p>This preview has no backend. Anything you enter (demo accounts, bookings) is stored only in your browser&apos;s local storage and can be removed by clearing site data.</p>
      </section>
      <section>
        <h2>What we plan to collect</h2>
        <ul>
          <li>Account details: first name, email, account type.</li>
          <li>Booking and payment records (card data handled by our payment provider, not HUMI).</li>
          <li>Verification data for hosts, processed by a specialist provider.</li>
          <li>Safety reports and reviews.</li>
        </ul>
      </section>
      <section>
        <h2>What we won&apos;t do</h2>
        <ul>
          <li>Sell your personal data.</li>
          <li>Show your last name or contact details publicly.</li>
          <li>Record sessions without notice and consent.</li>
        </ul>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>You&apos;ll be able to access, export, correct, or delete your data, in line with GDPR, LGPD and similar laws.</p>
      </section>
    </InfoPage>
  );
}
