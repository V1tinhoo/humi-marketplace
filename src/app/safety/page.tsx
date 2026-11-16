import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "pt" ? "Segurança" : "Safety" };
}

const content = {
  en: {
    eyebrow: "Safety",
    title: "Real connections start with trust.",
    intro: "HUMI is in beta. This page describes the safety measures we're building for launch, and we'll say clearly which ones are live.",
    whoH: "Who HUMI is for",
    who: "HUMI is for adults aged 18 and over. Sessions are paid social conversations: talking, playing games, practising languages and sharing experiences. HUMI is not a dating service, not therapy, and not a substitute for professional or emergency help.",
    planH: "Protections",
    plan: [
      ["Verified hosts", "identity and age checks through a specialist provider before a host can accept sessions (planned)."],
      ["Secure payments", "handled by a certified payment provider; HUMI doesn't store card numbers."],
      ["Ratings from real calls", "only people who completed a call can rate it."],
      ["Report", "available on every profile and during every call."],
      ["Private by default", "first names only, no shared phone numbers or emails, calls stay on HUMI."],
      ["Moderation", "a trust & safety team reviewing reports, with clear enforcement."],
    ],
    tipsH: "Staying safe in a call",
    tips: ["Keep conversations and payments on HUMI.", "Don't share your address, financial details, or passwords.", "You can end any call at any time if you feel uncomfortable.", "If you're in crisis or danger, contact your local emergency services."],
  },
  pt: {
    eyebrow: "Segurança",
    title: "Conexões reais começam com confiança.",
    intro: "O HUMI está em beta. Esta página descreve as medidas de segurança que estamos construindo para o lançamento, e diremos com clareza quais já estão ativas.",
    whoH: "Para quem é o HUMI",
    who: "O HUMI é para adultos com 18 anos ou mais. As sessões são conversas sociais pagas: conversar, jogar, praticar idiomas e trocar experiências. O HUMI não é um serviço de namoro, não é terapia e não substitui ajuda profissional ou de emergência.",
    planH: "Proteções",
    plan: [
      ["Hosts verificados", "verificação de identidade e idade por um provedor especializado antes que o host possa aceitar sessões (planejado)."],
      ["Pagamentos seguros", "processados por um provedor de pagamentos certificado; o HUMI não guarda números de cartão."],
      ["Avaliações de chamadas reais", "só quem concluiu uma chamada pode avaliá-la."],
      ["Denúncia", "disponível em todos os perfis e durante todas as chamadas."],
      ["Privacidade por padrão", "só o primeiro nome, sem troca de telefone ou e-mail, e as chamadas ficam no HUMI."],
      ["Moderação", "uma equipe de confiança e segurança analisando denúncias, com regras claras."],
    ],
    tipsH: "Como se manter seguro numa chamada",
    tips: ["Mantenha conversas e pagamentos no HUMI.", "Não compartilhe seu endereço, dados financeiros ou senhas.", "Você pode encerrar qualquer chamada a qualquer momento se se sentir desconfortável.", "Se estiver em crise ou em perigo, procure os serviços de emergência (no Brasil, CVV 188, SAMU 192 ou Polícia 190)."],
  },
};

export default async function SafetyPage() {
  const c = content[await getLocale()];
  return (
    <InfoPage eyebrow={c.eyebrow} title={c.title} intro={c.intro}>
      <section>
        <h2>{c.whoH}</h2>
        <p>{c.who}</p>
      </section>
      <section>
        <h2>{c.planH}</h2>
        <ul>
          {c.plan.map(([b, rest]) => (
            <li key={b}>
              <strong>{b}</strong> — {rest}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>{c.tipsH}</h2>
        <ul>
          {c.tips.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>
    </InfoPage>
  );
}
