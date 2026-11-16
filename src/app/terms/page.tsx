import type { Metadata } from "next";
import { InfoPage, LegalSections, type LegalSection } from "@/components/layout/InfoPage";
import { getLocale } from "@/i18n/server";
import { LEGAL, legalEntity } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "pt" ? "Termos de uso" : "Terms of Service" };
}

const pt = (): { eyebrow: string; title: string; intro: string; sections: LegalSection[] } => ({
  eyebrow: "Legal",
  title: "Termos de uso",
  intro: `Estes Termos regulam o uso do ${LEGAL.brand} (${LEGAL.website}). Ao criar uma conta ou usar a plataforma, você declara que leu, entendeu e concorda com eles e com a nossa Política de privacidade.`,
  sections: [
    {
      h: "1. Quem somos",
      p: [
        `O ${LEGAL.brand} é uma plataforma on-line operada por ${legalEntity()} que aproxima pessoas interessadas em conversar ("clientes") de pessoas que oferecem seu tempo para conversas ("hosts"), por áudio ou vídeo.`,
        `O ${LEGAL.brand} atua como intermediador: fornece a tecnologia, processa a cobrança e repassa aos hosts os valores devidos. O ${LEGAL.brand} não é parte das conversas nem orienta o seu conteúdo, que é de responsabilidade das pessoas envolvidas, observadas estas regras.`,
      ],
    },
    {
      h: "2. O que o HUMI é — e o que não é",
      p: ["As chamadas no HUMI são conversas sociais entre adultos: bater papo, praticar idiomas, jogar e trocar experiências."],
      list: [
        "O HUMI não é um serviço de namoro, encontros ou relacionamento.",
        "O HUMI não presta e não permite que se preste, por meio da plataforma, terapia, atendimento psicológico ou médico, aconselhamento jurídico ou financeiro.",
        "O HUMI não é um serviço de emergência. Em situação de risco, ligue para o CVV (188), SAMU (192) ou Polícia (190).",
      ],
    },
    {
      h: "3. Quem pode usar",
      list: [
        "Somente maiores de 18 anos, com capacidade civil plena. É proibido o cadastro de menores de idade.",
        "Você deve fornecer informações verdadeiras e mantê-las atualizadas, e pode ter apenas uma conta.",
        "Você é responsável pela guarda da sua senha e por toda atividade realizada na sua conta. Avise-nos imediatamente em caso de uso indevido.",
        `O ${LEGAL.brand} pode pedir, a qualquer momento, a confirmação de identidade e idade, e suspender a conta enquanto ela não for feita.`,
      ],
    },
    {
      h: "4. Chamadas e cobrança",
      list: [
        "Cada host define o preço por minuto da sua chamada, dentro dos limites da plataforma. O preço aparece no perfil do host antes do início da chamada.",
        "A cobrança é feita por segundo, a partir do saldo da sua carteira, somente enquanto vocês dois estão conectados. O tempo chamando e o tempo em que a conexão cai não são cobrados.",
        "Para iniciar uma chamada, é preciso ter saldo suficiente para pelo menos 1 minuto. Se o saldo acabar, a chamada é encerrada automaticamente.",
        "Chamadas que não chegam a conectar não são cobradas. Reservar um horário (agendamento) é gratuito.",
        "Os valores cobrados são calculados pelos servidores do HUMI e ficam disponíveis no histórico da sua carteira.",
      ],
    },
    {
      h: "5. Carteira e recargas",
      list: [
        "As recargas são processadas pelo Mercado Pago, por Pix ou cartão. O HUMI não armazena dados de cartão.",
        "O saldo da carteira serve exclusivamente para pagar chamadas no HUMI. Ele não é conta bancária, não rende juros e não pode ser transferido a terceiros.",
        "Você pode desistir de uma recarga em até 7 (sete) dias da compra e receber de volta o valor não utilizado, nos termos do art. 49 do Código de Defesa do Consumidor. Veja os detalhes na Política de cancelamento e reembolso.",
        "Ao encerrar sua conta, o saldo real não utilizado será devolvido mediante solicitação, sem custo.",
        "Bônus e indicações: o bônus de primeira recarga e o crédito por indicação, quando oferecidos, valem apenas para pagar chamadas no HUMI. Eles não podem ser sacados nem reembolsados em dinheiro e são retirados se a recarga que os gerou for reembolsada. Os valores e as condições aparecem no site e podem mudar, sem afetar bônus já concedidos.",
        "O crédito por indicação é concedido uma vez por pessoa indicada, quando ela faz a primeira recarga. É proibido criar contas falsas, indicar a si mesmo ou usar qualquer meio fraudulento: nesses casos os bônus são cancelados e a conta pode ser suspensa.",
      ],
    },
    {
      h: "6. Hosts",
      list: [
        `Os hosts são profissionais independentes. Não há vínculo empregatício, societário ou de representação entre o host e o ${LEGAL.brand}.`,
        `O ${LEGAL.brand} retém uma taxa de serviço sobre cada minuto cobrado. O valor líquido que o host recebe por minuto é exibido no painel do host antes de ele confirmar o preço.`,
        "Os ganhos de cada chamada ficam em retenção pelo período informado no painel (para cobrir reembolsos e contestações) e depois ficam disponíveis para saque por Pix, para uma chave de titularidade do próprio host.",
        "O host é responsável por informar dados verdadeiros, pela chave Pix cadastrada e pelo recolhimento dos tributos incidentes sobre os seus ganhos.",
        "Ganhos obtidos por fraude, por violação destes Termos ou que sejam objeto de reembolso podem ser retidos ou estornados.",
      ],
    },
    {
      h: "7. Condutas proibidas",
      list: [
        "Assédio, ameaças, discurso de ódio, discriminação ou qualquer forma de violência.",
        "Conteúdo ou pedidos de natureza sexual, nudez ou exploração de qualquer tipo.",
        "Qualquer interação com menores de idade ou envolvendo menores.",
        "Pedir ou oferecer contatos pessoais, ou combinar pagamentos fora do HUMI.",
        "Golpes, spam, fraude, uso de identidade falsa ou de meios de pagamento de terceiros.",
        "Gravar, fotografar ou divulgar uma chamada sem o consentimento expresso de todos os participantes.",
        "Tentar burlar a cobrança, os sistemas de segurança ou o funcionamento da plataforma.",
      ],
    },
    {
      h: "8. Privacidade nas chamadas",
      p: [
        `O ${LEGAL.brand} não grava o áudio nem o vídeo das chamadas, e as mensagens do chat da chamada não são armazenadas nos nossos servidores. Registramos apenas os dados necessários para a cobrança e a segurança (como horários, duração e valores), conforme a Política de privacidade.`,
      ],
    },
    {
      h: "9. Denúncias, suspensão e encerramento",
      list: [
        "Qualquer pessoa pode denunciar um usuário pelo perfil, durante ou depois da chamada. As denúncias são confidenciais.",
        `Em caso de violação destes Termos ou risco à segurança, o ${LEGAL.brand} pode advertir, ocultar perfis, suspender ou encerrar contas, de forma proporcional à gravidade.`,
        "Você pode encerrar sua conta a qualquer momento, pelo e-mail de contato.",
      ],
    },
    {
      h: "10. Avaliações",
      p: ["Somente quem participou de uma chamada concluída pode avaliá-la. Avaliações devem ser honestas e respeitosas, e podem ser removidas se violarem estes Termos."],
    },
    {
      h: "11. Propriedade intelectual",
      p: [`A marca, o nome, o logotipo, o design e o software do ${LEGAL.brand} pertencem ao ${LEGAL.brand}. Ao publicar fotos e textos no seu perfil, você declara ter os direitos sobre eles e autoriza o ${LEGAL.brand} a exibi-los na plataforma.`],
    },
    {
      h: "12. Responsabilidades",
      p: [
        `O ${LEGAL.brand} se empenha para manter a plataforma disponível e segura, mas o serviço pode passar por interrupções, manutenções ou falhas de terceiros (como internet e provedores). Nesses casos, o tempo não conectado não é cobrado.`,
        `Cada usuário responde pelo que diz e faz nas chamadas. Nada nestes Termos afasta os direitos garantidos pelo Código de Defesa do Consumidor.`,
      ],
    },
    {
      h: "13. Alterações destes Termos",
      p: ["Podemos atualizar estes Termos. Mudanças relevantes serão avisadas com antecedência pelo site ou por e-mail. O uso da plataforma após a vigência das mudanças indica concordância com elas."],
    },
    {
      h: "14. Lei aplicável e foro",
      p: ["Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro do domicílio do consumidor para resolver qualquer questão relacionada a eles."],
    },
    {
      h: "15. Contato",
      p: [`Dúvidas, solicitações e reclamações: ${LEGAL.supportEmail}.`],
    },
  ],
});

