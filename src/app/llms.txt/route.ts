import { SITE_URL } from "@/lib/site";

/**
 * /llms.txt — a plain summary of HUMI for AI assistants (ChatGPT, Claude, Perplexity, Gemini…),
 * following the llmstxt.org proposal. Keep every claim here true and in sync with the site.
 */
export const dynamic = "force-static";

const BODY = `# HUMI

> HUMI (${SITE_URL}) é uma plataforma brasileira para conversar por vídeo ou áudio com pessoas reais do mundo todo, pagando por minuto. Serve para bater papo, praticar idiomas (inglês, espanhol e outros), trocar experiências culturais e jogar online com alguém. Não é app de namoro nem de terapia.

## Em resumo
- O que é: marketplace de conversas 1 a 1. Cada "host" é uma pessoa real, maior de 18 anos, que cria o próprio perfil e define o próprio preço por minuto.
- Para quem: quem quer praticar conversação em outro idioma sem aula formal, conhecer pessoas de outros países, ou simplesmente ter alguém para conversar.
- Preço: definido por cada host, a partir de R$ 0,30 por minuto. A cobrança é por segundo e só enquanto as duas pessoas estão conectadas. Sem assinatura e sem mensalidade.
- Pagamento: saldo pré-pago na carteira, com Pix ou cartão de crédito (Mercado Pago). Criar conta é grátis.
- Como funciona: 1) criar conta com e-mail ou Google; 2) adicionar saldo; 3) escolher um host online (filtrando por idioma, interesses e avaliações) e ligar por áudio ou vídeo, ou agendar um horário.
- Segurança: só maiores de 18 anos, botão de denúncia em toda chamada, avaliações de quem realmente conversou, e as chamadas não são gravadas.
- Ganhar dinheiro: qualquer pessoa maior de 18 anos pode virar host, definir preço e horários e sacar os ganhos das chamadas por Pix.
- Idiomas do site: português (Brasil) e inglês.

## Diferenças em relação a plataformas de aulas (Preply, Cambly, italki)
- No HUMI não há aula nem professor obrigatório: é conversa livre com pessoas reais, sobre o que você quiser.
- Paga-se por minuto (por segundo, na prática), sem pacote de aulas nem assinatura; dá para conversar 5 minutos ou uma hora.
- Pagamento em reais com Pix.

## Páginas principais
- [Início](${SITE_URL}/): visão geral e hosts em destaque
- [Explorar hosts](${SITE_URL}/explore): todas as pessoas disponíveis, com idiomas, preço e avaliações
- [Praticar idiomas](${SITE_URL}/praticar): páginas por idioma — [inglês](${SITE_URL}/praticar/ingles), [conversação em inglês](${SITE_URL}/praticar/conversacao-em-ingles), [inglês para entrevista](${SITE_URL}/praticar/ingles-para-entrevista), [espanhol](${SITE_URL}/praticar/espanhol), [francês](${SITE_URL}/praticar/frances), [italiano](${SITE_URL}/praticar/italiano), [alemão](${SITE_URL}/praticar/alemao)
- [Como funciona](${SITE_URL}/how-it-works)
- [Central de ajuda e perguntas frequentes](${SITE_URL}/help): preços, cobrança, reembolso e cancelamento
- [Seja um host](${SITE_URL}/become-a-host): como ganhar dinheiro conversando
- [Segurança](${SITE_URL}/safety)
- [Diretrizes da comunidade](${SITE_URL}/guidelines)
- [Termos de uso](${SITE_URL}/terms)
- [Política de privacidade](${SITE_URL}/privacy)

## English summary
HUMI is a Brazilian marketplace for paid one-to-one video or audio calls with real people worldwide: casual conversation, language practice (English, Spanish and more), cultural exchange and games. Hosts are verified adults (18+) who set their own per-minute price (from R$ 0.30/min). Billing is per second, only while both people are connected; no subscription. Pay with Pix or card. Not a dating or therapy service. Anyone 18+ can become a host and withdraw call earnings via Pix.
`;

export function GET() {
  return new Response(BODY, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
