# Pareamento de TV por QR code — design

Data: 2026-09-18
Branch: `feat/pareamento-tv-qrcode`

## Objetivo

Instalar uma TV nova sem digitar a `deviceKey` de 16 caracteres com o controle
remoto. No modelo do Netflix/YouTube TV: a TV abre um link curto fixo, mostra
um QR code na tela, o admin lê com o celular, escolhe a empresa e dá nome à TV.
A TV percebe sozinha que foi vinculada e começa a exibir.

Hoje o admin cria o device no painel, copia a key e alguém digita
`/tv.html?key=XXXXXXXXXXXXXXXX` no navegador da TV. A TV não guarda a key: só
sabe quem é pela URL.

## Decisão central: a TV gera a própria key

A TV sem key gera uma `deviceKey` no mesmo formato do servidor
(`^[0-9A-F]{16}$`), guarda no `localStorage` e a usa desde já para consultar o
endpoint de slides que já existe. Enquanto o device não existe, a consulta
devolve 404 e a TV mostra a tela de pareamento. O admin, ao vincular, cria o
device com essa key.

Consequências:

- Sem tabela nova, sem coluna nova, sem migração.
- `devices.client_id` continua `NOT NULL`: nenhum join, lista ou métrica muda.
- Device apagado no painel faz a TV voltar sozinha à tela de pareamento com a
  mesma key, e o re-vínculo é ler o QR de novo.

Alternativas descartadas: tabela `device_pairings` com código curto e segredo
(mais peças para o mesmo resultado); coluna `pairing_code` em `devices` (coluna
morta depois do vínculo); device "pendente" com `client_id` nulo (quebra a
invariante usada em todo o sistema e deixa TVs órfãs no banco).

## Fluxo

1. Instalador abre `https://<domínio>/tv` no navegador da TV.
2. TV não tem key → gera, grava no `localStorage`, mostra QR + key.
3. TV consulta `GET /api/display/<KEY>/slides` a cada 5 s; recebe 404.
4. Admin lê o QR → abre `https://<domínio>/parear/<KEY>` → faz login se
   preciso → busca a empresa, digita nome e (opcional) local → "Vincular TV".
5. Próxima consulta da TV recebe 200 → sai do pareamento e começa a exibir,
   voltando ao refresh normal de 60 s.
6. Reiniciou a TV → abre `/tv`, acha a key no `localStorage`, exibe direto.

## TV (`artifacts/signage/public/tv.html`)

Continua ES5 para rodar em TV antiga.

**Link curto.** `/tv` serve `tv.html`: rota nova no Build Output da Vercel
(`scripts/build-vercel.mjs`) e equivalente no servidor de dev do Vite.

**Resolução da key**, nesta ordem:

1. `?key=` na URL — TVs já instaladas seguem iguais. Não é gravada no
   `localStorage`.
2. `localStorage['signage.deviceKey']`.
3. Nenhuma → gera 16 caracteres hex maiúsculos com `crypto.getRandomValues`,
   ou `Math.random` combinado com `Date.now()` quando `crypto` não existe;
   grava no `localStorage`.

Todo acesso ao `localStorage` fica em `try/catch`. Sem ele, a key vive só na
página aberta: o pareamento funciona, mas um reinício mostra um QR novo. Aceito.

**404 não é erro de rede.** Hoje `xhrGet` entrega um `Error` genérico para
qualquer falha. Passa a expor o status HTTP, e a TV trata:

- `404` → device não existe → tela de pareamento.
- Erro de rede / outros status → comportamento atual (segura a lista no ar;
  na primeira carga, tela vazia). Nunca abre o pareamento.

**Tela de pareamento:**

- QR grande: `<img src="/api/qr/pair/<KEY>.png">` — sem biblioteca de QR na TV.
- Texto "Leia o QR code com o celular do administrador".
- Key em blocos `A1B2-C3D4-E5F6-A7B8` e o link `<domínio>/parear/<KEY>` por
  extenso, como alternativa ao QR.

**Polling.** Em pareamento, consulta slides a cada 5 s. Ao receber 200, esconde
o pareamento, inicia a exibição e troca para o refresh de 60 s.

**Device apagado.** Um refresh que recebe 404 para a exibição, limpa a lista e
volta à tela de pareamento com a mesma key.

## Backend (`artifacts/api-server`)

**QR do pareamento (público).** `GET /api/qr/pair/:key.png` em `routes/qr.ts`.
Normaliza a key (maiúsculas, sem `-`), valida `^[0-9A-F]{16}$` — inválida dá
404. Gera o PNG de `${publicBaseUrl}/parear/<KEY>` com as mesmas opções do QR
de campanha e `Cache-Control` imutável. Não consulta o banco: o device ainda
não existe. Sem `PUBLIC_BASE_URL`, usa o host da requisição, como o QR atual.

