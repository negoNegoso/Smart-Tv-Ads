# Design — Login simples para proteger o painel admin

Data: 2026-08-28

## Problema

Hoje a API (`/api/*`) é totalmente aberta e a SPA inteira é o painel
administrativo. Qualquer pessoa com a URL lê e altera dados, tanto pela
interface quanto chamando a API direto (ex.: `curl .../api/announcements`).

Queremos um login simples: **apenas o admin entra**. A proteção precisa ser
real — a própria API valida o login, não só a interface. As telas de TV e os
QR codes continuam públicos, senão os dispositivos param de funcionar.

## Objetivo e não-objetivos

**Objetivo:** um único admin autentica com usuário + senha; endpoints de
leitura/escrita administrativos passam a exigir sessão válida; TVs e QR seguem
públicos.

**Não-objetivos (YAGNI):** múltiplos usuários, tabela de usuários, cadastro,
recuperação de senha, rate limiting/anti-brute-force, 2FA, papéis/permissões.

## Credenciais e variáveis de ambiente

Configuradas na Vercel (production **e** preview) e no ambiente local:

| Variável | Uso |
| --- | --- |
| `ADMIN_USERNAME` | usuário do único admin |
| `ADMIN_PASSWORD` | senha do único admin |
| `SESSION_SECRET` | já existe; passa a **ser usado** para assinar o cookie de sessão |

`assertRequiredEnv()` passa a exigir também `ADMIN_USERNAME`, `ADMIN_PASSWORD`
e `SESSION_SECRET` no boot (hoje só exige `SCAN_SALT`). Sem elas, a API não sobe.

## Mecanismo de sessão (cookie assinado stateless)

A API roda serverless (sem estado entre invocações), então **não** há store de
sessão. A sessão é um cookie HttpOnly assinado por HMAC, verificável sem
armazenamento no servidor.

- **Cookie:** nome `sid`, atributos `HttpOnly`, `SameSite=Lax`, `Path=/`,
  `Secure` quando em produção/Vercel (`process.env.VERCEL`), `Max-Age` de 7 dias.
- **Formato do token:** `<expEpochMs>.<hmacBase64url>`, onde
  `hmac = HMAC_SHA256(SESSION_SECRET, expEpochMs)`.
- O token **não** carrega dados sensíveis — apenas o timestamp de expiração e a
  assinatura.

### `lib/auth/session.ts` (funções puras, testáveis sem HTTP)

- `createSession(now = Date.now()): string` — gera o token com
  `exp = now + 7 dias`.
- `verifySession(token: string, now = Date.now()): boolean` — separa
  `exp` e `hmac`, recomputa o HMAC e compara com `crypto.timingSafeEqual`, e
  confirma `exp > now`. Retorna válido/inválido. Qualquer formato inesperado é
  inválido (nunca lança para o chamador).

### `lib/auth/middleware.ts`

- `requireAdmin(req, res, next)` — lê o cookie `sid`; se `verifySession` falhar
  ou o cookie não existir, responde `401 {error:"Não autenticado."}`. Caso
  contrário, `next()`.

## Endpoints de autenticação (`routes/auth.ts`, públicos)

- `POST /api/auth/login` — body `{username, password}`. Compara com
  `ADMIN_USERNAME`/`ADMIN_PASSWORD` usando `crypto.timingSafeEqual` (com
  normalização de tamanho para não vazar comprimento). Sucesso → seta cookie
  `sid` e responde `200 {ok:true}`. Falha → `401
  {error:"Usuário ou senha inválidos."}`. O corpo do login nunca é logado.
- `POST /api/auth/logout` — limpa o cookie `sid` (`Max-Age=0`), responde
  `200 {ok:true}`.
- `GET /api/auth/me` — cookie válido → `200 {authenticated:true}`; senão
  `401 {authenticated:false}`.

## Fronteira público × protegido

**Público (sem login):**

- Arquivos estáticos da SPA: `index.html`, `tv.html`, assets (servidos fora da
  função na Vercel).
