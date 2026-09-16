# Empresas — cadastro unificado de clientes e anunciantes — Design

Data: 2026-09-15
Repositório: negoNegoso/Smart-Tv-Ads (SignageOS — Painel de Anúncios)

## Objetivo

Organizar no banco quem é quem no sistema:

- **Uma empresa, um cadastro.** A mesma loja pode ser dona de TV (cliente),
  anunciante, ou os dois, sem duplicar nome, contato e segmento.
- **Dados cadastrais completos:** endereço preenchido pelo CEP (com latitude e
  longitude para o mapa interativo futuro), status e observações internas.
- **Admins no banco:** vários logins com acesso total, em vez de só o admin do
  env.

## Estado atual (ponto de partida)

- `clients` (name, email, phone, segment_id) — donos das TVs.
- `advertisers` (name, email, phone, company, segment_id, client_id) — pagantes;
  `client_id` aponta para o cliente quando a mesma empresa tem TV e anuncia.
- `users` (email, password_hash, must_change_password, is_active) — sem nome,
  sem papel; papel deduzido de `user_clients` / `user_advertisers`.
- Admin único via `ADMIN_USERNAME` / `ADMIN_PASSWORD` (env).
- Empresa com TV que também anuncia é comum; hoje vira dois cadastros com dados
  repetidos.
- Migrations rodam no build da Vercel (`lib/db/migrate.mjs`), antes do código
  novo entrar no ar.

## Decisões (capturadas no brainstorming)

- Abordagem: **tabela `companies` + perfis `clients`/`advertisers` ligados a
  ela**. Os ids de `clients` e `advertisers` continuam sendo as FKs de
  `devices`, `campaigns`, `panels` e vínculos de usuário.
- Uma empresa pode ser só cliente, só anunciante ou os dois; **pelo menos um
  papel é obrigatório**.
- Dados cadastrais: endereço via CEP com lat/lng, status e observações. Sem
  CNPJ/CPF e sem múltiplos contatos.
- Equipe interna: **só admin** (sem operador, sem permissões granulares).
- **Recomeço dos dados:** a migração apaga clientes, anunciantes, TVs,
  exibições, playlists, painéis, campanhas, scans e logins de usuários.
  Sobrevivem só as peças (`announcements`) e os segmentos (`segments`).
- Menu do admin: item único **Empresas**, substituindo Clientes e Anunciantes.

## Arquitetura

### 1. Modelo de dados (Drizzle, em `lib/db/src/schema/`)

**`companies`** (nova, `companies.ts`)

| coluna | tipo | nota |
|---|---|---|
| `id` | serial PK | |
| `name` | text notNull | nome da empresa/loja |
| `email` | text | contato |
| `phone` | text | contato |
| `segment_id` | integer FK `segments.id`, onDelete set null | ramo; chave da regra de concorrência |
| `status` | text notNull default `'active'` | `active` \| `paused` \| `closed` |
| `notes` | text | observações internas, só admin |
| `cep` | text | 8 dígitos, sem máscara |
| `street` | text | logradouro |
| `number` | text | digitado pelo admin |
| `complement` | text | digitado pelo admin |
| `district` | text | bairro |
| `city` | text | |
| `state` | text | UF (2 letras) |
| `city_ibge` | text | código IBGE do município |
| `lat` | double precision | nulo se a API não retornar |
| `lng` | double precision | nulo se a API não retornar |
| `created_at` / `updated_at` | timestamptz | padrão do projeto (`$onUpdate`) |

Índices: `companies_status_idx` (`status`), `companies_segment_idx`
(`segment_id`). Exporta `COMPANY_STATUSES`, `insertCompanySchema` e tipos, como
`panels.ts` faz com `PANEL_STATUSES`.

**`clients`** passa a ser só o perfil de dono de TV:
- `id` serial PK
- `company_id` integer notNull **unique** FK `companies.id` onDelete cascade
- `created_at` / `updated_at`
- Removidas: `name`, `email`, `phone`, `segment_id`.

