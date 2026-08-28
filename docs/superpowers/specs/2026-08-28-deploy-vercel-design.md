# Deploy do SignageOS na Vercel

**Data:** 2026-08-28
**Objetivo:** Publicar o painel (SPA) e a API em um único projeto Vercel, com Postgres gerenciado (Neon) e armazenamento de imagens em Vercel Blob, para que o sistema possa ser testado em produção fora do Replit.
**Escopo:** empacotamento serverless da API Express, build do frontend Vite para estático, camada de storage plugável, provisionamento de banco e blob, variáveis de ambiente e roteiro de verificação. Fora de escopo: upload direto do navegador para o Blob, autenticação, domínio próprio, migração de dados vindos do Replit e desativação do deploy Replit.

---

## 1. Estado atual e o que impede o deploy

O repositório é um monorepo pnpm com três artefatos e três bibliotecas. Só dois artefatos vão para a Vercel:

| Pacote | Papel | Vai para a Vercel? |
| --- | --- | --- |
| `@workspace/signage` | SPA React (Vite + wouter) | Sim, como estático |
| `@workspace/api-server` | API Express (esbuild → `dist/index.mjs`) | Sim, como função serverless |
| `@workspace/mockup-sandbox` | Sandbox de protótipos | Não |

Cinco bloqueios, todos obrigatórios:

1. **Banco local.** `DATABASE_URL` aponta para `postgres://…@localhost:5433/signage`, um container Docker criado pelo `dev.sh`. Não existe banco alcançável em produção.
2. **Upload grava em disco.** `artifacts/api-server/src/routes/announcements.ts:65` chama `fs.writeFileSync` em `uploads/`. O filesystem da função serverless é somente-leitura fora de `/tmp`, e `/tmp` não persiste entre invocações.
3. **Object Storage do Replit não existe na Vercel.** `artifacts/api-server/src/lib/objectStorage.ts:23` autentica contra o sidecar `http://127.0.0.1:1106`, exclusivo do runtime Replit.
4. **A API abre um socket.** `artifacts/api-server/src/index.ts` exige `PORT` e chama `app.listen`. Função serverless recebe um handler, não escuta porta.
5. **O build do frontend falha sem envs de dev.** `artifacts/signage/vite.config.ts` faz `throw` se `PORT` ou `BASE_PATH` estiverem ausentes, inclusive em build de produção, onde nenhum dos dois faz sentido.

---

## 2. Decisões tomadas

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Banco | Neon via Vercel Marketplace | Provisionado pelo painel, injeta `DATABASE_URL` no projeto, compatível com o driver `pg` já usado |
| Imagens | Vercel Blob | Caminho nativo da plataforma, sem credencial externa |
| Topologia | Um projeto (estático + função) | Mesma origem: sem CORS, e o QR aponta para o mesmo domínio que serve `/r/:code` |
| Empacotamento | Pré-bundle com esbuild | O `build.mjs` existente já resolve os pacotes `@workspace/*` que exportam TypeScript cru; o bundler da Vercel não atravessa esses links do pnpm de forma confiável |
| Replit | Continua funcionando | Storage vira interface com três implementações; `.replit` e `dev.sh` não mudam de comportamento |

---

## 3. Build e roteamento

### 3.1 Por que Build Output API v3

A descoberta automática de funções da Vercel varre o diretório `api/` do código-fonte. O bundle da API só existe **depois** do build, então não seria detectado, e commitar um artefato gerado não é aceitável.

