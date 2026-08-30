# Cadastro, login e portais segmentados — Design

Data: 2026-08-30
Repositório: negoNegoso/Smart-Tv-Ads (SignageOS — Painel de Anúncios)

## Objetivo

Organizar a estrutura de cadastro e login para permitir contas segmentadas de
**clientes** (donos das TVs) e **anunciantes** (pagantes), oferecendo a cada um
uma visão restrita e somente leitura para acompanhar suas campanhas/dispositivos.
O admin único atual continua no controle total da operação e passa a criar essas
contas.

## Estado atual (ponto de partida)

- Login único de admin via `ADMIN_USERNAME`/`ADMIN_PASSWORD` (env).
- Sessão: cookie HttpOnly com token **stateless** `<exp>.<hmac>` assinado por
  `SESSION_SECRET` (HMAC-SHA256, validade 7 dias). O token **não carrega
  identidade** — só prova que o admin autenticou.
- Middleware `requireAdmin` protege todas as rotas de gestão em
  `routes/index.ts` (`/announcements`, `/clients`, `/devices`, `/analytics`,
  `/advertisers`). Rotas públicas (display, telemetry, qr, redirect) ficam antes.
- `clients` (id, name, email, phone) = donos/operadores das TVs — sem login.
- `advertisers` (id, name, email, phone, company) = pagantes — sem login.
- `campaigns` ligam peças de mídia a um único anunciante, período, valor
  contratado e TVs de destino.
- Frontend (wouter): `AuthGate` mostra `Login` se não autenticado, senão
  `AdminRoutes`. Rota pública `/display/:deviceKey`.

## Decisões (capturadas no brainstorming)

- Quem loga: **anunciantes e clientes**. Um mesmo usuário pode ser um, o outro,
  ou ambos.
- Criação de conta: **somente o admin cria/convida**.
- Entrega de acesso: **senha temporária definida manualmente pelo admin** (sem
  serviço de e-mail). Troca de senha **obrigatória no primeiro login**.
- Visão do **anunciante**: lista de campanhas, peças de mídia, exibições (plays),
  scans/visitantes únicos/taxa, e em quais TVs a campanha passa.
  **Não** vê o valor contratado (financeiro).
- Visão do **cliente**: seus dispositivos, o que está passando em cada TV, e
  exibições por dispositivo. Somente leitura.
- Abordagem escolhida: **tabela `users` separada do domínio + vínculos N:N**.
  Admin permanece como bootstrap por env (fora da tabela `users`).

## Arquitetura

### 1. Modelo de dados (Drizzle, em `lib/db/src/schema/`)

**`users`**
- `id` serial PK
- `email` text único, notNull (identificador de login)
- `passwordHash` text notNull (scrypt do `node:crypto`)
- `mustChangePassword` boolean notNull default `true`
- `isActive` boolean notNull default `true`
- `createdAt` / `updatedAt` (padrão do projeto, timezone + `$onUpdate`)

**`user_clients`** (N:N usuário ↔ cliente)
- `userId` → `users.id` (onDelete cascade)
- `clientId` → `clients.id` (onDelete cascade)
- PK composta (`userId`, `clientId`)

**`user_advertisers`** (N:N usuário ↔ anunciante)
- `userId` → `users.id` (onDelete cascade)
- `advertiserId` → `advertisers.id` (onDelete cascade)
- PK composta (`userId`, `advertiserId`)

Os papéis são **derivados dos vínculos**: linha em `user_clients` → é cliente;
linha em `user_advertisers` → é anunciante; pode ter ambos. As tabelas
`clients`/`advertisers` não mudam. Exporta `insert*Schema` e tipos como as demais
tabelas; registra em `lib/db/src/schema/index.ts`.

### 2. Autenticação e sessão

**Hash de senha:** `node:crypto` `scrypt` com salt aleatório por usuário.
Formato armazenado: `scrypt$<salt_b64>$<hash_b64>`. Verificação com
`timingSafeEqual`. Sem dependência nova.

**Sessão passa a carregar identidade.** Token ainda stateless, HttpOnly, HMAC:
- Payload `{ exp, sub }`, onde `sub` = `userId` (número) ou `"admin"`.
- Formato: `<base64url(json(payload))>.<hmac(base64url(json(payload)))>`.
- `createSession(secret, subject)` e `verifySession(token, secret)` retornam o
  `subject` (ou `null`). Validade de 7 dias mantida.

**Endpoints (`routes/auth.ts`):**
- `POST /auth/login` — aceita admin (env, comportamento atual) **ou** usuário da
  tabela (busca por email, verifica scrypt, checa `isActive`). Erros em tempo
  constante e sem distinguir usuário inexistente de senha errada. Resposta indica
  `mustChangePassword`.
