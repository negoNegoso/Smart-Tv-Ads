# SignageOS — Painel de Anúncios

Sistema de sinalização digital para Smart TVs. O painel administra peças de mídia, clientes que operam TVs, dispositivos, playlists, anunciantes, campanhas e métricas de exibição (plays).

## Requisitos

- Node.js 20+ (o ambiente Replit usa Node.js 24)
- pnpm 10+
- PostgreSQL
- App Storage/Object Storage para persistir imagens em desenvolvimento publicado

## Instalação

```bash
pnpm install
```

O workspace é um monorepo pnpm. Não use `npm install` ou `yarn install`, pois o projeto exige pnpm e usa `pnpm-lock.yaml`.

## Variáveis de ambiente

Configure no ambiente do Replit ou em um `.env` local:

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão com o PostgreSQL |
| `SESSION_SECRET` | Assina o cookie de sessão do login (HMAC). Obrigatória: sem ela a API não sobe |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Bucket padrão do App Storage |
| `PRIVATE_OBJECT_DIR` | Diretório privado usado pelo App Storage |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Caminhos públicos de busca de objetos |
| `SCAN_SALT` | Sal do hash de identificação de scans do QR code. Sem ela configurada, scans não são registrados. O IP bruto nunca é gravado |
| `ADMIN_USERNAME` | Usuário do único admin do painel |
| `ADMIN_PASSWORD` | Senha do único admin do painel |
| `PUBLIC_BASE_URL` | Origem pública onde `/r/CODE` responde, usada para montar o link dentro do QR code (ex.: `https://meu-painel.replit.app`). Sem ela, a API usa o host da própria requisição |
| `YOUTUBE_API_KEY` | Opcional. Necessária apenas para resolver **playlists** do YouTube (YouTube Data API v3). Sem ela, vídeos únicos funcionam e playlists degradam para a thumbnail/fallback |

As variáveis do App Storage são criadas ao provisionar o Object Storage pelo Replit. Nunca versionar valores secretos no GitHub.

## Rodar em desenvolvimento

### Localmente com `dev.sh` (recomendado)

O script `dev.sh` na raiz automatiza todo o ambiente local: sobe um PostgreSQL
via Docker (credenciais derivadas do `DATABASE_URL`), aplica o schema com
`drizzle-kit push` e inicia a API e o frontend.

Pré-requisitos: **Docker** e **pnpm** instalados, e um `.env` com `DATABASE_URL`
(as variáveis do `.env` são carregadas automaticamente pelo script).

```bash
./dev.sh          # sobe banco + API + frontend
./dev.sh --db     # sobe apenas o banco e aplica o schema
./dev.sh --stop   # para o container do banco
```

Ao rodar `./dev.sh`, deixe o terminal aberto (os serviços ficam em primeiro
plano) e use `Ctrl+C` para encerrar a API e o frontend. O container do banco
continua rodando; use `./dev.sh --stop` para pará-lo.

O modo `--db` termina logo após aplicar o schema — isso é o comportamento
esperado, não um erro. As mensagens `PostgreSQL pronto`,
`[i] No changes detected` (schema já aplicado) e
`Banco pronto e schema aplicado. (--db) Encerrando.` indicam sucesso.

Portas e URLs:

- Painel: `http://localhost:21153/admin`
- Display TV: `http://localhost:21153/tv.html?key=DEVICE_KEY`
- Health da API: `http://localhost:8080/api/healthz`

Variáveis opcionais reconhecidas pelo script: `SIGNAGE_PORT` (porta do
frontend, padrão `21153`) e `BASE_PATH` (base do Vite, padrão `/`).

### Pelo Replit

Use o botão **Run**. Os workflows configurados são:

- `artifacts/signage: web` — frontend Vite
- `artifacts/api-server: API Server` — API Express
- `artifacts/mockup-sandbox: Component Preview Server` — previews isolados de componentes

### Pelo terminal