**`advertisers`** passa a ser só o perfil de anunciante:
- `id` serial PK
- `company_id` integer notNull **unique** FK `companies.id` onDelete cascade
- `company` text — nome comercial exibido nas campanhas (opcional)
- `created_at` / `updated_at`
- Removidas: `name`, `email`, `phone`, `segment_id`, `client_id`.

O `UNIQUE(company_id)` em cada perfil garante no máximo um perfil de cliente e
um de anunciante por empresa: duplicação deixa de ser possível.

**`users`** ganha:
- `name` text (nome da pessoa)
- `is_admin` boolean notNull default `false`

`user_clients`, `user_advertisers`, `devices`, `campaigns`, `panels` e demais
tabelas não mudam de estrutura.

**Status** fica na empresa e é só organizacional nesta entrega: `paused` ou
`closed` não tira campanhas nem TVs do ar.

### 2. Migração (uma fase, com recomeço)

Gerada com `pnpm --filter @workspace/db run generate` e completada à mão com o
`TRUNCATE`. Ordem no SQL:

1. `TRUNCATE` com `RESTART IDENTITY CASCADE` em: `scans`, `plays`,
   `campaign_announcements`, `campaign_devices`, `campaign_segments`,
   `campaigns`, `device_playlist`, `panel_slides`, `panel_items`, `panels`,
   `devices`, `user_clients`, `user_advertisers`, `users`, `advertisers`,
   `clients`.
   **Não** tocar `announcements` nem `segments`. Como `CASCADE` no `TRUNCATE`
   se propaga por qualquer FK que aponte para as tabelas listadas, a migração
   verifica antes que nenhuma FK de `announcements`/`segments` aponte para elas
   (hoje nenhuma aponta).
2. Peças geradas por painel (`announcements.source = 'panel'`) ficam órfãs com
   o fim dos painéis; a migração as remove (`DELETE ... WHERE source = 'panel'`),
   porque sem painel elas não têm como ser editadas nem republicadas. Peças
   `source = 'admin'` ficam.
3. `CREATE TABLE companies` + índices.
4. `ALTER TABLE clients` / `advertisers`: remove colunas antigas, adiciona
   `company_id NOT NULL` + `UNIQUE` + FK (tabelas já vazias, sem backfill).
5. `ALTER TABLE users` adiciona `name` e `is_admin`.

Sem escrita dupla: com as tabelas vazias não há dado para converter. Durante o
deploy (1–2 min) o servidor antigo pode falhar ao gravar cadastro; o admin não
cadastra nada nesse intervalo.

Arquivos de upload das peças de painel removidas ficam no storage (limpeza fora
de escopo).

### 3. Consulta de CEP (`artifacts/api-server/src/lib/cep.ts`)

`lookupCep(cep: string): Promise<CepResult>` — aceita com ou sem máscara,
normaliza para 8 dígitos.

1. `GET https://cep.awesomeapi.com.br/json/{cep}` com timeout de 5s.
   Mapeia `address` → `street`, `district`, `city`, `state`, `city_ibge` →
   `cityIbge`, `lat`/`lng` (string → number).
2. Se a primeira falhar (rede, timeout, 5xx), tenta
   `GET https://brasilapi.com.br/api/cep/v2/{cep}` com timeout de 5s.
   Mapeia `street`, `neighborhood` → `district`, `city`, `state`,
   `ibge.city` → `cityIbge`, `location.coordinates.latitude/longitude`
   (vazio → `null`).
3. Resultado: `{ cep, street, district, city, state, cityIbge, lat, lng }`,
   com `lat`/`lng` podendo ser `null`.
4. Erros tipados: `CepInvalidError` (≠ 8 dígitos), `CepNotFoundError` (404 nas
   duas ou 404 na primeira), `CepUnavailableError` (as duas indisponíveis).

A coordenada é o centro do CEP, não o número exato; suficiente para o mapa por
bairro.

### 4. API (`artifacts/api-server/src/routes/`)

Todas atrás de `requireAdmin`. `companies` e `cep` entram no
`lib/api-spec/openapi.yaml` e o cliente é regenerado com Orval.

**`routes/cep.ts`**
- `GET /cep/:cep` → `200 CepResult` | `400` | `404` | `502`.