**Criar device com a key da TV.** No OpenAPI (`lib/api-spec/openapi.yaml`),
`DeviceInput` ganha `deviceKey` opcional com `pattern: "^[0-9A-F]{16}$"`;
regenerar zod e client com orval. Em `POST /devices`:

- Veio `deviceKey` → usa. Não veio → gera como hoje (painel atual inalterado).
- Violação de unicidade (Postgres `23505`) → `409 { error: "Esta TV já está vinculada." }`.

`DeviceUpdate` não ganha `deviceKey`: a key é imutável depois de criada.

**Consultar a key (admin).** `GET /api/devices/by-key/:key` — normaliza,
valida formato (400 se inválida), devolve o device no mesmo formato de
`GET /devices/:id` (inclui `clientName`) ou 404. Entra no OpenAPI.

Ambas as rotas de device ficam atrás de `requireAdmin`; só o PNG é público.

**Busca de empresa.** Nada novo: `GET /companies?role=client&q=` já filtra
empresas com perfil de dono de TV e devolve `clientId`.

## Tela admin (`/parear/:key`, `artifacts/signage`)

Página nova `pages/parear.tsx`, rota dentro de `AdminRoutes` com o `Layout`
normal. O uso esperado é no celular: campos e botões grandes.

- Sem sessão → `/login?next=/parear/<KEY>` pelo fluxo existente; volta sozinho.
- Logado sem ser admin → mesmo tratamento de qualquer rota admin hoje.

**Ao abrir**, normaliza a key e:

- Formato inválido → "Código de TV inválido."
- `by-key` 200 → "Esta TV já está vinculada a **<empresa>** (<nome da TV>)"
  + botão "Ver TV" (`/devices/:id`).
- `by-key` 404 → formulário.

**Formulário:**

- Código da TV em blocos, para o admin conferir com a tela da TV.
- **Empresa**: campo de busca que consulta `/companies?role=client&q=`, lista
  os resultados, toque para escolher. Só empresas que já têm perfil de dono de
  TV aparecem; o vínculo não cria perfil. Sem resultados → "Nenhuma empresa com
  perfil de TV encontrada. Cadastre em Empresas." com link.
- **Nome** obrigatório. **Local** opcional.
- "Vincular TV" → `POST /devices` com `{ clientId, name, location, deviceKey }`.

**Sucesso:** "TV vinculada! Ela começa a exibir em alguns segundos." + botões
"Ver TV" (`/devices/:id`) e "Ver empresa" (`/companies/:companyId`). Parear
outra TV é ler o QR dela.

**409:** refaz a consulta `by-key` e mostra o estado "já vinculada".

## Segurança

- Vincular exige admin. Sem login admin ninguém liga uma TV a uma empresa.
- O PNG público só codifica uma URL montada a partir de key validada por regex.
  Não lê banco nem expõe dado.
- A key aparece na tela antes do vínculo. É a mesma exposição de hoje (a key
  está na URL da TV) e dá acesso apenas ao feed de slides, que é conteúdo
  público, e à telemetria. Risco aceito.
- Key gerada com `Math.random` em TV antiga é menos imprevisível. A unicidade
  continua garantida pelo banco; mesmo nível de risco aceito acima.

## Casos de borda

- Key digitada à mão com minúsculas ou traços → normalizada no servidor e na
  tela.
- Colisão de key (improvável) → 409, admin vê "já vinculada". Sem lógica extra.
- TV sem rede durante o pareamento → mantém o QR e segue tentando a cada 5 s.

## Testes

**API** (vitest, `routes/__tests__`):

- `POST /devices` com `deviceKey` válida usa a key; inválida → 400; duplicada
  → 409; sem key → gera como hoje.
- `GET /devices/by-key/:key` → 200 / 404 / 400; exige admin.
- `GET /qr/pair/:key.png` → PNG; key inválida → 404; minúscula com traço →
  normalizada.

**TV** (`src/__tests__/tv-html.test.ts`):

- Ordem de resolução: URL → `localStorage` → gerada e gravada.
- `localStorage` que lança exceção não quebra a TV.
- 404 na primeira carga mostra o pareamento; 200 sai dele.
- 404 em refresh volta ao pareamento.
- Erro de rede não abre o pareamento.

**Tela admin** (`pages/__tests__/parear.test.tsx`):

- `by-key` 404 → formulário; 200 → "já vinculada".
- Envio manda `deviceKey`, `clientId`, `name`, `location`.
- Nome vazio bloqueia envio.
- 409 troca para "já vinculada".

**Manual:** janela anônima como TV em `/tv`, celular lendo o QR, fim a fim;
reiniciar a "TV" e confirmar que exibe direto; apagar o device e confirmar que
volta ao QR.

## Fora do escopo

- Criar empresa ou perfil de dono de TV no fluxo de vínculo.
- Código curto digitável além da key completa.
- Desvincular/trocar a key de uma TV existente.