const en = (): { eyebrow: string; title: string; intro: string; sections: LegalSection[] } => ({
  eyebrow: "Legal",
  title: "Terms of Service",
  intro: `These Terms govern the use of ${LEGAL.brand} (${LEGAL.website}). By creating an account or using the platform you confirm that you have read, understood and agree to them and to our Privacy Policy.`,
  sections: [
    {
      h: "1. Who we are",
      p: [
        `${LEGAL.brand} is an online platform operated by ${legalEntity()} that connects people who want to talk ("customers") with people who offer their time for conversations ("hosts"), by audio or video.`,
        `${LEGAL.brand} acts as an intermediary: it provides the technology, processes payments and pays hosts what they are owed. ${LEGAL.brand} is not a party to the conversations and does not direct their content, which is the responsibility of the people involved, within these rules.`,
      ],
    },
    {
      h: "2. What HUMI is — and isn't",
      p: ["Calls on HUMI are social conversations between adults: chatting, practising languages, playing games and sharing experiences."],
      list: [
        "HUMI is not a dating or relationship service.",
        "HUMI does not provide, and does not allow anyone to provide through the platform, therapy, psychological or medical care, or legal or financial advice.",
        "HUMI is not an emergency service. If you are in danger, contact your local emergency services.",
      ],
    },
    {
      h: "3. Who can use HUMI",
      list: [
        "Only adults aged 18 or over with full legal capacity. Minors may not register.",
        "You must provide true information, keep it up to date, and have only one account.",
        "You are responsible for keeping your password safe and for all activity on your account. Tell us immediately about any misuse.",
        `${LEGAL.brand} may ask you to confirm your identity and age at any time and suspend the account until you do.`,
      ],
    },
    {
      h: "4. Calls and billing",
      list: [
        "Each host sets a price per minute within the platform limits. The price is shown on the host's profile before the call starts.",
        "Calls are billed per second from your wallet balance, only while both of you are connected. Ringing time and time while the connection is down are not charged.",
        "You need enough balance for at least 1 minute to start a call. If your balance runs out, the call ends automatically.",
        "Calls that never connect are not charged. Reserving a time (booking) is free.",
        "Amounts are calculated by HUMI's servers and shown in your wallet history.",
      ],
    },
    {
      h: "5. Wallet and top-ups",
      list: [
        "Top-ups are processed by Mercado Pago, by Pix or card. HUMI does not store card details.",
        "Wallet balance can only be used to pay for calls on HUMI. It is not a bank account, earns no interest and cannot be transferred to others.",
        "You may withdraw from a top-up within 7 (seven) days of purchase and get the unused amount back, under article 49 of the Brazilian Consumer Protection Code. See the Cancellation and refund policy.",
        "If you close your account, any unused real balance will be refunded on request, free of charge.",
        "Bonuses and referrals: the first top-up bonus and referral credit, when offered, can only be used to pay for calls on HUMI. They can't be withdrawn or refunded as money and are removed if the top-up that triggered them is refunded. Amounts and conditions are shown on the site and may change, without affecting bonuses already granted.",
        "Referral credit is granted once per invited person, when they make their first top-up. Fake accounts, self-referrals or any fraud are not allowed: bonuses are cancelled and the account may be suspended.",
      ],
    },
    {
      h: "6. Hosts",
      list: [
        `Hosts are independent. There is no employment, partnership or agency relationship between hosts and ${LEGAL.brand}.`,
        `${LEGAL.brand} keeps a service fee on each minute charged. The net amount a host receives per minute is shown in the host dashboard before the host confirms the price.`,
        "Earnings from each call stay on hold for the period shown in the dashboard (to cover refunds and disputes) and then become available for withdrawal by Pix, to a key held by the host.",
        "Hosts are responsible for providing true information, for the Pix key they register and for any taxes on their earnings.",
        "Earnings obtained through fraud, in breach of these Terms or subject to a refund may be withheld or reversed.",
      ],
    },
    {
      h: "7. Prohibited conduct",
      list: [
        "Harassment, threats, hate speech, discrimination or any form of violence.",
        "Sexual content or requests, nudity or exploitation of any kind.",
        "Any interaction with, or involving, minors.",
        "Asking for or sharing personal contact details, or arranging payments outside HUMI.",
        "Scams, spam, fraud, fake identities or someone else's payment methods.",
        "Recording, photographing or sharing a call without the express consent of everyone in it.",
        "Trying to get around billing, security systems or the platform's normal operation.",
      ],
    },
    {
      h: "8. Privacy in calls",
      p: [`${LEGAL.brand} does not record call audio or video, and in-call chat messages are not stored on our servers. We only keep the data needed for billing and safety (such as times, duration and amounts), as described in the Privacy Policy.`],
    },
    {
      h: "9. Reports, suspension and termination",
      list: [
        "Anyone can report a user from their profile, during or after a call. Reports are confidential.",
        `If these Terms are breached or safety is at risk, ${LEGAL.brand} may warn users, hide profiles, or suspend or close accounts, in proportion to the seriousness of the case.`,
        "You can close your account at any time by e-mailing us.",
      ],
    },
    {
      h: "10. Reviews",
      p: ["Only people who took part in a completed call can review it. Reviews must be honest and respectful and may be removed if they break these Terms."],
    },
    {
      h: "11. Intellectual property",
      p: [`The ${LEGAL.brand} brand, name, logo, design and software belong to ${LEGAL.brand}. By posting photos and texts on your profile you confirm you own the rights to them and allow ${LEGAL.brand} to display them on the platform.`],
    },
    {
      h: "12. Responsibilities",
      p: [
        `${LEGAL.brand} works to keep the platform available and safe, but the service may have interruptions, maintenance or third-party failures (such as internet or providers). Time not connected is never charged.`,
        "Each user is responsible for what they say and do in calls. Nothing in these Terms limits your rights under consumer protection law.",
      ],
    },
    {
      h: "13. Changes to these Terms",
      p: ["We may update these Terms. Relevant changes will be announced in advance on the site or by e-mail. Using the platform after the changes take effect means you accept them."],
    },
    {
      h: "14. Governing law and jurisdiction",
      p: ["These Terms are governed by the laws of Brazil. Disputes may be brought in the courts of the consumer's place of residence."],
    },
    {
      h: "15. Contact",
      p: [`Questions, requests and complaints: ${LEGAL.supportEmail}.`],
    },
  ],
});

export default async function TermsPage() {
  const c = (await getLocale()) === "pt" ? pt() : en();
  return (
    <InfoPage eyebrow={c.eyebrow} title={c.title} intro={c.intro} updated={LEGAL.updatedAt}>
      <LegalSections sections={c.sections} />
    </InfoPage>
  );
}
