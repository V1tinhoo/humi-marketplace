# Pagamentos por minuto, carteira e chamadas — guia

## Como funciona

1. O cliente adiciona saldo na **carteira** (`/wallet`). O saldo só aumenta quando o **provedor de pagamento confirma por webhook**.
2. No perfil do host, ele vê o **preço por minuto** (áudio e vídeo separados) e clica em **Call now** — ou entra na chamada de uma reserva confirmada.
3. O servidor (`start_call`) confere se o saldo cobre pelo menos 1 minuto e cria a sala no **LiveKit**.
4. A cada ~10 s, o navegador pede ao servidor um "tick". O servidor **pergunta ao LiveKit** se os dois estão na sala; o banco cobra **por segundo** usando o relógio dele (`call_tick`). O navegador nunca envia tempo nem valor.
5. Cada débito é dividido: **75% host / 25% HUMI** (configurável em `platform_settings.commission_bps`).
6. A chamada termina quando alguém desliga, quando a conexão cai por mais que o período de tolerância (45 s), ou quando o saldo acaba.

## Regras de cobrança (no banco)

| Regra | Onde |
| --- | --- |
| Valores sempre em centavos (inteiros) | todas as tabelas `*_cents` |
| Só cobra com os dois conectados (confirmado no LiveKit) | `call_tick` + `/api/calls/[id]/tick` |
| Nada cobrado ao chamar/tocar ou se não conectar (90 s) | `call_tick` → `failed_to_connect` |
| Por segundo: total = ⌊preço × segundos / 60⌋ | `call_tick` |
| Quedas: intervalos acima de 45 s não são cobrados | `call_grace_seconds` |
| Saldo nunca negativo (trava de linha + constraint) | `wallet_apply`, `wallets.balance_cents >= 0` |
| Sem cobrança duplicada (chave única por lançamento) | `idempotency_key` |
| Ledger imutável | gatilhos `forbid_mutation` |
| Uma chamada ativa por cliente e por host | índices únicos parciais |
| Webhook repetido não credita duas vezes; valor precisa bater | `confirm_topup` |

## Configurações (backend)

Tabela `platform_settings` (edite no SQL Editor):

| key | padrão | |
| --- | --- | --- |
| `commission_bps` | 2500 | 25% |
| `price_min_cents_per_minute` / `price_max_cents_per_minute` | 50 / 2000 | R$ 0,50 – R$ 20,00 por minuto |
| `topup_min_cents` / `topup_max_cents` | 1000 / 100000 | R$ 10 – R$ 1.000 |
| `call_min_start_seconds` | 60 | saldo mínimo para iniciar |
| `call_grace_seconds` | 45 | tolerância de queda |
| `call_ring_timeout_seconds` | 90 | tempo para conectar |
| `earnings_hold_days` | 7 | ganhos "pendentes" → "disponíveis" |

Exemplo: `update platform_settings set value = 2000 where key = 'commission_bps';` (20%).

## O que configurar

1. **Supabase → SQL Editor:** rode `supabase/migrations/20261115120000_wallet_and_calls.sql`.
2. **`.env.local`** (servidor; nunca no chat, nunca com `NEXT_PUBLIC_` exceto a URL):
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Project Settings → API
   - `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — LiveKit Cloud → Settings → Keys
3. **LiveKit webhook (produção):** LiveKit Cloud → Settings → Webhooks → `https://seu-dominio/api/livekit/webhook`.
   Em `localhost` não é necessário: os ticks consultam o LiveKit diretamente.
4. Reinicie `npm run dev`.

## Modo de teste (atual)

- Só existe o **provedor de teste**: a página `/wallet/test-checkout/[id]` aprova/recusa e envia um **webhook assinado** (HMAC, válido por 5 min) para `/api/payments/test/webhook`, que é o único lugar que credita.
- Recargas de teste ficam com `livemode = false` e aparecem como **"test"**. Não é dinheiro real.
- Fica ativo em desenvolvimento; em produção só com `PAYMENTS_TEST_MODE=true`.
- **Saques não existem**: só a estrutura (`payout_accounts`, `payout_records`).

## Para ativar dinheiro real (pendente)

Escolher e integrar um provedor que aceite **este modelo**: saldo pré-pago do cliente, consumo por minuto e repasse posterior aos hosts (marketplace com **split** e **subcontas**). Confirmar com o provedor, por escrito, antes de integrar:

- se pode **reter saldo** do cliente e debitar ao longo do tempo;
- como funciona o **split** 75/25 e o **repasse** (prazo, KYC dos hosts, Pix);
- **chargeback/estorno** de recargas parcialmente usadas;
- taxas por transação (devem ser registradas à parte).

Integração: nova rota `/api/payments/<provedor>/webhook` com a verificação de assinatura **do provedor**, chamando o mesmo `confirm_topup` (com `livemode = true`).

## Validação jurídica necessária (Brasil)

- **Regulação de pagamentos:** manter saldo de terceiros e repassar pode caracterizar **instituição de pagamento / arranjo de pagamento** (Lei 12.865/2013 e normas do Banco Central). Em geral se opera via provedor autorizado que assume esse papel.
- **CDC:** devolução de saldo não utilizado, informação clara de preço por minuto, direito de arrependimento.
- **Tributário:** emissão de nota fiscal, ISS sobre a comissão, como o host declara os ganhos (MEI, RPA, pessoa física).
- **PLD/KYC:** identificação de hosts e limites de recarga (Lei 9.613/1998).
- **LGPD:** dados financeiros e de chamadas; política de retenção.
- **Termos de Uso:** regras de cobrança, quedas, reembolsos e encerramento por falta de saldo.

## Testes

```bash
npm run db:test   # inclui supabase/tests/billing.test.mjs (57 verificações dos 15 cenários)
```
