import type { Metadata } from "next";
import { InfoPage, LegalSections, type LegalSection } from "@/components/layout/InfoPage";
import { getLocale } from "@/i18n/server";
import { LEGAL, legalEntity } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "pt" ? "Política de privacidade" : "Privacy Policy" };
}

const pt = (): { eyebrow: string; title: string; intro: string; sections: LegalSection[] } => ({
  eyebrow: "Legal",
  title: "Política de privacidade",
  intro: `Esta Política explica quais dados pessoais o ${LEGAL.brand} trata, para quê, com quem compartilha e quais são os seus direitos, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD) e o Marco Civil da Internet (Lei nº 12.965/2014).`,
  sections: [
    {
      h: "1. Quem é o controlador",
      p: [
        `O controlador dos dados é ${legalEntity()}. Para qualquer assunto de privacidade, inclusive para falar com o encarregado pelo tratamento de dados (DPO), escreva para ${LEGAL.privacyEmail}.`,
      ],
    },
    {
      h: "2. Dados que tratamos",
      list: [
        "Cadastro: nome, e-mail, senha (guardada de forma criptografada pelo provedor de autenticação) e tipo de conta. Se você entrar com o Google, recebemos nome, e-mail e foto da sua conta Google.",
        "Perfil: foto, país, estado, idiomas, interesses e textos que você escolher publicar. Para hosts, também preço, disponibilidade e fuso horário.",
        "Uso da plataforma: chamadas (participantes, horários, duração, valores), agendamentos, avaliações, denúncias e o histórico da carteira.",
        "Pagamentos: valor, forma de pagamento e identificadores da transação. Os dados do cartão e da conta bancária ficam com o Mercado Pago; o HUMI não os recebe. Para saques, a chave Pix informada pelo host.",
        "Dados técnicos: endereço IP, data e hora de acesso, país aproximado (a partir do IP), idioma do navegador e cookies essenciais.",
        "Origem do cadastro: de onde você chegou ao HUMI (por exemplo, o anúncio ou o link de indicação que você usou) e quem te convidou, se for o caso.",
        "Se você aceitar os cookies de análise e anúncios: dados de navegação e de conversão (como páginas visitadas, cadastro e recargas, sem dados de pagamento) enviados ao Google e à Meta.",
        "Não gravamos o áudio nem o vídeo das chamadas, e as mensagens do chat da chamada não são armazenadas nos nossos servidores.",
      ],
    },
    {
      h: "3. Para que usamos e com qual base legal",
      list: [
        "Criar e manter sua conta, realizar as chamadas, cobrar e repassar valores aos hosts — execução de contrato (art. 7º, V, da LGPD).",
        "Cumprir obrigações legais e regulatórias, como fiscais e de guarda de registros de acesso — cumprimento de obrigação legal (art. 7º, II).",
        "Prevenir fraudes, proteger a segurança dos usuários, analisar denúncias e melhorar a plataforma — legítimo interesse (art. 7º, IX), sempre respeitando seus direitos.",
        "Registrar a origem do cadastro e as indicações, para conceder bônus e entender quais canais funcionam — legítimo interesse (art. 7º, IX) e execução das regras de indicação.",
        "Medir e melhorar nossos anúncios com Google Analytics e Meta Pixel — somente com o seu consentimento (art. 7º, I), que pode ser retirado a qualquer momento.",
        "Exercer direitos em processos e reclamações — exercício regular de direitos (art. 7º, VI).",
        "Não usamos seus dados para publicidade de terceiros e não vendemos dados pessoais.",
      ],
    },
    {
      h: "4. Com quem compartilhamos",
      p: ["Compartilhamos apenas o necessário para o serviço funcionar, com fornecedores que tratam os dados em nosso nome:"],
      list: [
        "Supabase — banco de dados, autenticação e armazenamento de fotos.",
        "LiveKit — transmissão das chamadas de áudio e vídeo em tempo real (sem gravação).",
        "Mercado Pago — processamento das recargas por Pix e cartão.",
        "Vercel — hospedagem do site.",
        "Google — se você escolher entrar com a sua conta Google e, se você aceitar os cookies, Google Analytics (medição de uso).",
        "Meta (Facebook/Instagram) — somente se você aceitar os cookies: Meta Pixel, para medir os resultados dos nossos anúncios.",
        "Autoridades públicas, quando houver ordem judicial ou obrigação legal.",
        "Entre usuários, aparece apenas o que é público no perfil (como primeiro nome, foto, país e avaliações). Seu sobrenome, e-mail e telefone nunca são exibidos a outros usuários.",
      ],
    },
    {
      h: "5. Transferência internacional",
      p: ["Alguns desses fornecedores mantêm servidores fora do Brasil. Nesses casos, a transferência é feita para cumprir o contrato com você e com fornecedores que oferecem garantias adequadas de proteção de dados, conforme o art. 33 da LGPD."],
    },
    {
      id: "cookies",
      h: "6. Cookies",
      p: [
        "Cookies essenciais (sempre ativos): mantêm você conectado, lembram o idioma e o país aproximado, protegem o login e guardam a origem da sua visita e o código de indicação. Sem eles o site não funciona corretamente.",
        "Cookies de análise e anúncios (opcionais): Google Analytics e Meta Pixel, usados para medir visitas e os resultados das nossas campanhas. Só são carregados se você clicar em “Aceitar” no aviso de cookies. Você pode mudar sua escolha a qualquer momento pelo link “Configurações de cookies”, no rodapé.",
      ],
    },
    {
      h: "7. Por quanto tempo guardamos",
      list: [
        "Dados da conta e do perfil: enquanto a conta estiver ativa.",
        "Registros de acesso (IP, data e hora): 6 meses, como exige o art. 15 do Marco Civil da Internet.",
        "Registros de pagamentos, chamadas e saques: pelo prazo exigido pela legislação fiscal e de defesa do consumidor (em geral, 5 anos).",
        "Denúncias: pelo tempo necessário para a segurança da comunidade e a defesa de direitos.",
        "Depois desses prazos, os dados são excluídos ou anonimizados.",
      ],
    },
    {
      h: "8. Seus direitos",
      p: [`Você pode, a qualquer momento e gratuitamente, pedir pelo e-mail ${LEGAL.privacyEmail}:`],
      list: [
        "confirmação de que tratamos seus dados e acesso a eles;",
        "correção de dados incompletos, inexatos ou desatualizados;",
        "anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a LGPD;",
        "portabilidade dos dados;",
        "informação sobre com quem compartilhamos seus dados;",
        "eliminação dos dados e encerramento da conta, ressalvadas as hipóteses de guarda obrigatória por lei.",
        "Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).",
      ],
    },
    {
      h: "9. Segurança",
      p: ["Adotamos medidas técnicas e administrativas para proteger seus dados, como conexão criptografada (HTTPS), controle de acesso por regras no banco de dados, senhas criptografadas e acesso restrito da equipe. Nenhum sistema é totalmente imune a incidentes; se ocorrer um incidente relevante, comunicaremos os afetados e a ANPD, conforme a lei."],
    },
    {
      h: "10. Menores de idade",
      p: ["O HUMI é proibido para menores de 18 anos. Se identificarmos uma conta de menor, ela será encerrada e os dados eliminados, salvo obrigação legal de guarda."],
    },
    {
      h: "11. Alterações desta Política",
      p: ["Podemos atualizar esta Política. A data da versão atual aparece no topo da página, e mudanças relevantes serão avisadas pelo site ou por e-mail."],
    },
  ],
});

