import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";

export const metadata: Metadata = { title: "Safety" };

export default function SafetyPage() {
  return (
    <InfoPage
      eyebrow="Safety"
      title="Real connections start with trust."
      intro="HUMI is in beta. This page describes the safety measures we're building for launch — none of them are live yet, and we'll say so clearly until they are."
    >
      <section>
        <h2>Who HUMI is for</h2>
        <p>
          HUMI is for adults aged 18 and over. Sessions are paid social conversations: talking, playing games, practising languages and sharing experiences. HUMI is
          not a dating service, not therapy, and not a substitute for professional or emergency help.
        </p>
      </section>
      <section>
        <h2>Planned protections</h2>
        <ul>
          <li><strong>Verified hosts</strong> — identity and age checks through a specialist provider before a host can accept sessions.</li>
          <li><strong>Secure payments</strong> — handled by a certified payment provider; HUMI won&apos;t store card numbers.</li>
          <li><strong>Reviews from real sessions</strong> — only people who completed a session can review it.</li>
          <li><strong>Report and block</strong> — available on every profile and during every session.</li>
          <li><strong>Private by default</strong> — first names only, no shared phone numbers or emails, sessions stay on HUMI.</li>
          <li><strong>Moderation</strong> — a trust &amp; safety team reviewing reports, with clear enforcement.</li>
        </ul>
      </section>
      <section>
        <h2>Staying safe in a session</h2>
        <ul>
          <li>Keep conversations and payments on HUMI.</li>
          <li>Don&apos;t share your address, financial details, or passwords.</li>
          <li>You can end any session at any time if you feel uncomfortable.</li>
          <li>If you&apos;re in crisis or danger, contact your local emergency services.</li>
        </ul>
      </section>
    </InfoPage>
  );
}
