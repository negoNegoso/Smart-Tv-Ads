# SignageOS — Painel de Anúncios

Sistema de sinalização digital para administrar mídias, Smart TVs, dispositivos, anunciantes, campanhas e métricas.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API Express na porta 8080
- `pnpm --filter @workspace/signage run dev` — frontend Vite na porta 21153
- `pnpm run typecheck` — typecheck completo
- `pnpm run build` — typecheck e build dos pacotes
- `cd lib/db && npx tsc --build` — compilar a biblioteca do banco antes do typecheck da API
- `cd lib/db && npx drizzle-kit push --config ./drizzle.config.ts` — aplicar schema no banco de desenvolvimento
- `pnpm --filter @workspace/api-spec run codegen` — regenerar cliente a partir do OpenAPI quando o contrato for alterado
- Health check da API: `GET /api/healthz`
- Variáveis principais: `DATABASE_URL` e as variáveis do App Storage configuradas pelo Replit

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/routes/` — rotas da API
- `artifacts/api-server/src/lib/objectStorage.ts` — integração com App Storage
- `artifacts/signage/src/pages/` — telas React
- `artifacts/signage/public/tv.html` — display ES5 para Smart TVs
- `lib/db/src/schema/` — schema Drizzle/PostgreSQL
- `lib/api-spec/openapi.yaml` — contrato OpenAPI
- `artifacts/*/.replit-artifact/artifact.toml` — configuração de build, portas e deploy

## Architecture decisions

- O frontend e a API são artifacts separados e se comunicam pela mesma base de caminhos do Replit.
- Uploads usam App Storage em produção e disco local apenas como fallback de desenvolvimento.
- A página `tv.html` evita módulos React, `fetch` e APIs modernas para compatibilidade com Smart TVs.
- Clientes que operam TVs são separados de anunciantes pagantes.
- Uma campanha pode estar vinculada a vários anunciantes por uma tabela de relacionamento.

## Product

- Slideshow fullscreen e página standalone para Smart TVs.
- Biblioteca de mídia com upload, ordem, ativação e exclusão.
- Cadastro de clientes, dispositivos, playlists e campanhas.
- Campanhas com período, valor, anunciantes e TVs específicas.
- Impressões, uptime e analytics.

## User preferences

As respostas e documentação do projeto devem ser mantidas em português quando voltadas ao usuário.

## Gotchas

- Não usar `npm` ou `yarn`; o workspace exige pnpm.
- Após alterar `lib/db`, executar `cd lib/db && npx tsc --build` antes do typecheck da API.
- FormData envia valores como strings; rotas multipart devem converter números antes da validação Zod.
- Não depender de `artifacts/api-server/uploads/` para produção.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `README.md` for installation, development, validation and deployment instructions.
