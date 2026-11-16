import type { Metadata } from "next";
import { InfoPage, LegalSections, type LegalSection } from "@/components/layout/InfoPage";
import { getLocale } from "@/i18n/server";
import { LEGAL } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "pt" ? "Segurança" : "Safety" };
}

const pt = (): { eyebrow: string; title: string; intro: string; sections: LegalSection[] } => ({
  eyebrow: "Segurança",
  title: "Conexões reais começam com confiança.",
  intro: "Veja como o HUMI protege cada conversa e o que você pode fazer para se manter seguro.",
  sections: [
    { h: "Para quem é o HUMI", p: ["O HUMI é para adultos com 18 anos ou mais. As chamadas são conversas sociais pagas: conversar, jogar, praticar idiomas e trocar experiências. O HUMI não é um serviço de namoro, não é terapia e não substitui ajuda profissional ou de emergência."] },
    {
      h: "Como protegemos você",
      list: [
        "Pagamentos seguros — processados pelo Mercado Pago. O HUMI não guarda números de cartão nem dados bancários.",
        "Cobrança justa — por segundo, só enquanto vocês dois estão conectados. Quedas de conexão não são cobradas.",
        "Privacidade por padrão — só o primeiro nome aparece, sem troca de telefone ou e-mail, e as chamadas acontecem dentro do HUMI.",
        "Sem gravação — o HUMI não grava o áudio nem o vídeo das chamadas, e o chat não fica guardado nos nossos servidores.",
        "Avaliações reais — só quem concluiu uma chamada pode avaliá-la.",
        "Denúncia em um clique — no perfil, durante a chamada e depois dela, com análise pela nossa equipe.",
        "Moderação — perfis podem ser ocultados e contas bloqueadas quando as regras são quebradas.",
      ],
    },
    {
      h: "Como se manter seguro numa chamada",
      list: [
        "Mantenha conversas e pagamentos no HUMI. Desconfie de quem pedir para continuar em outro app ou pagar por fora.",
        "Não compartilhe endereço, documentos, dados bancários, senhas ou códigos de verificação.",
        "Você pode encerrar qualquer chamada a qualquer momento se se sentir desconfortável — e denunciar logo em seguida.",
        "Se alguém parecer menor de idade, encerre a chamada e denuncie.",
      ],
    },
    {
      h: "Em caso de emergência",
      list: [
        "CVV — Centro de Valorização da Vida: 188 (24 horas, gratuito) ou cvv.org.br.",
        "SAMU: 192.",
        "Polícia Militar: 190.",
        "Denúncias de crimes contra crianças e adolescentes: Disque 100.",
      ],
    },
    { h: "Fale com a gente", p: [`Para relatar um problema de segurança, escreva para ${LEGAL.supportEmail}.`] },
  ],
});

const en = (): { eyebrow: string; title: string; intro: string; sections: LegalSection[] } => ({
  eyebrow: "Safety",
  title: "Real connections start with trust.",
  intro: "Here's how HUMI protects every conversation and what you can do to stay safe.",
  sections: [
    { h: "Who HUMI is for", p: ["HUMI is for adults aged 18 and over. Calls are paid social conversations: talking, playing games, practising languages and sharing experiences. HUMI is not a dating service, not therapy, and not a substitute for professional or emergency help."] },
    {
      h: "How we protect you",
      list: [
        "Secure payments — processed by Mercado Pago. HUMI never stores card numbers or bank details.",
        "Fair billing — per second, only while you're both connected. Dropped connections aren't charged.",
        "Private by default — first names only, no phone or e-mail exchange, and calls stay inside HUMI.",
        "No recording — HUMI doesn't record call audio or video, and chat isn't stored on our servers.",
        "Real reviews — only people who completed a call can review it.",
        "One-tap reporting — on profiles, during and after calls, reviewed by our team.",
        "Moderation — profiles can be hidden and accounts blocked when rules are broken.",
      ],
    },
    {
      h: "Staying safe in a call",
      list: [
        "Keep conversations and payments on HUMI. Be wary of anyone asking to move to another app or pay outside it.",
        "Don't share your address, documents, bank details, passwords or verification codes.",
        "You can end any call at any time if you feel uncomfortable — and report it right after.",
        "If someone seems to be under 18, end the call and report it.",
      ],
    },
    { h: "In an emergency", p: ["If you're in crisis or in danger, contact your local emergency services right away."] },
    { h: "Contact us", p: [`To report a safety problem, write to ${LEGAL.supportEmail}.`] },
  ],
});

export default async function SafetyPage() {
  const c = (await getLocale()) === "pt" ? pt() : en();
  return (
    <InfoPage eyebrow={c.eyebrow} title={c.title} intro={c.intro} updated={LEGAL.updatedAt}>
      <LegalSections sections={c.sections} />
    </InfoPage>
  );
}
