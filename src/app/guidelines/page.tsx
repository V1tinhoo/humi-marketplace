import type { Metadata } from "next";
import { InfoPage, LegalSections, type LegalSection } from "@/components/layout/InfoPage";
import { getLocale } from "@/i18n/server";
import { LEGAL } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "pt" ? "Diretrizes da comunidade" : "Community guidelines" };
}

const pt = (): { eyebrow: string; title: string; intro: string; sections: LegalSection[] } => ({
  eyebrow: "Comunidade",
  title: "Diretrizes da comunidade",
  intro: "Regras simples para que toda conversa no HUMI seja acolhedora, respeitosa e segura. Elas fazem parte dos Termos de uso e valem para clientes e hosts.",
  sections: [
    { h: "1. Respeito acima de tudo", p: ["Trate as pessoas como você gostaria de ser tratado. Não são permitidos assédio, ameaças, humilhação, discurso de ódio ou discriminação por raça, cor, etnia, religião, origem, gênero, orientação sexual, deficiência, idade ou qualquer outra condição."] },
    {
      h: "2. O que o HUMI é — e o que não é",
      list: [
        "O HUMI é para conversa amigável, jogos, prática de idiomas e troca cultural.",
        "O HUMI não é uma plataforma de namoro. Pedidos românticos, de encontro ou de cunho sexual não são permitidos.",
        "Ninguém deve oferecer terapia, diagnóstico, aconselhamento médico, psicológico, jurídico ou financeiro.",
        "Hosts oferecem uma conversa genuína — não prometem amizade, relacionamento ou apoio emocional profissional.",
      ],
    },
    { h: "3. Só para adultos", p: ["Todos no HUMI precisam ter 18 anos ou mais. Qualquer suspeita de menor de idade deve ser denunciada na hora: a conta é bloqueada para análise."] },
    {
      h: "4. Conteúdo proibido",
      list: [
        "Nudez, conteúdo sexual ou sexualizado, inclusive em fotos de perfil.",
        "Violência, automutilação ou incentivo a qualquer um deles.",
        "Drogas ilícitas, armas ou qualquer atividade ilegal.",
        "Golpes, spam, propaganda de outros serviços ou pedidos de dinheiro.",
        "Divulgação de dados pessoais de outras pessoas.",
      ],
    },
    { h: "5. Mantenha tudo no HUMI", p: ["Não peça nem compartilhe telefone, e-mail, endereço ou redes sociais, e não combine pagamentos fora da plataforma. Isso protege você contra golpes e garante que a cobrança e o repasse sejam feitos corretamente."] },
    { h: "6. Consentimento e gravação", p: ["Nunca grave, tire print ou compartilhe uma chamada (inclusive o compartilhamento de tela) sem o consentimento expresso de todos os participantes. O HUMI não grava as chamadas."] },
    {
      h: "7. Para hosts",
      list: [
        "Use fotos e informações verdadeiras sobre você.",
        "Só fique “Online agora” quando realmente puder atender.",
        "Trate todos os clientes com o mesmo respeito e encerre a chamada se ela fugir destas regras.",
        "Não peça avaliações em troca de favores nem pagamentos extras.",
      ],
    },
    {
      h: "8. Consequências",
      p: ["Dependendo da gravidade, violações podem levar a advertência, ocultação do perfil, suspensão ou encerramento definitivo da conta, além da retenção de valores ligados à violação. Casos que envolvam crimes são comunicados às autoridades."],
    },
    { h: "9. Como denunciar", p: [`Use o botão Denunciar no perfil, durante a chamada (menu ⋮) ou depois dela. As denúncias são confidenciais: a pessoa denunciada não sabe quem denunciou. Também é possível escrever para ${LEGAL.supportEmail}.`] },
  ],
});

const en = (): { eyebrow: string; title: string; intro: string; sections: LegalSection[] } => ({
  eyebrow: "Community",
  title: "Community guidelines",
  intro: "Simple rules so every conversation on HUMI is welcoming, respectful and safe. They are part of the Terms of Service and apply to customers and hosts alike.",
  sections: [
    { h: "1. Respect comes first", p: ["Treat people the way you'd like to be treated. Harassment, threats, humiliation, hate speech or discrimination based on race, colour, ethnicity, religion, origin, gender, sexual orientation, disability, age or any other condition are not allowed."] },
    {
      h: "2. What HUMI is — and isn't",
      list: [
        "HUMI is for friendly conversation, games, language practice and cultural exchange.",
        "HUMI is not a dating platform. Romantic, dating or sexual requests are not allowed.",
        "Nobody may offer therapy, diagnosis, or medical, psychological, legal or financial advice.",
        "Hosts offer a genuine conversation — they don't promise friendship, a relationship or professional emotional support.",
      ],
    },
    { h: "3. Adults only", p: ["Everyone on HUMI must be 18 or older. Report any suspected minor right away: the account is blocked for review."] },
    {
      h: "4. Prohibited content",
      list: [
        "Nudity, sexual or sexualised content, including in profile photos.",
        "Violence, self-harm, or encouraging either.",
        "Illegal drugs, weapons or any illegal activity.",
        "Scams, spam, advertising other services or asking for money.",
        "Sharing other people's personal data.",
      ],
    },
    { h: "5. Keep it on HUMI", p: ["Don't ask for or share phone numbers, e-mail, addresses or social media, and don't arrange payments outside the platform. This protects you from scams and makes sure billing and payouts are done correctly."] },
    { h: "6. Consent and recording", p: ["Never record, screenshot or share a call (including screen sharing) without the express consent of everyone in it. HUMI does not record calls."] },
    {
      h: "7. For hosts",
      list: [
        "Use real photos and true information about yourself.",
        "Only be “Online now” when you can actually take calls.",
        "Treat every customer with the same respect and end the call if it breaks these rules.",
        "Don't ask for ratings in exchange for favours or extra payments.",
      ],
    },
    { h: "8. Consequences", p: ["Depending on how serious it is, a violation can lead to a warning, a hidden profile, suspension or permanent closure of the account, and amounts linked to the violation may be withheld. Cases involving crimes are reported to the authorities."] },
    { h: "9. How to report", p: [`Use the Report button on a profile, during a call (⋮ menu) or after it. Reports are confidential: the reported person doesn't learn who reported them. You can also write to ${LEGAL.supportEmail}.`] },
  ],
});

export default async function GuidelinesPage() {
  const c = (await getLocale()) === "pt" ? pt() : en();
  return (
    <InfoPage eyebrow={c.eyebrow} title={c.title} intro={c.intro} updated={LEGAL.updatedAt}>
      <LegalSections sections={c.sections} />
    </InfoPage>
  );
}
