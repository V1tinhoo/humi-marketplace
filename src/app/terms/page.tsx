import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "pt" ? "Termos de uso" : "Terms of Service" };
}

const content = {
  en: {
    eyebrow: "Legal",
    title: "Terms of Service",
    intro: "These placeholder terms outline how HUMI is intended to work. They are not yet legally binding.",
    sections: [
      ["1. The service", "HUMI is a marketplace that lets adults book paid conversation and social sessions with independent hosts. HUMI is not a party to the conversation itself."],
      ["2. Eligibility", "You must be at least 18 years old to create an account, book, or host."],
      ["3. Prices and payments", "Hosts set a price per minute within platform limits. Guests add balance to a prepaid wallet and are billed per second, only while both people are connected. Reserving a time is free. Payments are processed by a third-party payment provider."],
      ["4. Cancellations and refunds", "See the draft cancellation policy in the Help Center. Final terms will be published before launch."],
      ["5. Prohibited conduct", "Using HUMI for dating, sexual services, therapy, harassment, fraud, or to move transactions off-platform is prohibited."],
      ["6. Hosts", "Hosts are independent and responsible for their own conduct and any taxes on their earnings."],
      ["7. Changes", "We may update these terms and will notify members of material changes."],
    ],
  },
  pt: {
    eyebrow: "Legal",
    title: "Termos de uso",
    intro: "Estes termos provisórios descrevem como o HUMI deve funcionar. Eles ainda não têm validade jurídica.",
    sections: [
      ["1. O serviço", "O HUMI é um marketplace que permite que adultos agendem sessões pagas de conversa e convivência com hosts independentes. O HUMI não é parte da conversa em si."],
      ["2. Quem pode usar", "Você precisa ter pelo menos 18 anos para criar uma conta, agendar ou ser host."],
      ["3. Preços e pagamentos", "Os hosts definem um preço por minuto dentro dos limites da plataforma. Quem conversa adiciona saldo a uma carteira pré-paga e é cobrado por segundo, só enquanto as duas pessoas estão conectadas. Reservar um horário é grátis. Os pagamentos são processados por um provedor de pagamentos terceirizado."],
      ["4. Cancelamentos e reembolsos", "Veja o rascunho da política de cancelamento na Central de ajuda. Os termos finais serão publicados antes do lançamento."],
      ["5. Condutas proibidas", "É proibido usar o HUMI para namoro, serviços sexuais, terapia, assédio, fraude ou para levar transações para fora da plataforma."],
      ["6. Hosts", "Os hosts são independentes e responsáveis pela própria conduta e pelos impostos sobre seus ganhos."],
      ["7. Alterações", "Podemos atualizar estes termos e avisaremos os membros sobre mudanças importantes."],
    ],
  },
};

export default async function TermsPage() {
  const c = content[await getLocale()];
  return (
    <InfoPage eyebrow={c.eyebrow} title={c.title} intro={c.intro}>
      {c.sections.map(([h, p]) => (
        <section key={h}>
          <h2>{h}</h2>
          <p>{p}</p>
        </section>
      ))}
    </InfoPage>
  );
}