- `POST /auth/change-password` — autenticado; valida senha atual, grava nova
  (scrypt) e zera `mustChangePassword`.
- `GET /auth/me` — retorna
  `{ authenticated, subject, isAdmin, roles, clientIds, advertiserIds, mustChangePassword }`.
- `POST /auth/logout` — inalterado.

Enquanto `mustChangePassword` for `true`, o backend bloqueia os endpoints de
portal (só `/auth/*` respondem) e o frontend força a tela de troca.

### 3. Autorização e escopo por tenant

Middleware em camadas (`lib/auth/middleware.ts`):
- `loadSession` — lê o cookie, resolve `subject`. Usuário → carrega
  `{ userId, isActive, mustChangePassword, clientIds[], advertiserIds[] }` em
  `req.auth`; `"admin"` → `req.auth = { isAdmin: true }`.
- `requireAdmin` — exige admin (protege as rotas de gestão atuais, sem mudança).
- `requireUser` — exige sessão válida (admin ou usuário).
- `requireAdvertiser` / `requireClient` — exige o vínculo correspondente; admin
  passa em tudo.

**Regra central de escopo:** nos portais, o filtro vem sempre de `req.auth`,
nunca de parâmetro enviado pelo cliente. Recurso fora do vínculo → **404** (não
403, para não vazar existência).

**Rotas de portal** (montadas após `loadSession`, somente leitura):
- `/portal/advertiser/*` — `requireAdvertiser`, filtrado por `advertiserIds`
  (campanhas, peças, plays, scans/únicos/taxa, TVs alvo; sem valor contratado).
- `/portal/client/*` — `requireClient`, filtrado por `clientIds` (dispositivos,
  o que passa, plays por dispositivo).

Rotas admin atuais permanecem atrás de `requireAdmin`, intactas.

### 4. Gestão de contas pelo admin

`routes/users.ts` (atrás de `requireAdmin`) + página `pages/users.tsx`:
- `GET /users` — lista contas (email, ativo, vínculos, `mustChangePassword`).
- `POST /users` — cria conta: email + senha temporária + seleção de clientes
  e/ou anunciantes. Grava `mustChangePassword=true`.
- `PATCH /users/:id` — ativar/desativar, editar vínculos.
- `POST /users/:id/reset-password` — nova senha temporária, `mustChangePassword=true`.
- `DELETE /users/:id` — remove (cascata limpa vínculos).

UI segue os componentes `ui/` já usados; formulário com multiselect de clientes e
anunciantes existentes.

### 5. Portais no frontend

Roteamento por papel no `App.tsx`: após login, `GET /auth/me` decide o destino.
- `mustChangePassword` → tela obrigatória de troca de senha.
- `isAdmin` → `AdminRoutes` (atual).
- anunciante → `/portal/advertiser`: lista de campanhas → detalhe (peças, plays,
  scans/únicos/taxa, TVs). Sem valor.
- cliente → `/portal/client`: dispositivos → o que passa + plays por dispositivo.
- usuário com ambos os papéis → seletor de visão no topo.

Páginas de portal reaproveitam componentes de métricas de `analytics` e
`campaign-detail` em modo leitura.

## Tratamento de erros

- Sem sessão válida → `401`.
- Recurso fora do vínculo do usuário → `404`.
- Senha inválida / usuário inexistente → resposta genérica em tempo constante.
- Conta com `isActive=false` → login negado.
- `mustChangePassword=true` → portais bloqueados até a troca.

## Testes (Vitest, junto aos testes de auth existentes)

- scrypt: hash e verificação (inclui rejeição de senha errada).
- Token: `createSession`/`verifySession` com `subject` admin e usuário.
- Escopo de tenant: anunciante não acessa campanha de outro anunciante → 404.
- Bloqueio por `mustChangePassword`.
- Login de conta desativada é negado.
- Fluxo admin: criação de usuário com vínculos; reset de senha.

Rodar: `pnpm --filter @workspace/api-server run test`.

## Migração de schema

Após alterar o schema, compilar a lib e aplicar:

```bash
cd lib/db && npx tsc --build && npx drizzle-kit push --config ./drizzle.config.ts
```

Nenhuma alteração destrutiva nas tabelas existentes; apenas três tabelas novas.

## Fora de escopo (YAGNI)

- Serviço de e-mail / reset self-service por link.
- RBAC genérico com tabelas de roles/permissions.
- Escrita/edição de dados pelos portais (são somente leitura).
- Multi-admin ou hierarquia de admins.