- `GET /api/healthz`
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/display/:deviceKey/slides` (a TV busca a playlist)
- `POST /api/telemetry/play` (a TV registra exibições)
- `GET /api/qr/:file` (imagem do QR usada pela `tv.html`)
- `GET /r/:code` (redirecionamento do QR + registro do scan; montado em `/r`,
  fora do router `/api`)

**Protegido (exige login admin):** todo o resto sob `/api` — anúncios
(`announcements`), clientes (`clients`), dispositivos (`devices`), anunciantes
e campanhas (`advertisers`), analytics (`analytics`) e uploads/armazenamento
(`storage`). Inclui **leitura** (GET) desses recursos, não só escrita.

### Montagem em `routes/index.ts`

```
router.use(healthRouter, authRouter, displayRouter, telemetryRouter, qrRouter);  // públicos
router.use(requireAdmin);                                                        // porteiro
router.use(announcementsRouter, clientsRouter, devicesRouter,
           advertisersRouter, analyticsRouter, storageRouter);                   // protegidos
```

A separação já é limpa hoje: cada router público expõe apenas um endpoint
público (`display` = GET slides, `telemetry` = POST play, `qr` = GET file,
`health` = GET healthz), então nenhum endpoint de TV cai atrás do porteiro.

## Frontend

- **`pages/login.tsx`** — formulário usuário + senha. No submit chama
  `POST /api/auth/login`. Sucesso → invalida a query de auth e o app entra; erro
  → exibe "Usuário ou senha inválidos.".
- **`AuthGate` no `App.tsx`** — usa `useQuery(['auth'])` batendo em
  `GET /api/auth/me`. Enquanto carrega: spinner. `401` → renderiza `<Login>`.
  Autenticado → renderiza o `Router` normal. A rota pública de TV
  (`/display/:deviceKey`) fica **fora** do gate (a TV nunca vê login).
- **Tratamento global de 401** — como os `fetch` estão espalhados pelas páginas,
  um wrapper/efeito leve detecta respostas `401` de chamadas protegidas
  (sessão expirada) e invalida a query de auth, levando de volta ao login.
- **Logout** — botão no `Layout` (cabeçalho/sidebar) → `POST /api/auth/logout`
  → volta ao login.

Como SPA e API são same-origin, o cookie é enviado automaticamente pelos
`fetch` existentes sem alterar cada chamada.

## Segurança

- Cookie `HttpOnly` + `SameSite=Lax` + `Secure` (produção) + `Path=/`.
- Comparações com `crypto.timingSafeEqual` para senha e HMAC (evita timing
  attacks); normalizar comprimento antes de comparar.
- Sem segredos no cookie e sem logar corpo de login nem o cookie.
- O bundle JS da SPA é estático e público (comportamento normal de SPA); a
  proteção real está na API — sem login, o painel não obtém dados.

## Testes (em português; supertest + vitest)

- `session.test.ts` — token válido verifica; adulterado falha; expirado falha;
  formato inválido falha sem lançar.
- `auth-routes.test.ts` — login correto seta cookie e responde 200; senha errada
  → 401; `/api/auth/me` sem cookie → 401, com cookie válido → 200; logout limpa
  o cookie.
- `middleware.test.ts` — rota protegida sem cookie → 401; com cookie válido →
  segue.
- Um teste garantindo que um endpoint público (ex.:
  `GET /api/display/:key/slides`) **não** exige login mesmo com o porteiro
  montado.

## Dependências

- `cookie-parser` (leve, amplamente usado) para ler o cookie `sid`.
  Instalar via pnpm respeitando `minimumReleaseAge`.
- Assinatura/verificação HMAC usam o `node:crypto` nativo (sem lib de JWT).

## Documentação

- Atualizar a seção "Variáveis de ambiente" e "Deploy na Vercel" do `README.md`
  com `ADMIN_USERNAME`, `ADMIN_PASSWORD` e o novo uso de `SESSION_SECRET`.

## Impacto no deploy Replit

Nenhuma mudança estrutural: as mesmas variáveis de ambiente devem ser definidas
no Replit. O `Secure` no cookie é condicionado a produção/Vercel, então o
desenvolvimento local por HTTP continua funcionando.
