import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "pt" ? "Central de ajuda" : "Help Center" };
}

const content = {
  en: {
    eyebrow: "Help Center",
    title: "How can we help?",
    intro: "Answers to common questions about HUMI. More help articles will be added before launch.",
    faqTitle: "Frequently asked questions",
    faqs: [
      { q: "How do calls work?", a: "Pick a host who's online and start an audio or video call, or schedule a time. Calls happen right here on HUMI, with chat and screen sharing." },
      { q: "How am I charged?", a: "Add balance to your wallet with Pix or card. Calls are billed per second at the host's price, and only while you're both connected." },
      { q: "Are the hosts real?", a: "HUMI is in beta. Some profiles are samples used to demonstrate the product, and they're labelled as such." },
      { q: "Is HUMI a dating or therapy app?", a: "No. HUMI is for friendly social conversations between adults. It isn't dating, therapy, or professional advice." },
    ],
    cancelTitle: "Cancellation policy (draft)",
    cancel: [
      "Guests can cancel a scheduled session for free up to 12 hours before it starts.",
      "Calls are only charged for the time you're actually connected.",
      "If a host cancels or doesn't show up, nothing is charged.",
      "Sessions ended early for safety reasons are reviewed case by case.",
    ],
    cancelNote: "This policy is a placeholder and will be finalised before launch.",
    contactTitle: "Contact",
    contact: "Support channels will open with the beta launch. To report someone, use the Report button on their profile or during the call.",
  },
  pt: {
    eyebrow: "Central de ajuda",
    title: "Como podemos ajudar?",
    intro: "Respostas para as dúvidas mais comuns sobre o HUMI. Mais artigos de ajuda serão adicionados antes do lançamento.",
    faqTitle: "Perguntas frequentes",
    faqs: [
      { q: "Como funcionam as chamadas?", a: "Escolha um host que esteja online e comece uma chamada de áudio ou vídeo, ou agende um horário. As chamadas acontecem aqui mesmo no HUMI, com chat e compartilhamento de tela." },
      { q: "Como sou cobrado?", a: "Adicione saldo à sua carteira com Pix ou cartão. As chamadas são cobradas por segundo, no preço do host, e só enquanto vocês dois estão conectados." },
      { q: "Os hosts são reais?", a: "O HUMI está em beta. Alguns perfis são exemplos usados para demonstrar o produto, e estão identificados como tal." },
      { q: "O HUMI é um app de namoro ou de terapia?", a: "Não. O HUMI é para conversas sociais e amigáveis entre adultos. Não é namoro, terapia nem aconselhamento profissional." },
    ],
    cancelTitle: "Política de cancelamento (rascunho)",
    cancel: [
      "Quem agendou pode cancelar de graça até 12 horas antes da sessão.",
      "As chamadas só são cobradas pelo tempo em que vocês estão realmente conectados.",
      "Se o host cancelar ou não aparecer, nada é cobrado.",
      "Sessões encerradas antes por motivo de segurança são analisadas caso a caso.",
    ],
    cancelNote: "Esta política é provisória e será finalizada antes do lançamento.",
    contactTitle: "Contato",
    contact: "Os canais de suporte serão abertos com o lançamento do beta. Para denunciar alguém, use o botão Denunciar no perfil ou durante a chamada.",
  },
};

export default async function HelpPage() {
  const c = content[await getLocale()];
  return (
    <InfoPage eyebrow={c.eyebrow} title={c.title} intro={c.intro} placeholder={false}>
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
      <section id="cancellation" className="scroll-mt-28">
        <h2>{c.cancelTitle}</h2>
        <ul>
          {c.cancel.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p>{c.cancelNote}</p>
      </section>
      <section>
        <h2>{c.contactTitle}</h2>
        <p>{c.contact}</p>
      </section>
    </InfoPage>
  );
}
