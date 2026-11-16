import type { Metadata } from "next";
import { InfoPage, LegalSections, type LegalSection } from "@/components/layout/InfoPage";
import { getLocale } from "@/i18n/server";
import { LEGAL } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "pt" ? "Central de ajuda" : "Help Center" };
}

type Content = { eyebrow: string; title: string; intro: string; faqTitle: string; faqs: { q: string; a: string }[]; policy: LegalSection[]; contact: LegalSection };

const pt = (): Content => ({
  eyebrow: "Central de ajuda",
  title: "Como podemos ajudar?",
  intro: "Respostas para as dúvidas mais comuns sobre o HUMI.",
  faqTitle: "Perguntas frequentes",
  faqs: [
    { q: "Como funcionam as chamadas?", a: "Escolha um host que esteja online e comece uma chamada de áudio ou vídeo, ou agende um horário. As chamadas acontecem aqui mesmo no HUMI, com chat e compartilhamento de tela." },
    { q: "Como sou cobrado?", a: "Você adiciona saldo à sua carteira com Pix ou cartão. As chamadas são cobradas por segundo, no preço do host, e só enquanto vocês dois estão conectados. O tempo chamando e as quedas de conexão não são cobrados." },
    { q: "Os hosts são reais?", a: "Sim. Todos os hosts são pessoas reais, maiores de 18 anos, que criaram o próprio perfil no HUMI e definem seus preços e horários. As avaliações vêm de quem realmente conversou com eles." },
    { q: "O HUMI é um app de namoro ou de terapia?", a: "Não. O HUMI é para conversas sociais e amigáveis entre adultos. Não é namoro, terapia nem aconselhamento profissional." },
    { q: "As chamadas são gravadas?", a: "Não. O HUMI não grava o áudio nem o vídeo das chamadas, e as mensagens do chat não ficam guardadas nos nossos servidores. Gravar uma chamada sem o consentimento de todos é proibido." },
    { q: "Como denuncio alguém?", a: "Use o botão Denunciar no perfil da pessoa, durante a chamada (menu ⋮) ou depois dela. As denúncias são confidenciais e analisadas pela nossa equipe." },
  ],
  policy: [
    {
      id: "cancellation",
      h: "Política de cancelamento e reembolso",
      p: ["Esta política complementa os Termos de uso e segue o Código de Defesa do Consumidor."],
    },
    {
      h: "Agendamentos",
      list: [
        "Reservar um horário é gratuito: nada é cobrado no momento da reserva.",
        "Você pode cancelar uma reserva a qualquer momento antes do horário, sem nenhum custo.",
        "Se o host cancelar ou não aparecer, nada é cobrado.",
      ],
    },
    {
      h: "Chamadas",
      list: [
        "Você paga apenas pelo tempo em que vocês dois estão conectados, cobrado por segundo. Pode encerrar a chamada quando quiser.",
        "Chamadas que não conectam, o tempo chamando e o tempo em que a conexão cai não são cobrados.",
        `Se houver problema técnico ou conduta inadequada do host, envie uma denúncia ou escreva para ${LEGAL.supportEmail} em até 7 dias. Após análise, o valor pode ser devolvido ao seu saldo ou ao meio de pagamento original.`,
      ],
    },
    {
      h: "Recargas da carteira",
      list: [
        "Direito de arrependimento: você pode desistir de uma recarga em até 7 (sete) dias da compra e receber de volta o valor ainda não utilizado, pelo mesmo meio de pagamento, nos termos do art. 49 do Código de Defesa do Consumidor.",
        "Depois desse prazo, o saldo continua disponível para uso em chamadas.",
        "Ao encerrar sua conta, o saldo real não utilizado é devolvido mediante solicitação, sem custo.",
        "Reembolsos por Pix costumam ser feitos em até 5 dias úteis após a aprovação; no cartão, o prazo depende da administradora.",
      ],
    },
    {
      h: "Como pedir",
      p: [`Envie um e-mail para ${LEGAL.supportEmail} com o e-mail da sua conta, a data da recarga ou da chamada e o motivo. Respondemos em até 5 dias úteis.`],
    },
  ],
  contact: { h: "Contato", p: [`Fale com a gente pelo e-mail ${LEGAL.supportEmail}. Para assuntos de privacidade e dados pessoais: ${LEGAL.privacyEmail}.`] },
});