**`routes/companies.ts`** (lógica de banco em `lib/companies/store.ts`)
- `GET /companies?status=&role=client|advertiser&q=` — lista; cada item traz
  dados da empresa + `clientId` e `advertiserId` (ou `null`).
- `POST /companies` — corpo: campos da empresa + `isClient`, `isAdvertiser`,
  `advertiserCompany?`. Cria empresa e perfis numa transação. `400` sem papel.
- `GET /companies/:id` — empresa + `clientId`, `advertiserId`,
  `advertiserCompany`, contagem de TVs e campanhas.
- `PATCH /companies/:id` — edita campos; `isClient`/`isAdvertiser` ligam ou
  desligam papel:
  - ligar → cria o perfil;
  - desligar sem dependência → remove o perfil;
  - desligar cliente com TVs ou painéis, ou anunciante com campanhas → `409`
    `{ error, devices, panels, campaigns }`;
  - resultado sem nenhum papel → `400`.
- `DELETE /companies/:id` — `409` se houver TVs, painéis ou campanhas; senão
  remove (cascata limpa perfis e vínculos de usuário).

**`routes/clients.ts` e `routes/advertisers.ts`**
- `GET` de lista, detalhe e stats continuam; respostas fazem join com
  `companies` e mantêm `name`, `email`, `phone`, `segmentId` no formato atual,
  mais `companyId`.
- `POST /clients`, `POST /advertisers` e a edição de dados cadastrais em
  `PATCH` são removidos (passam por `/companies`). Rotas de campanhas não mudam.

**Regras de exibição (`lib/device-feed.ts`, `lib/ad-eligibility.ts`)**
- Segmento do dono da TV e do anunciante vem de `companies.segment_id`.
- Exceção "mesma loja": `advertiserCompanyId === deviceCompanyId` (substitui
  `advertiserClientId === deviceClientId`).

**Usuários (`routes/users.ts`, `lib/auth/user-store.ts`, `lib/auth/middleware.ts`)**
- `POST`/`PATCH /users` aceitam `name` e `isAdmin`; `GET` retorna os dois.
- `loadSession`: usuário com `is_admin = true` recebe `req.auth.isAdmin = true`
  e passa em `requireAdmin`; `mustChangePassword` continua valendo.
- Desativar, remover admin ou apagar o **último admin ativo do banco** → `409`.
- Admin do env continua funcionando como acesso de reserva.
- `GET /auth/me` inclui `name`.

**Portais** (`lib/portal/*`): nomes de loja/anunciante vêm da empresa; escopo
por `clientIds`/`advertiserIds` não muda.

### 5. Frontend (`artifacts/signage/src/`)

**Menu (`components/layout.tsx`)**: remove "Clientes" e "Anunciantes"; adiciona
"Empresas" (`/companies`, ícone `Building2`). `/clients/:id` e
`/advertisers/:id` redirecionam para `/companies/:companyId`.