const en = (): { eyebrow: string; title: string; intro: string; sections: LegalSection[] } => ({
  eyebrow: "Legal",
  title: "Privacy Policy",
  intro: `This Policy explains what personal data ${LEGAL.brand} processes, why, who we share it with and what your rights are, under Brazil's General Data Protection Law (LGPD, Law 13.709/2018), the Brazilian Internet Act (Law 12.965/2014) and, where applicable, similar laws.`,
  sections: [
    {
      h: "1. Who the controller is",
      p: [`The data controller is ${legalEntity()}. For any privacy matter, including contacting our data protection officer (DPO), write to ${LEGAL.privacyEmail}.`],
    },
    {
      h: "2. Data we process",
      list: [
        "Account: name, e-mail, password (stored encrypted by the authentication provider) and account type. If you sign in with Google, we receive your Google name, e-mail and photo.",
        "Profile: photo, country, state, languages, interests and any texts you choose to publish. For hosts, also price, availability and time zone.",
        "Platform use: calls (participants, times, duration, amounts), bookings, ratings, reports and wallet history.",
        "Payments: amount, payment method and transaction identifiers. Card and bank details stay with Mercado Pago; HUMI never receives them. For withdrawals, the Pix key given by the host.",
        "Technical data: IP address, access date and time, approximate country (from the IP), browser language and essential cookies.",
        "Sign-up source: where you came to HUMI from (for example the ad or referral link you used) and who invited you, if anyone.",
        "If you accept analytics and advertising cookies: browsing and conversion data (such as pages visited, sign-up and top-ups, without payment details) sent to Google and Meta.",
        "We do not record call audio or video, and in-call chat messages are not stored on our servers.",
      ],
    },
    {
      h: "3. Why we use it and the legal basis",
      list: [
        "Creating and running your account, the calls, billing and paying hosts — performance of a contract.",
        "Meeting legal and regulatory duties, such as tax rules and keeping access records — legal obligation.",
        "Preventing fraud, keeping users safe, handling reports and improving the platform — legitimate interest, always respecting your rights.",
        "Recording sign-up sources and referrals, to grant bonuses and understand which channels work — legitimate interest and the referral rules.",
        "Measuring and improving our ads with Google Analytics and Meta Pixel — only with your consent, which you can withdraw at any time.",
        "Exercising rights in claims and proceedings.",
        "We do not use your data for third-party advertising and we never sell personal data.",
      ],
    },
    {
      h: "4. Who we share it with",
      p: ["We only share what is needed to run the service, with providers that process data on our behalf:"],
      list: [
        "Supabase — database, authentication and photo storage.",
        "LiveKit — real-time transmission of audio and video calls (no recording).",
        "Mercado Pago — processing top-ups by Pix and card.",
        "Vercel — website hosting.",
        "Google — if you sign in with your Google account and, if you accept cookies, Google Analytics (usage measurement).",
        "Meta (Facebook/Instagram) — only if you accept cookies: Meta Pixel, to measure the results of our ads.",
        "Public authorities, when required by court order or law.",
        "Other users only see what is public on a profile (such as first name, photo, country and ratings). Your last name, e-mail and phone are never shown to other users.",
      ],
    },
    {
      h: "5. International transfers",
      p: ["Some of these providers have servers outside Brazil. Such transfers are made to perform our contract with you and with providers that offer adequate data protection safeguards, as allowed by article 33 of the LGPD."],
    },
    {
      id: "cookies",
      h: "6. Cookies",
      p: [
        "Essential cookies (always on): keep you signed in, remember your language and approximate country, protect sign-in and store where your visit came from and any referral code. The site doesn't work properly without them.",
        "Analytics and advertising cookies (optional): Google Analytics and Meta Pixel, used to measure visits and the results of our campaigns. They only load if you click “Accept” in the cookie notice. You can change your choice at any time from the “Cookie settings” link in the footer.",
      ],
    },
    {
      h: "7. How long we keep data",
      list: [
        "Account and profile data: while your account is active.",
        "Access records (IP, date and time): 6 months, as required by the Brazilian Internet Act.",
        "Payment, call and withdrawal records: for the period required by tax and consumer law (usually 5 years).",
        "Reports: as long as needed for community safety and the defence of rights.",
        "After these periods, data is deleted or anonymised.",
      ],
    },
    {
      h: "8. Your rights",
      p: [`At any time and free of charge, you can ask us at ${LEGAL.privacyEmail} for:`],
      list: [
        "confirmation that we process your data, and access to it;",
        "correction of incomplete, inaccurate or outdated data;",
        "anonymisation, blocking or deletion of unnecessary or unlawfully processed data;",
        "data portability;",
        "information about who we share your data with;",
        "deletion of your data and closure of your account, except where the law requires us to keep it.",
        "You can also complain to Brazil's National Data Protection Authority (ANPD) or your local data protection authority.",
      ],
    },
    {
      h: "9. Security",
      p: ["We use technical and organisational measures to protect your data, such as encrypted connections (HTTPS), database access rules, encrypted passwords and restricted staff access. No system is completely immune to incidents; if a relevant incident happens, we will notify those affected and the authorities as required by law."],
    },
    {
      h: "10. Minors",
      p: ["HUMI is not allowed for anyone under 18. If we identify a minor's account, it will be closed and the data deleted, unless the law requires us to keep it."],
    },
    {
      h: "11. Changes to this Policy",
      p: ["We may update this Policy. The date of the current version is shown at the top of the page, and relevant changes will be announced on the site or by e-mail."],
    },
  ],
});

export default async function PrivacyPage() {
  const c = (await getLocale()) === "pt" ? pt() : en();
  return (
    <InfoPage eyebrow={c.eyebrow} title={c.title} intro={c.intro} updated={LEGAL.updatedAt}>
      <LegalSections sections={c.sections} />
    </InfoPage>
  );
}
