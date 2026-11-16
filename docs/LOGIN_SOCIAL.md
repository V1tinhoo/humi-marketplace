# Login com Google e Apple — configuração

O código do HUMI já está pronto. Falta ligar os provedores no Google, na Apple e no Supabase.
Nenhum segredo (client secret, chave privada) vai para o código ou para o `.env.local` — eles ficam só no painel do Supabase.

Seu projeto Supabase: `gkestizhazmlksjlwkcp`
**URL de callback do Supabase** (usada no Google e na Apple):

```
https://gkestizhazmlksjlwkcp.supabase.co/auth/v1/callback
```

---

## 0. Antes de tudo (Supabase)

1. **SQL Editor** → rode `supabase/migrations/20261114150000_oauth_profiles.sql`
   (faz o perfil puxar nome e foto do Google/Apple; pode rodar mais de uma vez).
2. **Authentication → URL Configuration**
   - **Site URL:** `http://localhost:3000` (em produção, o seu domínio)
   - **Redirect URLs:** adicione `http://localhost:3000/**` e, em produção, `https://seu-dominio.com/**`
     (o `/**` é necessário porque o retorno inclui `?next=…`).

---

## 1. Google

### 1.1 Google Cloud Console
1. Acesse <https://console.cloud.google.com> e crie (ou escolha) um projeto, ex.: "HUMI".

### 1.2 Tela de consentimento OAuth
1. **APIs e serviços → Tela de permissão OAuth** (em contas novas: **Google Auth Platform → Branding**).
2. Tipo de usuário: **Externo**.
3. Preencha: nome do app **HUMI**, e-mail de suporte, logo (opcional), e-mail do desenvolvedor.
4. **Domínios autorizados:** adicione `supabase.co` (e o seu domínio quando tiver).
5. **Escopos:** `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (não precisa de mais nada).
6. Enquanto o app estiver em **Testing**, só os e-mails adicionados em **Usuários de teste** conseguem entrar.
   Para liberar para todos, clique em **Publicar app** (para esses escopos básicos não há revisão demorada).

### 1.3 Client ID e Client Secret
1. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**.
2. Tipo de aplicativo: **Aplicativo da Web**. Nome: "HUMI Web".
3. **Origens JavaScript autorizadas:** `http://localhost:3000` (e `https://seu-dominio.com`).
4. **URIs de redirecionamento autorizados:**
   `https://gkestizhazmlksjlwkcp.supabase.co/auth/v1/callback`
5. Clique em **Criar** e copie o **Client ID** e o **Client Secret**.

### 1.4 Supabase
1. **Authentication → Sign In / Providers → Google** → ative **Enable Sign in with Google**.
2. Cole o **Client ID** e o **Client Secret**. Salve.

---

## 2. Apple

> Precisa de uma conta paga no **Apple Developer Program** (US$ 99/ano).

### 2.1 Team ID
- <https://developer.apple.com/account> → **Membership details** → **Team ID** (10 caracteres). Anote.

### 2.2 App ID com "Sign in with Apple"
1. **Certificates, Identifiers & Profiles → Identifiers → +** → **App IDs** → **App**.
2. Descrição "HUMI", Bundle ID ex.: `com.humi.app`.
3. Em **Capabilities**, marque **Sign in with Apple**. Salve.

### 2.3 Services ID (é o "Client ID" da web)
1. **Identifiers → +** → **Services IDs**.
2. Descrição "HUMI Web", Identifier ex.: `com.humi.web` → este é o **Client ID** para o Supabase.
3. Abra o Services ID criado → marque **Sign in with Apple** → **Configure**:
   - **Primary App ID:** o App ID do passo 2.2
   - **Domains and Subdomains:** `gkestizhazmlksjlwkcp.supabase.co`
   - **Return URLs:** `https://gkestizhazmlksjlwkcp.supabase.co/auth/v1/callback`
4. Salve (Done → Continue → Save).

> A Apple não aceita `localhost` aqui — e nem precisa: o retorno vai para o Supabase, que depois devolve para o seu site.

### 2.4 Key ID e chave privada
1. **Keys → +** → nome "HUMI Sign in with Apple" → marque **Sign in with Apple** → **Configure** → escolha o App ID → Save.
2. **Register** → **Download** do arquivo `.p8` (só dá para baixar **uma vez** — guarde em local seguro, fora do projeto).
3. Anote o **Key ID** (10 caracteres).

### 2.5 Supabase
1. **Authentication → Sign In / Providers → Apple** → ative.
2. **Client IDs:** o Services ID (ex.: `com.humi.web`).
3. **Secret Key (for OAuth):** a Apple não usa uma senha fixa; é um token JWT gerado com **Team ID + Key ID + Services ID + arquivo .p8**.
   O painel do Supabase tem um gerador nessa tela (ou siga o link de documentação dele). Cole o token gerado e salve.
4. ⚠️ **Esse segredo expira a cada 6 meses.** Coloque um lembrete para gerar outro com a mesma chave `.p8`, senão o login com Apple para de funcionar.

**Detalhes da Apple:**
- O usuário pode escolher **"Ocultar meu e-mail"** — aí chega um e-mail `...@privaterelay.appleid.com`. Funciona normalmente.
- A Apple envia o **nome só no primeiro login** (às vezes nem isso). Se vier vazio, o HUMI usa o começo do e-mail e a pessoa pode editar em **Minha conta → Profile**.

---

## 3. Como o HUMI se comporta

| Situação | O que acontece |
| --- | --- |
| Pessoa nova entra com Google/Apple | Conta criada como **membro**, nome e foto vêm do provedor, vai para **Minha conta** (ou para onde estava indo) |
| Pessoa escolhe "I want to host" no cadastro e usa Google/Apple | Entra como membro e cai direto no **formulário de host** — o papel só muda quando ela envia o formulário |
| Quem já tem conta com o mesmo e-mail (confirmado) | O Supabase liga o Google/Apple à conta existente: **mesmo perfil, mesmo papel** (host continua host) |
| Já tem nome/foto editados | Não são sobrescritos; só preenche o que estiver vazio |
| Pessoa cancela no Google/Apple | Volta para o login com "Sign-in was cancelled" |
| Provedor ainda desligado no Supabase | Mensagem clara no botão, sem página de erro do Supabase |

---

## 4. Checklist de teste (depois de configurar)

1. **Cadastro com Google** (conta Google nova no HUMI) → aparece em **Minha conta** com nome e foto do Google.
2. **Sair** e **entrar de novo com Google** → mesma conta, nenhum perfil duplicado.
3. **Cadastro com Apple** (teste "Ocultar meu e-mail") → conta criada; ajuste o nome em Profile se vier vazio.
4. **Sair e entrar com Apple** → mesma conta.
5. **Conta existente** (criada com e-mail e senha, e-mail confirmado) → entrar com Google do mesmo e-mail → mesma conta, papel mantido.
6. **Host** entra com Google → vai para o **painel do host**.
7. **Cancelar** na tela do Google → volta ao login com a mensagem de cancelamento.
8. **No celular**: botões ocupam a largura toda e o retorno funciona.

No Supabase, em **Authentication → Users**, cada pessoa deve aparecer uma vez, com os provedores listados em "Providers".