**`pages/companies.tsx`** — lista em cards (padrão de `clients.tsx`): nome,
cidade/UF, badges **Cliente**/**Anunciante**, badge de status. Filtros por
papel, status e busca por nome. Botão "Nova empresa".

**`components/company-form-dialog.tsx`** — criar e editar, com `Form` +
`zod` como os formulários atuais:
- nome, email, telefone, segmento;
- checkboxes **Cliente** e **Anunciante** (mínimo um); anunciante mostra
  "Nome comercial";
- CEP: com 8 dígitos chama `GET /cep/:cep` e preenche rua, bairro, cidade, UF,
  IBGE e lat/lng; número e complemento manuais. Em `404`/`502` mostra aviso e
  deixa os campos editáveis, com lat/lng vazios. Trocar o CEP refaz a consulta;
- status (select) e observações (textarea);
- `409` ao desligar papel mostra a mensagem com as contagens.

**`pages/company-detail.tsx`** — cabeçalho (nome, badges, status, endereço,
observações, botão editar) e abas conforme os papéis:
- **TVs** — conteúdo atual de `client-detail.tsx` extraído para
  `components/client-devices-section.tsx` (lista, cadastro de TV, prévias).
- **Campanhas** — conteúdo atual de `advertiser-detail.tsx` extraído para
  `components/advertiser-campaigns-section.tsx`.
- **Contas de acesso** — logins vinculados à empresa, só leitura, link para
  `/users-admin`.

`pages/clients.tsx`, `client-detail.tsx`, `advertisers.tsx` e
`advertiser-detail.tsx` são removidas depois da extração.

**`pages/users.tsx`**: campo nome, checkbox "Administrador"; seletores de
vínculo mostram o nome da empresa.

## Tratamento de erros

| Caso | Resposta |
|---|---|
| Empresa sem nenhum papel | `400` "Marque cliente e/ou anunciante" |
| Desligar papel com TVs, painéis ou campanhas | `409` com contagens |
| Apagar empresa com TVs, painéis ou campanhas | `409` com contagens |
| Segundo perfil do mesmo papel (corrida) | violação de `UNIQUE(company_id)` → `409` |
| Empresa inexistente | `404` |
| CEP com formato inválido | `400` |
| CEP inexistente | `404`; formulário libera preenchimento manual |
| AwesomeAPI e BrasilAPI indisponíveis | `502`; formulário libera manual, lat/lng nulos |
| Desativar/rebaixar/apagar último admin ativo | `409` |

## Testes (Vitest, mockados — padrão atual, sem banco e sem rede)

- `lib/__tests__/cep.test.ts`: normaliza AwesomeAPI; aceita CEP com máscara;
  cai para BrasilAPI em erro/timeout; BrasilAPI sem coordenadas → `lat/lng`
  nulos; `CepInvalidError`, `CepNotFoundError`, `CepUnavailableError`.
- `routes/__tests__/cep.test.ts`: mapeamento de erros para `400/404/502`.
- `routes/__tests__/companies.test.ts`: cria com um e com dois papéis; sem
  papel → `400`; ligar papel cria perfil; desligar com dependência → `409`;
  delete com dependência → `409`; `404`.
- `lib/__tests__/ad-eligibility.test.ts`: exceção por mesma empresa e segmento
  vindo da empresa.
- `lib/auth/__tests__/user-middleware.test.ts` e
  `routes/__tests__/auth.test.ts`: usuário `is_admin` passa em
  `requireAdmin`; bloqueio do último admin.
- Atualizar testes que usam `clientId`/`segmentId` de anunciante ou cliente:
  `portal-scope`, `portal-overview`, `portal-device-preview`,
  `device-preview`, `display-slides`, `reset-telemetry`, `panels-scope`,
  `panels/ownership`, `panels/publish`, `panels/publish-plan`.
- Frontend (`pages/__tests__/`): formulário preenche endereço após CEP;
  aviso e campos livres em falha; badges por papel na lista.

Rodar: `pnpm --filter @workspace/api-server run test`,
`pnpm --filter @workspace/signage run test` e `pnpm run typecheck`.

## Validação da migração (manual, antes do deploy)

1. Criar branch do Neon a partir da produção (serve de backup).
2. Rodar `migrate.mjs` com `MIGRATE_DATABASE_URL` apontando para o branch.
3. Conferir: `announcements` com `source = 'admin'` e `segments` intactos;
   tabelas de cadastro/operação vazias; schema igual ao Drizzle
   (`drizzle-kit check`).
4. Subir API e frontend apontando para o branch e fazer o fluxo: criar empresa
   com CEP → cadastrar TV → criar campanha para outra empresa → conferir a TV
   recebendo a peça; criar usuário admin e logar com ele.
5. Deploy em produção **somente com confirmação explícita** do dono do projeto.

## Fora de escopo (YAGNI)

- Mapa interativo (coordenadas já ficam gravadas para ele).
- Bloqueio automático de campanhas/TVs por status da empresa.
- CNPJ/CPF, razão social, múltiplos contatos por empresa.
- Papéis internos além de admin; permissões granulares.
- Geocodificação por número exato (ajuste de pino).
- Limpeza dos arquivos de upload das peças de painel removidas.
