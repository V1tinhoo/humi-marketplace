import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "pt" ? "Política de privacidade" : "Privacy Policy" };
}

const content = {
  en: {
    eyebrow: "Legal",
    title: "Privacy Policy",
    intro: "A placeholder summary of how HUMI intends to handle personal data.",
    blocks: [
      { h: "Beta preview", p: "HUMI is in beta. Your account, profile, wallet and call records are stored with our infrastructure providers (database, video calls and payments) to run the service." },
      { h: "What we collect", list: ["Account details: name, email, account type, country and language.", "Wallet, call and payment records (card and bank data are handled by our payment provider, not HUMI).", "Verification data for hosts, processed by a specialist provider (planned).", "Safety reports, ratings and reviews."] },
      { h: "What we won't do", list: ["Sell your personal data.", "Show your last name or contact details publicly.", "Record calls without notice and consent."] },
      { h: "Your rights", p: "You'll be able to access, export, correct, or delete your data, in line with the LGPD, GDPR and similar laws." },
    ],
  },
  pt: {
    eyebrow: "Legal",
    title: "Política de privacidade",
    intro: "Um resumo provisório de como o HUMI pretende tratar dados pessoais.",
    blocks: [
      { h: "Versão beta", p: "O HUMI está em beta. Sua conta, perfil, carteira e registros de chamadas ficam guardados com nossos provedores de infraestrutura (banco de dados, chamadas de vídeo e pagamentos) para o serviço funcionar." },
      { h: "O que coletamos", list: ["Dados da conta: nome, e-mail, tipo de conta, país e idioma.", "Registros da carteira, chamadas e pagamentos (dados de cartão e bancários ficam com nosso provedor de pagamentos, não com o HUMI).", "Dados de verificação dos hosts, processados por um provedor especializado (planejado).", "Denúncias, notas e avaliações."] },
      { h: "O que não fazemos", list: ["Vender seus dados pessoais.", "Mostrar seu sobrenome ou seus contatos publicamente.", "Gravar chamadas sem aviso e consentimento."] },
      { h: "Seus direitos", p: "Você poderá acessar, exportar, corrigir ou excluir seus dados, de acordo com a LGPD, o GDPR e leis semelhantes." },
    ],
  },
};

export default async function PrivacyPage() {
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