A solução é escrever a estrutura de saída explicitamente com a [Build Output API v3](https://vercel.com/docs/build-output-api/v3): o build produz `.vercel/output/` e a Vercel apenas consome o que está lá. Sem heurística, sem detecção implícita.

Consequência: as rotas ficam em `.vercel/output/config.json`, não em `vercel.json`. Um `vercel.json` mínimo permanece na raiz apenas para declarar `buildCommand` e `installCommand`.

### 3.2 `scripts/build-vercel.mjs` (novo)

```
1. pnpm --filter @workspace/signage build
     → artifacts/signage/dist/public
2. pnpm --filter @workspace/api-server run build:vercel
     → artifacts/api-server/dist-vercel/index.mjs   (bundle self-contained)
3. copia (1) → .vercel/output/static/
4. cria .vercel/output/functions/api/index.func/
     index.mjs        ← bundle de (2)
     .vc-config.json  ← { runtime: nodejs22.x, handler: "index.mjs",
                          launcherType: "Nodejs", shouldAddHelpers: true }
5. escreve .vercel/output/config.json
```

`config.json`:

```json
{
  "version": 3,
  "routes": [
    { "src": "/api/(.*)", "dest": "/api" },
    { "src": "/r/(.*)", "dest": "/api" },
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
```

O `handle: filesystem` serve os assets buildados; tudo que sobra cai no `index.html`, que é o necessário para as rotas do wouter (`/clients/:id`, `/display/:deviceKey`, …) funcionarem em acesso direto e refresh.

O launcher `Nodejs` com `shouldAddHelpers` invoca o export default como `(req, res)`. Um app Express **é** essa função, então nenhum adaptador é necessário.

`.vercel/` entra no `.gitignore`.

### 3.3 Entrypoint serverless

`artifacts/api-server/src/serverless.ts` (novo):

```ts
export { default } from "./app";
```

Sem `app.listen`, sem exigência de `PORT`. O `index.ts` atual continua intacto e é o entrypoint do Replit e do `dev.sh`.

`build.mjs` ganha um alvo `vercel` (via argumento de linha de comando) que muda três coisas em relação ao alvo padrão:

- entrypoint `src/serverless.ts`, saída em `dist-vercel/index.mjs`;
- sem o plugin `esbuild-plugin-pino` — em produção `logger.ts` não usa transport, então nenhum arquivo de worker é necessário e o bundle fica com um arquivo só;
- `@google-cloud/*` permanece `external` (ver §4.3).

### 3.4 Correção no `vite.config.ts`

`PORT` e `BASE_PATH` passam a ser exigidos apenas nos comandos `dev` e `serve`. No build, `base` assume `/` quando `BASE_PATH` não está definido. O `throw` incondicional de hoje é um defeito: impede qualquer build de produção, não só o da Vercel.

---

## 4. Camada de storage

### 4.1 Interface

Novo diretório `artifacts/api-server/src/lib/storage/`:

```ts
export interface MediaStore {
  /** Persiste o arquivo e devolve a string gravada em announcements.image_url. */
  put(buffer: Buffer, mimetype: string, originalname: string): Promise<string>;
  /** Remove o arquivo apontado por uma image_url previamente devolvida por put(). */
  remove(imageUrl: string): Promise<void>;
}
```

`remove` é tolerante a URLs que não pertencem à implementação corrente (linhas antigas de outro backend): registra e retorna sem erro.

### 4.2 Seleção da implementação

Resolvida uma vez, na primeira chamada, nesta ordem:

| Condição | Implementação | Valor devolvido por `put` |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` definido | `VercelBlobStore` | URL https absoluta do Blob |
| `PRIVATE_OBJECT_DIR` definido | `ReplitObjectStore` | `/api/storage/objects/<path>` |
| nenhum dos dois | `LocalDiskStore` | `/api/uploads/<arquivo>` |

`image_url` continua sendo uma string opaca consumida direto como `src` de `<img>`. URL absoluta e caminho relativo funcionam igual no frontend, então **nenhuma mudança é necessária no `signage`**.

As rotas `/api/uploads/*` (`app.ts:41`) e `/api/storage/objects/*` (`routes/storage.ts`) permanecem, para não quebrar linhas gravadas por outro backend.

### 4.3 `@google-cloud/storage` fora do bundle Vercel

`ReplitObjectStore` carrega `@google-cloud/storage` por `import()` dinâmico, dentro do método, e não no topo do módulo. Com o pacote marcado `external` no bundle Vercel, o import nunca é avaliado lá — a implementação sequer é instanciada, já que `PRIVATE_OBJECT_DIR` não existe naquele ambiente. Isso evita arrastar um pacote grande, com `require` dinâmico de `.proto`, para dentro da função.

### 4.4 Dois defeitos corrigidos junto

Ambos são inofensivos no Replit e fatais em serverless:

- **`mkdirSync` no import.** `announcements.ts:31-34` cria `uploads/` no carregamento do módulo. Em filesystem somente-leitura isso derruba a função inteira, mesmo em requisições que não tocam upload. Passa para dentro do `LocalDiskStore`, executado na primeira escrita.
- **`migrateLegacyImages()` no import.** `announcements.ts:95` dispara um `SELECT *` em `announcements` a cada carregamento do módulo — ou seja, a cada cold start. Já retorna cedo sem `PRIVATE_OBJECT_DIR`, mas passa a ser explicitamente uma rotina do `ReplitObjectStore`, sem efeito colateral no import.

### 4.5 Limite de upload

O corpo de uma requisição para função serverless na Vercel é limitado a 4,5 MB. O `multer` hoje aceita 20 MB (`announcements.ts:39`).

Decisão: o limite passa a ser lido de `MAX_UPLOAD_BYTES`, com padrão 20 MB e valor 4 MB configurado na Vercel. Arquivo acima do limite retorna **413** com mensagem em português informando o tamanho máximo — em vez do erro opaco que a plataforma devolveria.

Upload direto do navegador para o Blob elimina o teto, mas é trabalho separado e fora deste escopo.

---

## 5. Banco de dados

Neon provisionado pelo Marketplace, dentro do projeto Vercel, o que injeta `DATABASE_URL` automaticamente nos três ambientes.

**Connection string pooled.** Usar o host com sufixo `-pooler`. Cada instância da função abre o próprio `pg.Pool`, e o número de instâncias escala com o tráfego; sem o pooler o limite de conexões do Neon é atingido rápido.

**`max: 1` no Pool** (`lib/db/src/index.ts`). Uma invocação serverless atende uma requisição por vez; um pool maior só multiplica conexões ociosas.

**Schema aplicado manualmente**, não no build:

```bash
vercel env pull .env.production.local
pnpm --filter @workspace/db push
```

Motivo: `drizzle-kit push` compara e altera o schema. Rodar isso automaticamente a cada deploy, sem revisão, é como se perde dados em produção.

---

## 6. Variáveis de ambiente

| Variável | Origem | Falta dela causa |
| --- | --- | --- |
| `DATABASE_URL` | Neon (automática) | Falha no import de `@workspace/db` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (automática) | Cai no `LocalDiskStore` e uploads somem |
| `SCAN_SALT` | manual | Scans de QR não são registrados |
| `SESSION_SECRET` | manual | Sessões, quando aplicável |
| `PUBLIC_BASE_URL` | manual | QR aponta para o host da requisição |
| `MAX_UPLOAD_BYTES` | manual (`4000000`) | Usa o padrão de 20 MB e uploads grandes falham com erro opaco |

`PUBLIC_BASE_URL` sem valor faz o QR usar o host da requisição (`routes/qr.ts:29`). Em preview isso gera um QR apontando para uma URL efêmera. Em produção o valor é o domínio final; o código passa a usar `VERCEL_PROJECT_PRODUCTION_URL` como fallback antes de cair no host da requisição.

**Validação de `SCAN_SALT` movida.** Hoje o `throw` está em `index.ts:4`, que não roda em serverless — na Vercel a ausência da variável seria silenciosa e os scans simplesmente não apareceriam. A verificação vai para `app.ts`, que é carregado pelos dois entrypoints.

`PORT` e `BASE_PATH` **não** são configurados na Vercel. Deixam de ser necessários (§3.4).

---

## 7. Verificação

Em ordem, sem pular etapa:

1. `pnpm run typecheck` e `pnpm --filter @workspace/api-server test` — verdes.
2. `vercel build` local. Pega erro de build sem consumir deploy.
3. Deploy de **preview**. Testar, nesta ordem:
   - `GET /api/healthz` responde 200;
   - `/clients` carrega e lista dados do Neon;
   - criar uma peça com imagem; conferir que `image_url` é URL do Blob e que a imagem abre;
   - excluir a peça; conferir que o arquivo sai do Blob;
   - upload acima de 4 MB retorna 413 com a mensagem esperada;
   - `/display/:deviceKey` roda a playlist;
   - `/api/qr/CODE.png` gera o PNG e o QR aponta para o domínio correto;
   - `/r/CODE` redireciona e registra o scan;
   - acesso direto e refresh em `/clients/:id` retorna a SPA, não 404.
4. Só então `vercel --prod`.

---

## 8. Riscos e limites conhecidos

- **Teto de upload em 4 MB** (§4.5). Consciente e sinalizado ao usuário; a solução definitiva é upload direto para o Blob.
- **Cold start.** A primeira requisição após ociosidade abre conexão nova no Neon. Painel de uso interno; aceitável.
- **Banco novo, vazio.** Nenhum dado do Replit é migrado. Imagens antigas em `/api/uploads/*` não existem na Vercel, mas como a base começa vazia, nenhuma linha aponta para elas.
- **Preview e produção compartilham o mesmo banco Neon**, salvo se um branch de banco for criado depois. Testes em preview escrevem em dados reais.
- **O deploy Replit continua ativo.** Dois ambientes contra bancos diferentes. Desligar o Replit é uma decisão posterior.

---

## 9. Arquivos afetados

**Novos**

- `scripts/build-vercel.mjs`
- `vercel.json`
- `artifacts/api-server/src/serverless.ts`
- `artifacts/api-server/src/lib/storage/index.ts` (interface + seleção)
- `artifacts/api-server/src/lib/storage/vercel-blob.ts`
- `artifacts/api-server/src/lib/storage/replit-object.ts` (recebe o `objectStorage.ts` atual)
- `artifacts/api-server/src/lib/storage/local-disk.ts`

**Modificados**

- `artifacts/api-server/build.mjs` — alvo `vercel`
- `artifacts/api-server/src/app.ts` — validação de `SCAN_SALT`
- `artifacts/api-server/src/index.ts` — remove a validação movida
- `artifacts/api-server/src/routes/announcements.ts` — usa `MediaStore`, sai `mkdirSync` e `migrateLegacyImages` do import, limite via `MAX_UPLOAD_BYTES`, 413 explícito
- `artifacts/api-server/src/routes/storage.ts` — passa a usar `ReplitObjectStore`
- `artifacts/api-server/src/routes/qr.ts` — fallback `VERCEL_PROJECT_PRODUCTION_URL`
- `artifacts/api-server/package.json` — script `build:vercel`, dependência `@vercel/blob`
- `artifacts/signage/vite.config.ts` — `PORT`/`BASE_PATH` só em dev e serve
- `lib/db/src/index.ts` — `max: 1` no Pool
- `.gitignore` — `.vercel/`, `dist-vercel/`
- `README.md` — seção de deploy na Vercel

**Intocados:** `.replit`, `dev.sh`, todo o `artifacts/signage/src`, `artifacts/mockup-sandbox`.
