import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "pt" ? "Sobre o HUMI" : "About HUMI" };
}

export default async function AboutPage() {
  if ((await getLocale()) === "pt") {
    return (
      <InfoPage
        eyebrow="Sobre o HUMI"
        title="Um pouco mais humano. Um pouco menos sozinho."
        intro="O HUMI é um marketplace global de conversas reais — com pessoas reais, de todo lugar."
       
      >
        <section>
          <h2>Por que estamos criando o HUMI</h2>
          <p>
            A internet conectou todo mundo e, de algum jeito, as conversas ficaram mais curtas. Acreditamos que existe espaço para algo simples: a chance de sentar — por
            áudio ou vídeo — com uma pessoa curiosa e simpática de outro lugar, e simplesmente conversar.
          </p>
        </section>
        <section>
          <h2>O que você pode fazer no HUMI</h2>
          <ul>
            <li>Ter uma conversa tranquila com alguém novo.</li>
            <li>Jogar junto.</li>
            <li>Praticar um idioma com um falante nativo.</li>
            <li>Conhecer outra cultura de perto.</li>
          </ul>
        </section>
        <section>
          <h2>O que o HUMI não é</h2>
          <p>O HUMI não é um app de namoro, um serviço de terapia nem uma rede social tradicional. É um lugar para conversas pagas, genuínas e respeitosas entre adultos.</p>
        </section>
      </InfoPage>
    );
  }
  return (
    <InfoPage
      eyebrow="About HUMI"
      title="A little more human. A little less alone."
      intro="HUMI is a global marketplace for real conversations — with real people, from everywhere."
     
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
