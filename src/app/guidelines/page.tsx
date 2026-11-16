import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "pt" ? "Diretrizes da comunidade" : "Community guidelines" };
}

const content = {
  en: {
    eyebrow: "Community",
    title: "Community guidelines",
    intro: "A few simple rules so every conversation on HUMI feels welcoming, respectful and safe.",
    blocks: [
      { h: "Be kind and respectful", p: "Treat people the way you'd like to be treated. No harassment, hate speech, bullying, or discrimination of any kind." },
      { h: "Know what HUMI is — and isn't", list: ["HUMI is for friendly conversation, games, language practice and cultural exchange.", "HUMI is not a dating platform. Romantic or sexual requests are not allowed.", "Hosts don't provide therapy, medical, legal or financial advice.", "No one is promised friendship or emotional support — just a genuine conversation."] },
      { h: "Adults only", p: "Everyone on HUMI must be 18 or older." },
      { h: "Keep it on HUMI", p: "Don't ask for or share personal contact details, and don't arrange payments outside the platform." },
      { h: "Consent and recording", p: "Never record, screenshot, or share a session without the clear consent of everyone involved." },
      { h: "Reporting", p: "If someone breaks these rules, report them. Violations can lead to warnings, suspension, or permanent removal." },
    ],
  },
  pt: {
    eyebrow: "Comunidade",
    title: "Diretrizes da comunidade",
    intro: "Algumas regras simples para que toda conversa no HUMI seja acolhedora, respeitosa e segura.",
    blocks: [
      { h: "Seja gentil e respeitoso", p: "Trate as pessoas como você gostaria de ser tratado. Nada de assédio, discurso de ódio, bullying ou discriminação de qualquer tipo." },
      { h: "Saiba o que o HUMI é — e o que não é", list: ["O HUMI é para conversas amigáveis, jogos, prática de idiomas e troca cultural.", "O HUMI não é uma plataforma de namoro. Pedidos românticos ou sexuais não são permitidos.", "Os hosts não oferecem terapia nem aconselhamento médico, jurídico ou financeiro.", "Ninguém promete amizade ou apoio emocional — só uma conversa genuína."] },
      { h: "Só para adultos", p: "Todos no HUMI precisam ter 18 anos ou mais." },
      { h: "Mantenha tudo no HUMI", p: "Não peça nem compartilhe contatos pessoais e não combine pagamentos fora da plataforma." },
      { h: "Consentimento e gravação", p: "Nunca grave, tire print ou compartilhe uma sessão sem o consentimento claro de todos os envolvidos." },
      { h: "Denúncias", p: "Se alguém quebrar estas regras, denuncie. Violações podem levar a advertências, suspensão ou remoção permanente." },
    ],
  },
};

export default async function GuidelinesPage() {
  const c = content[await getLocale()];
  return (
    <InfoPage eyebrow={c.eyebrow} title={c.title} intro={c.intro}>
      {c.blocks.map((b) => (
        <section key={b.h}>
          <h2>{b.h}</h2>
          {b.p && <p>{b.p}</p>}
          {b.list && (
            <ul>
              {b.list.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </InfoPage>
  );
}