Em terminais separados:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/signage run dev
```

O frontend usa a porta `21153` e a API usa a porta `8080`. A API deve responder:

```bash
curl http://localhost:8080/api/healthz
```

O frontend possui as principais rotas:

- `/display` — slideshow no navegador
- `/admin` — administração de mídia
- `/clients` — clientes que operam as TVs
- `/devices` — dispositivos e playlists
- `/advertisers` — anunciantes e campanhas
- `/analytics` — métricas
- `/r/CODE` — redirect público do QR code (servido pela API, registra o scan)
- `/tv.html?key=DEVICE_KEY` — página compatível com Smart TVs

## Banco de dados

O schema fica em `lib/db/src/schema/` e usa Drizzle ORM.

Após alterar o schema:

```bash
cd lib/db
npx tsc --build
npx drizzle-kit push --config ./drizzle.config.ts
cd ../..
```

O `drizzle-kit push` deve ser usado no banco de desenvolvimento. Ao publicar no Replit, a plataforma compara e aplica as alterações de schema no banco de produção pelo fluxo de publicação.

## Validação

Antes de publicar ou enviar alterações:

```bash
pnpm run typecheck
pnpm run build
```

Para validar separadamente:

```bash
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/signage run typecheck
```

Testes unitários da API (geração de código, detecção de bot, fingerprint e taxa):

```bash
pnpm --filter @workspace/api-server run test
```

O build do workspace inclui o `mockup-sandbox`, cuja configuração exige `PORT` e
`BASE_PATH` mesmo durante o build local:

```bash
PORT=8081 BASE_PATH=/ pnpm run build
```

Para gerar somente os artifacts usados em produção:

```bash
pnpm --filter @workspace/signage run build
pnpm --filter @workspace/api-server run build
```

Se o schema do banco tiver sido alterado, compile primeiro a biblioteca:

```bash
cd lib/db && npx tsc --build
```

## Build e execução de produção

O artifact do frontend é configurado em `artifacts/signage/.replit-artifact/artifact.toml`:

- build: `pnpm --filter @workspace/signage run build`
- saída estática: `artifacts/signage/dist/public`

O artifact da API é configurado em `artifacts/api-server/.replit-artifact/artifact.toml`:

- build: `pnpm --filter @workspace/api-server run build`
- execução: `node --enable-source-maps artifacts/api-server/dist/index.mjs`
- health check: `/api/healthz`

Os mesmos dois comandos acima testam o build dos artifacts de produção sem
precisar iniciar o preview sandbox.

## Deploy no Replit

1. Execute `pnpm run typecheck` e `pnpm run build`.
2. Confirme que `DATABASE_URL` e as variáveis do App Storage estão configuradas no ambiente de produção.
3. Confirme que o Object Storage foi provisionado e que os uploads novos não dependem de `artifacts/api-server/uploads/`.
4. Abra o painel **Deploy/Publish** do Replit.
5. Publique o projeto e aguarde o health check da API em `/api/healthz`.
6. Verifique `/api/announcements`, `/api/advertisers` e a página publicada.
7. Para uma TV, abra a URL publicada com `/tv.html?key=DEVICE_KEY`.

O diretório local `artifacts/api-server/uploads/` existe apenas como fallback de desenvolvimento. Em produção, as imagens devem ser armazenadas no App Storage.

## Deploy na Vercel

O projeto roda como um único projeto Vercel: a SPA vira estático e a API Express
vira uma função serverless. O build é montado por `scripts/build-vercel.mjs`
usando a Build Output API v3 — a descoberta automática de funções da Vercel não
enxergaria um bundle gerado durante o build.

Rotas: `/api/*` e `/r/*` vão para a função; o resto é estático, com catch-all
para `index.html` (necessário para as rotas do wouter).

### Variáveis de ambiente em produção

| Variável | Origem |
| --- | --- |
| `DATABASE_URL` | Neon, provisionado pelo Marketplace. Use a string **pooled** (`-pooler`) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob, provisionado pelo Marketplace |
| `SCAN_SALT` | manual — sem ela a API não sobe (obrigatória em produção **e** preview) |
| `SESSION_SECRET` | manual — assina o cookie de login (obrigatória) |
| `ADMIN_USERNAME` | manual — usuário do admin |
| `ADMIN_PASSWORD` | manual — senha do admin |
| `PUBLIC_BASE_URL` | manual, domínio de produção; usado no QR |
| `YOUTUBE_API_KEY` | manual, opcional — só para playlists do YouTube |
| `MAX_UPLOAD_BYTES` | `4000000` — o corpo de requisição da função é limitado a 4,5 MB |

`PORT` e `BASE_PATH` **não** são configurados na Vercel: valem apenas para
`vite dev`/`vite preview` e para o `dev.sh`.

### Comandos

```bash
pnpm dlx vercel@latest deploy         # deploy de preview (build remoto na Vercel)
pnpm dlx vercel@latest --prod         # produção
```

O build remoto na Vercel é o caminho recomendado. O build local
(`pnpm dlx vercel@latest build` + `deploy --prebuilt`) também funciona, mas
depende do binário nativo do esbuild instalado corretamente na máquina.

### Schema do banco

Aplicado manualmente, nunca no build:

```bash
# DATABASE_URL pooled já definida no ambiente (ex.: em .env.production.local)
pnpm --filter @workspace/db run push
```

### Armazenamento de imagens

`MediaStore` (`artifacts/api-server/src/lib/storage/`) escolhe a implementação
por ambiente: `BLOB_READ_WRITE_TOKEN` → Vercel Blob; `PRIVATE_OBJECT_DIR` →
Object Storage do Replit; nenhum dos dois → disco local (`dev.sh`). O deploy
Replit continua funcionando sem mudanças.

### Login do painel

O painel exige login de um único admin (usuário + senha em `ADMIN_USERNAME` /
`ADMIN_PASSWORD`). A sessão é um cookie HttpOnly assinado com `SESSION_SECRET`,
válido por 7 dias. As telas de TV (`/display/:key`, `tv.html`) e os QR codes
(`/r/CODE`) continuam públicos. Defina as três variáveis em produção **e**
preview antes de publicar — sem elas a API não sobe.

## Organização do projeto

```text
artifacts/
  api-server/       API Express, uploads, storage e endpoints
  signage/          frontend React/Vite e página Smart TV
  mockup-sandbox/   previews isolados de componentes
lib/
  db/               schema Drizzle e conexão PostgreSQL
  api-spec/         contrato OpenAPI e codegen
  api-client-react/ cliente React gerado
scripts/            scripts auxiliares do workspace
```

## Arquitetura funcional

- **Clientes** são os proprietários/operadores das TVs.
- **Dispositivos** representam TVs individuais e têm uma chave própria.
- **Anunciantes** são os clientes pagantes.
- **Campanhas** ligam uma ou mais peças de mídia a um único anunciante, período, valor contratado e TVs de destino.
- Campanhas ativas dentro do período configurado entram automaticamente no display dos dispositivos elegíveis.
- Exibições (plays) são registradas pela API de telemetria no endpoint `/telemetry/play`, já atribuídas à campanha de origem via `campaignId`.
- Cada vínculo entre campanha e peça tem um código curto imutável (`scanCode`) e uma URL de destino opcional. Com destino configurado, o player sobrepõe um QR code na peça; o scan passa por `/r/CODE`, é registrado na tabela `scans` e redireciona para o destino.
- Scans são apresentados junto das exibições em números brutos e visitantes únicos, mais a taxa `scans / exibições`. A métrica mede resposta, não alcance: um scan não é atribuível a uma exibição ou TV específica.
- Visitantes únicos são contados por `fingerprint` (hash de IP + user-agent com `SCAN_SALT`); não há cookie de rastreamento. Reabrir o mesmo link soma no bruto e não soma no único. Duas pessoas atrás do mesmo IP com o mesmo navegador contam como uma.
- Uploads são persistidos no App Storage; o banco guarda somente o caminho do objeto e os metadados.

## Integração com GitHub

O repositório remoto é:

```text
https://github.com/negoNegoso/Smart-Tv-Ads
```

Para sincronizar normalmente, configure a integração GitHub do Replit e use:

```bash
git status
git add .
git commit -m "Descrição da alteração"
git push origin main
```

Não coloque tokens, senhas ou valores de `.env` nos commits.