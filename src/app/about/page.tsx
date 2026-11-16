import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";

export const metadata: Metadata = { title: "About HUMI" };

export default function AboutPage() {
  return (
    <InfoPage
      eyebrow="About HUMI"
      title="A little more human. A little less alone."
      intro="HUMI is a global marketplace for real conversations — with real people, from everywhere."
      placeholder={false}
    >
      <section>
        <h2>Why we&apos;re building HUMI</h2>
        <p>
          The internet connected everyone, and somehow conversations got shorter. We think there&apos;s room for something simple: the chance to sit down — on audio or
          video — with a curious, friendly person from somewhere else, and just talk.
        </p>
      </section>
      <section>
        <h2>What you can do on HUMI</h2>
        <ul>
          <li>Have a relaxed conversation with someone new.</li>
          <li>Play games together.</li>
          <li>Practise a language with a native speaker.</li>
          <li>Learn about another culture first-hand.</li>
        </ul>
      </section>
      <section>
        <h2>What HUMI isn&apos;t</h2>
        <p>HUMI isn&apos;t a dating app, a therapy service, or a traditional social network. It&apos;s a place for genuine, respectful, paid conversations between adults.</p>
      </section>
    </InfoPage>
  );
}
