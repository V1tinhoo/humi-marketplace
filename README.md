# HUMI — Pessoas reais. Conexões reais.

**HUMI** é uma plataforma brasileira para conversar por **vídeo ou áudio** com pessoas reais do mundo todo, pagando **por minuto**. Serve para bater papo, **praticar idiomas** (inglês, espanhol e outros), trocar experiências culturais e jogar com alguém. Não é app de namoro nem de terapia, e é só para maiores de 18 anos.

🌐 **Site:** [www.humi.chat](https://www.humi.chat)

Qualquer pessoa adulta pode virar **host**: cria um perfil, define o próprio preço por minuto e os horários, fica online quando quiser e recebe os ganhos por **Pix**.

---

## Como funciona

1. **Crie sua conta** — grátis, com e-mail ou Google.
2. **Coloque saldo** — Pix ou cartão (Mercado Pago). Sem mensalidade.
3. **Ligue e converse** — escolha alguém online e comece uma chamada de vídeo ou áudio.

A cobrança é **por segundo**, só enquanto os dois estão conectados. Chamada que não conecta não é cobrada.

## Principais recursos

**Para quem conversa**
- Explorar hosts por idioma, país, interesses, preço e avaliação, com "online agora" em tempo real.
- Chamadas de vídeo e áudio (LiveKit) com chat, compartilhamento de tela e avaliação no final.
- Carteira com Pix e cartão, bônus de primeira recarga e programa de indicação.
- **Pacotes de minutos** com um host (60, 120 ou 300 min com desconto), com renovação mensal opcional.
- Páginas para praticar idiomas (`/praticar`) e agendamento de horários.

**Para hosts**
- Painel com perfil (salvo automaticamente), disponibilidade semanal, preço por minuto, ganhos e saques por Pix.
- Comissão do HUMI de 20% — o host fica com 80% de cada minuto.
- Perfil só vai para o Explorar quando está completo (frase, descrição, categoria, horários e foto).

**Segurança**
- Só maiores de 18 anos; chamadas não são gravadas.
- Denunciar e **bloquear** em um toque, durante ou depois da chamada.
- Suspensão automática após denúncias de pessoas diferentes; limite de ligações recusadas.
- Regras da comunidade aceitas antes da primeira chamada.

**Administração**
- Painel admin com visão geral, saques, denúncias, usuários, chamadas, recargas, origem dos cadastros, configurações e registro de atividades.
- Controle de presença dos hosts (online/offline) e preview privado com hosts de demonstração para testes internos.

**Crescimento**
- Google Analytics e Meta Pixel (só com consentimento — LGPD), UTM de campanhas.
- SEO e leitura por IAs: sitemap, `robots.txt`, `llms.txt` e dados estruturados (schema.org).

## Tecnologias

| Camada | Ferramenta |
| --- | --- |
| Front-end | [Next.js 15](https://nextjs.org) (App Router), React, TypeScript, Tailwind CSS v4 |
| Banco, login e regras | [Supabase](https://supabase.com) (Postgres, Auth, RLS, funções SQL, Storage) |
| Chamadas | [LiveKit](https://livekit.io) |
| Pagamentos | [Mercado Pago](https://www.mercadopago.com.br) (Pix e cartão) |
| Hospedagem | [Vercel](https://vercel.com) (com Cron diário) |
| Testes do banco | PGlite (Postgres em memória) |

Toda regra de dinheiro (cobrança por segundo, divisão host/HUMI, saldo, saques, pacotes) roda **no banco de dados**, em funções SQL com RLS — o navegador nunca define valores.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha as variáveis abaixo
npm run dev                  # http://localhost:3000
```

Outros comandos:

```bash
npm run build     # build de produção
npm run lint      # lint
npm run db:test   # testa todas as migrações e regras do banco (PGlite)
```

### Variáveis de ambiente

| Variável | Para quê |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Projeto Supabase (chave pública) |
| `SUPABASE_SERVICE_ROLE_KEY` | Funções do servidor (chamadas, admin, cron). **Nunca no navegador.** |
| `NEXT_PUBLIC_SITE_URL` | Endereço do site (`http://localhost:3000` em desenvolvimento) |
| `NEXT_PUBLIC_LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Chamadas de vídeo e áudio |
| `MERCADOPAGO_ACCESS_TOKEN` / `MERCADOPAGO_WEBHOOK_SECRET` / `MERCADOPAGO_SANDBOX` | Pagamentos |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` / `NEXT_PUBLIC_META_PIXEL_ID` | Analytics e Pixel (opcionais) |
| `CRON_SECRET` | Protege a tarefa diária de pacotes (`/api/cron/packages`) |

> Nunca faça commit de `.env.local` ou de chaves secretas.

## Banco de dados

- As migrações ficam em `supabase/migrations/` e devem ser rodadas **em ordem** no Supabase (SQL Editor). Todas podem ser rodadas mais de uma vez.
- Para um projeto Supabase **novo**, `supabase/full_setup.sql` contém todas as migrações juntas.
- `supabase/tests/` tem os testes de cada migração (`npm run db:test`).
- `supabase/admin/criar-usuarios.sql` cria ou atualiza usuários a partir de uma lista editável.

## Estrutura

```
src/
  app/            Páginas e rotas de API (chamadas, pagamentos, admin, cron)
  components/     Interface (explorar, perfil, chamada, carteira, painel, admin…)
  lib/            Supabase, carteira, pagamentos, LiveKit, analytics, idiomas
  i18n/           Textos em português e inglês (idioma automático pelo país)
  data/           Categorias, países, páginas de SEO
supabase/
  migrations/     Esquema, RLS, funções e regras de negócio
  tests/          Testes do banco (PGlite)
  admin/          Scripts para o administrador
marketing/        Artes e textos de redes sociais e anúncios
```

## Licença

Projeto privado. © HUMI — todos os direitos reservados.