const en = (): Content => ({
  eyebrow: "Help Center",
  title: "How can we help?",
  intro: "Answers to the most common questions about HUMI.",
  faqTitle: "Frequently asked questions",
  faqs: [
    { q: "How do calls work?", a: "Pick a host who's online and start an audio or video call, or book a time. Calls happen right here on HUMI, with chat and screen sharing." },
    { q: "How am I charged?", a: "You add balance to your wallet with Pix or card. Calls are billed per second at the host's price, only while you're both connected. Ringing time and dropped connections are not charged." },
    { q: "Are the hosts real?", a: "Yes. Every host is a real person aged 18 or over who created their own profile on HUMI and sets their own prices and hours. Ratings come from people who actually talked to them." },
    { q: "Is HUMI a dating or therapy app?", a: "No. HUMI is for friendly social conversations between adults. It isn't dating, therapy or professional advice." },
    { q: "Are calls recorded?", a: "No. HUMI doesn't record call audio or video, and chat messages aren't stored on our servers. Recording a call without everyone's consent is not allowed." },
    { q: "How do I report someone?", a: "Use the Report button on the person's profile, during the call (⋮ menu) or after it. Reports are confidential and reviewed by our team." },
  ],
  policy: [
    { id: "cancellation", h: "Cancellation and refund policy", p: ["This policy complements the Terms of Service and follows Brazilian consumer protection law."] },
    {
      h: "Bookings",
      list: [
        "Reserving a time is free: nothing is charged when you book.",
        "You can cancel a booking at any time before it starts, at no cost.",
        "If the host cancels or doesn't show up, nothing is charged.",
      ],
    },
    {
      h: "Calls",
      list: [
        "You only pay for the time you're both connected, billed per second. You can end the call whenever you like.",
        "Calls that don't connect, ringing time and time while the connection is down are not charged.",
        `If there's a technical problem or inappropriate conduct by the host, report it or write to ${LEGAL.supportEmail} within 7 days. After review, the amount may be returned to your balance or original payment method.`,
      ],
    },
    {
      h: "Wallet top-ups",
      list: [
        "Right of withdrawal: you can cancel a top-up within 7 (seven) days of purchase and get the unused amount back, by the same payment method (article 49 of the Brazilian Consumer Protection Code).",
        "After that, your balance stays available for calls.",
        "If you close your account, any unused real balance is refunded on request, free of charge.",
        "Pix refunds are usually made within 5 business days after approval; for cards, timing depends on the card issuer.",
      ],
    },
    { h: "How to ask", p: [`E-mail ${LEGAL.supportEmail} with your account e-mail, the date of the top-up or call and the reason. We reply within 5 business days.`] },
  ],
  contact: { h: "Contact", p: [`Reach us at ${LEGAL.supportEmail}. For privacy and personal data matters: ${LEGAL.privacyEmail}.`] },
});

export default async function HelpPage() {
  const c = (await getLocale()) === "pt" ? pt() : en();
  return (
    <InfoPage eyebrow={c.eyebrow} title={c.title} intro={c.intro}>
      <section>
        <h2>{c.faqTitle}</h2>
        <div className="divide-y divide-line rounded-2xl bg-white ring-1 ring-line">
          {c.faqs.map((f) => (
            <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold">
                {f.q}
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-cream text-lg leading-none ring-1 ring-line transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      <LegalSections sections={[...c.policy, c.contact]} />
    </InfoPage>
  );
}
