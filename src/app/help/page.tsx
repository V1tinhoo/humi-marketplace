import type { Metadata } from "next";
import { InfoPage, LegalSections, type LegalSection } from "@/components/layout/InfoPage";
import { getLocale } from "@/i18n/server";
import { LEGAL } from "@/lib/legal";
import { JsonLd, faqJsonLd } from "@/components/seo/JsonLd";

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
    { q: "O que é o HUMI?", a: "O HUMI é uma plataforma brasileira para conversar por vídeo ou áudio com pessoas reais do mundo todo, pagando por minuto. Dá para bater papo, praticar idiomas como inglês e espanhol, trocar experiências culturais e jogar online com alguém." },
    { q: "Quanto custa?", a: "Criar conta é grátis. Cada host define o próprio preço por minuto, a partir de R$ 0,30. A cobrança é por segundo e só enquanto vocês dois estão conectados. Não há assinatura nem mensalidade: você coloca saldo com Pix ou cartão e usa quando quiser." },
    { q: "Dá para praticar inglês conversando com pessoas reais?", a: "Sim. No HUMI você filtra os hosts pelo idioma que falam e conversa por áudio ou vídeo, sem aula formal: é conversa livre sobre o que você quiser, ideal para perder o medo de falar." },
    { q: "Qual a diferença entre o HUMI e plataformas de aula como Preply ou Cambly?", a: "No HUMI não há aula nem pacote: é conversa livre com pessoas reais, cobrada por minuto. Você pode conversar 5 minutos ou uma hora e paga só pelo tempo conectado, em reais e com Pix." },
    { q: "Como ganhar dinheiro conversando no HUMI?", a: "Qualquer pessoa maior de 18 anos pode se cadastrar como host, definir o preço por minuto e os horários e receber por cada chamada. Os ganhos ficam disponíveis após o período de retenção e são sacados por Pix." },
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
    { q: "What is HUMI?", a: "HUMI is a Brazilian platform for paid one-to-one video or audio calls with real people around the world. You can chat, practise languages like English and Spanish, share cultures and play games online with someone." },
    { q: "How much does it cost?", a: "Creating an account is free. Each host sets their own price per minute, starting at R$ 0.30. Billing is per second and only while you're both connected. There's no subscription: you add balance with Pix or card and use it whenever you want." },
    { q: "Can I practise English by talking to real people?", a: "Yes. On HUMI you filter hosts by the languages they speak and talk by audio or video, with no formal lessons: free conversation about whatever you like, perfect for getting over the fear of speaking." },
    { q: "How is HUMI different from lesson platforms like Preply or Cambly?", a: "HUMI has no lessons or packages: it's free conversation with real people, billed per minute. You can talk for 5 minutes or an hour and pay only for the time you're connected, in Brazilian reais with Pix." },
    { q: "How can I earn money talking on HUMI?", a: "Anyone 18 or older can sign up as a host, set a per-minute price and hours, and get paid for each call. Earnings become available after the holding period and are withdrawn via Pix." },
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
      <JsonLd data={faqJsonLd(c.faqs)} />
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
