# Deploy do SignageOS na Vercel — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar a SPA e a API Express em um único projeto Vercel, com Postgres no Neon e imagens no Vercel Blob, sem quebrar o deploy Replit nem o `dev.sh`.

**Architecture:** A SPA vira estático e o Express vira uma função serverless, ambos escritos em `.vercel/output/` pela Build Output API v3 — a descoberta automática de funções da Vercel não enxergaria um bundle gerado durante o build. O armazenamento de imagens passa por uma interface `MediaStore` com três implementações (Vercel Blob, Object Storage do Replit, disco local) escolhidas por variável de ambiente.

**Tech Stack:** pnpm workspace, TypeScript, Express 5, esbuild, Vite 7 + React, Drizzle ORM + `pg`, Vitest, `@vercel/blob`, Vercel CLI.

**Spec:** `docs/superpowers/specs/2026-08-28-deploy-vercel-design.md`

## Global Constraints

- **Gerenciador de pacotes:** `pnpm` exclusivamente. O `preinstall` da raiz aborta com `npm` ou `yarn`. Nunca gerar `package-lock.json` ou `yarn.lock`.
- **`pnpm-workspace.yaml`:** contém `minimumReleaseAge: 1440` (um dia) como defesa contra ataque de cadeia de suprimentos, além do `catalog:` de versões. **Não desabilitar, não reduzir, não adicionar entradas em `minimumReleaseAgeExclude`.** Se uma instalação falhar por causa disso, pare e relate.
- **Idioma:** mensagens de erro visíveis ao usuário final em **português**. Nomes de teste em português (padrão do repositório, ver `src/lib/__tests__/bot-detect.test.ts`). Código, identificadores e comentários em inglês.
- **Runtime da função:** `nodejs22.x`.
- **Limite de upload em produção:** `MAX_UPLOAD_BYTES=4000000` na Vercel. Padrão do código permanece 20 MB (`20 * 1024 * 1024`).
- **Rotas da função:** `/api/*` e `/r/*`. Todo o resto é estático ou cai em `index.html`.
- **Não tocar:** `.replit`, `dev.sh`, `artifacts/signage/src/**`, `artifacts/mockup-sandbox/**`.
- **Comandos rodam da raiz do repositório** (`/Users/yvillanova/Downloads/tv/Smart-Tv-Ads`), usando `pnpm --filter`.
- **Testes:** `pnpm --filter @workspace/api-server test` roda Vitest com `include: ["src/**/*.test.ts"]`.

### Duas divergências conscientes em relação à spec

Ambas atingem o mesmo requisito com menos churn. Estão refletidas nas tarefas abaixo:

1. A spec §9 previa **mover** `src/lib/objectStorage.ts` para `src/lib/storage/replit-object.ts`. O plano **mantém o arquivo onde está** e adiciona `src/lib/storage/replit.ts` como adaptador fino que faz `import()` dinâmico dele. O requisito real da spec §4.3 — `@google-cloud/storage` nunca ser avaliado no bundle Vercel — é atendido igual, sem mover 276 linhas.
2. A spec §4.4 previa mover `migrateLegacyImages()` para dentro do `ReplitObjectStore`. O plano **mantém a função em `announcements.ts`** e apenas envolve a chamada em `if (process.env.PRIVATE_OBJECT_DIR)`. O requisito real — nenhum `SELECT` disparado no import fora do Replit — é atendido, e a função continua perto da tabela que ela migra.

---

## Estrutura de arquivos

**Novos**

| Arquivo | Responsabilidade |
| --- | --- |
| `artifacts/api-server/src/lib/storage/types.ts` | A interface `MediaStore`. Nada mais. |
| `artifacts/api-server/src/lib/storage/local-disk.ts` | Grava e apaga em `uploads/`. Cria o diretório sob demanda, nunca no import. |
| `artifacts/api-server/src/lib/storage/vercel-blob.ts` | Grava e apaga no Vercel Blob. |
| `artifacts/api-server/src/lib/storage/replit.ts` | Adaptador do Object Storage do Replit, com `import()` dinâmico. |
| `artifacts/api-server/src/lib/storage/index.ts` | Escolhe a implementação por env e memoiza. |
| `artifacts/api-server/src/lib/upload-limit.ts` | Lê `MAX_UPLOAD_BYTES` e monta a mensagem de erro 413. |
| `artifacts/api-server/src/lib/required-env.ts` | Valida envs obrigatórias em um ponto só. |
| `artifacts/api-server/src/lib/public-base-url.ts` | Resolve a origem pública usada no QR. |
| `artifacts/api-server/src/serverless.ts` | Entrypoint da função: exporta o app, não escuta porta. |
| `scripts/build-vercel.mjs` | Monta `.vercel/output/` completo. |
| `vercel.json` | Declara `buildCommand` e `installCommand`. |

**Modificados:** `build.mjs`, `package.json` (api-server e raiz), `app.ts`, `index.ts`, `routes/announcements.ts`, `routes/storage.ts`, `routes/qr.ts`, `lib/db/src/index.ts`, `artifacts/signage/vite.config.ts`, `.gitignore`, `README.md`.

---

## Task 1: Interface `MediaStore` e implementação em disco

**Files:**
- Create: `artifacts/api-server/src/lib/storage/types.ts`
- Create: `artifacts/api-server/src/lib/storage/local-disk.ts`
- Test: `artifacts/api-server/src/lib/storage/__tests__/local-disk.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `interface MediaStore { put(buffer: Buffer, mimetype: string, originalname: string): Promise<string>; remove(imageUrl: string): Promise<void>; }`
  - `class LocalDiskStore implements MediaStore` com construtor `constructor(dir?: string)`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/api-server/src/lib/storage/__tests__/local-disk.test.ts`:

```ts
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDiskStore } from "../local-disk";

describe("LocalDiskStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = path.join(mkdtempSync(path.join(tmpdir(), "signage-")), "uploads");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("cria o diretório apenas na primeira escrita, não na construção", async () => {
    const store = new LocalDiskStore(dir);
    expect(existsSync(dir)).toBe(false);

    await store.put(Buffer.from("conteudo"), "image/png", "foto.png");

    expect(existsSync(dir)).toBe(true);
  });

  it("grava o arquivo e devolve um caminho servível pela API", async () => {
    const store = new LocalDiskStore(dir);

    const imageUrl = await store.put(Buffer.from("conteudo"), "image/png", "foto.png");

    expect(imageUrl).toMatch(/^\/api\/uploads\/.+\.png$/);
    const filename = imageUrl.split("/").pop()!;
    expect(readFileSync(path.join(dir, filename), "utf8")).toBe("conteudo");
  });

  it("apaga o arquivo apontado pela url", async () => {
    const store = new LocalDiskStore(dir);
    const imageUrl = await store.put(Buffer.from("conteudo"), "image/png", "foto.png");
    const filename = imageUrl.split("/").pop()!;

    await store.remove(imageUrl);

    expect(existsSync(path.join(dir, filename))).toBe(false);
  });

  it("ignora url de outro backend sem lançar erro", async () => {
    const store = new LocalDiskStore(dir);

    await expect(
      store.remove("https://exemplo.public.blob.vercel-storage.com/a.png"),
    ).resolves.toBeUndefined();
  });

  it("ignora arquivo já inexistente sem lançar erro", async () => {
    const store = new LocalDiskStore(dir);

    await expect(store.remove("/api/uploads/nao-existe.png")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/storage/__tests__/local-disk.test.ts`
Expected: FAIL — `Failed to resolve import "../local-disk"`.

- [ ] **Step 3: Escrever a interface**

Criar `artifacts/api-server/src/lib/storage/types.ts`:

```ts
/**
 * Persists announcement images. The string returned by `put` is stored verbatim
 * in `announcements.image_url` and consumed by the frontend as an `<img src>`,
 * so both absolute URLs and API-relative paths are valid return values.
 */
export interface MediaStore {
  put(buffer: Buffer, mimetype: string, originalname: string): Promise<string>;
  /** Tolerates URLs produced by a different implementation: returns without error. */
  remove(imageUrl: string): Promise<void>;
}
```

- [ ] **Step 4: Escrever a implementação mínima**

Criar `artifacts/api-server/src/lib/storage/local-disk.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import type { MediaStore } from "./types";

const URL_PREFIX = "/api/uploads/";

/**
 * Development fallback used by dev.sh. Creates the uploads directory on first
 * write instead of at import time, so importing this module never touches a
 * read-only filesystem.
 */
export class LocalDiskStore implements MediaStore {
  private readonly dir: string;

  constructor(dir: string = path.resolve(process.cwd(), "uploads")) {
    this.dir = dir;
  }

  async put(buffer: Buffer, _mimetype: string, originalname: string): Promise<string> {
    await fs.promises.mkdir(this.dir, { recursive: true });
    const ext = path.extname(originalname);
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    await fs.promises.writeFile(path.join(this.dir, filename), buffer);
    return `${URL_PREFIX}${filename}`;
  }

  async remove(imageUrl: string): Promise<void> {
    if (!imageUrl.startsWith(URL_PREFIX)) return;
    const filename = imageUrl.slice(URL_PREFIX.length);
    if (!filename || filename.includes("/")) return;
    await fs.promises.rm(path.join(this.dir, filename), { force: true });
  }
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/storage/__tests__/local-disk.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/storage/
git commit -m "feat(storage): interface MediaStore e implementacao em disco"
```

---

## Task 2: Implementação Vercel Blob

**Files:**
- Create: `artifacts/api-server/src/lib/storage/vercel-blob.ts`
- Test: `artifacts/api-server/src/lib/storage/__tests__/vercel-blob.test.ts`
- Modify: `artifacts/api-server/package.json` (adicionar dependência `@vercel/blob`)

**Interfaces:**
- Consumes: `MediaStore` de `./types` (Task 1).
- Produces: `class VercelBlobStore implements MediaStore` — construtor sem argumentos. `put` devolve URL https absoluta.

- [ ] **Step 1: Instalar a dependência**

```bash
pnpm --filter @workspace/api-server add @vercel/blob
```

Se falhar por `minimumReleaseAge`, **pare e relate**. Não editar `.npmrc`.

- [ ] **Step 2: Escrever o teste que falha**

Criar `artifacts/api-server/src/lib/storage/__tests__/vercel-blob.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted é obrigatório: vi.mock é içada para o topo do arquivo, então uma
// fábrica que referencia `const` comum estoura ReferenceError.
const { put, del } = vi.hoisted(() => ({ put: vi.fn(), del: vi.fn() }));

vi.mock("@vercel/blob", () => ({ put, del }));

import { VercelBlobStore } from "../vercel-blob";

describe("VercelBlobStore", () => {
  beforeEach(() => {
    put.mockReset();
    del.mockReset();
    put.mockResolvedValue({ url: "https://exemplo.public.blob.vercel-storage.com/announcements/abc.png" });
  });

  it("envia o buffer como público e devolve a url absoluta", async () => {
    const store = new VercelBlobStore();
    const buffer = Buffer.from("conteudo");

    const imageUrl = await store.put(buffer, "image/png", "foto.png");

    expect(imageUrl).toBe("https://exemplo.public.blob.vercel-storage.com/announcements/abc.png");
    const [pathname, body, options] = put.mock.calls[0]!;
    expect(pathname).toMatch(/^announcements\/.+\.png$/);
    expect(body).toBe(buffer);
    expect(options).toMatchObject({ access: "public", contentType: "image/png" });
  });

  it("preserva a extensão do arquivo original", async () => {
    const store = new VercelBlobStore();

    await store.put(Buffer.from("x"), "image/jpeg", "banner.JPG");

    expect(put.mock.calls[0]![0]).toMatch(/\.JPG$/);
  });

  it("apaga pelo url absoluto", async () => {
    const store = new VercelBlobStore();

    await store.remove("https://exemplo.public.blob.vercel-storage.com/announcements/abc.png");

    expect(del).toHaveBeenCalledWith("https://exemplo.public.blob.vercel-storage.com/announcements/abc.png");
  });

  it("ignora url de outro backend sem chamar o blob", async () => {
    const store = new VercelBlobStore();

    await store.remove("/api/uploads/antigo.png");

    expect(del).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/storage/__tests__/vercel-blob.test.ts`
Expected: FAIL — `Failed to resolve import "../vercel-blob"`.

- [ ] **Step 4: Escrever a implementação mínima**

Criar `artifacts/api-server/src/lib/storage/vercel-blob.ts`:

```ts
import { randomUUID } from "node:crypto";
import path from "node:path";
import { put as putBlob, del as delBlob } from "@vercel/blob";
import type { MediaStore } from "./types";

/**
 * Production implementation on Vercel. Reads BLOB_READ_WRITE_TOKEN from the
 * environment through the SDK, so no explicit credential is passed here.
 */
export class VercelBlobStore implements MediaStore {
  async put(buffer: Buffer, mimetype: string, originalname: string): Promise<string> {
    const ext = path.extname(originalname);
    const result = await putBlob(`announcements/${randomUUID()}${ext}`, buffer, {
      access: "public",
      contentType: mimetype,
      addRandomSuffix: false,
    });
    return result.url;
  }

  async remove(imageUrl: string): Promise<void> {
    if (!imageUrl.startsWith("https://")) return;
    await delBlob(imageUrl);
  }
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/storage/__tests__/vercel-blob.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/storage/vercel-blob.ts artifacts/api-server/src/lib/storage/__tests__/vercel-blob.test.ts artifacts/api-server/package.json pnpm-lock.yaml
git commit -m "feat(storage): implementacao Vercel Blob"
```

---

## Task 3: Adaptador do Object Storage do Replit

**Files:**
- Create: `artifacts/api-server/src/lib/storage/replit.ts`
- Test: `artifacts/api-server/src/lib/storage/__tests__/replit.test.ts`

**Interfaces:**
- Consumes: `MediaStore` de `./types` (Task 1); `ObjectStorageService` de `../objectStorage` (já existe, não modificar).
- Produces: `class ReplitObjectStore implements MediaStore`. `put` devolve `/api/storage/objects/<path>`. `remove` é no-op deliberado.

**Contexto que o implementador precisa:** `src/lib/objectStorage.ts` executa `new Storage({...})` no nível do módulo, importando `@google-cloud/storage`. Esse pacote fica marcado como `external` no bundle da Vercel (Task 10), então **qualquer `import` estático dele quebra a função em produção**. Por isso o `import()` fica dentro do método, não no topo do arquivo.

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/api-server/src/lib/storage/__tests__/replit.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted é obrigatório: vi.mock é içada para o topo do arquivo, então uma
// fábrica que referencia `const` comum estoura ReferenceError.
const { getObjectEntityUploadURL, normalizeObjectEntityPath } = vi.hoisted(() => ({
  getObjectEntityUploadURL: vi.fn(),
  normalizeObjectEntityPath: vi.fn(),
}));

vi.mock("../../objectStorage", () => ({
  ObjectStorageService: class {
    getObjectEntityUploadURL = getObjectEntityUploadURL;
    normalizeObjectEntityPath = normalizeObjectEntityPath;
  },
}));

import { ReplitObjectStore } from "../replit";

describe("ReplitObjectStore", () => {
  beforeEach(() => {
    getObjectEntityUploadURL.mockReset();
    normalizeObjectEntityPath.mockReset();
    getObjectEntityUploadURL.mockResolvedValue("https://storage.googleapis.com/bucket/dir/uploads/abc");
    normalizeObjectEntityPath.mockReturnValue("/objects/uploads/abc");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });

  it("envia via PUT para a url assinada e devolve o caminho servido pela api", async () => {
    const store = new ReplitObjectStore();
    const buffer = Buffer.from("conteudo");

    const imageUrl = await store.put(buffer, "image/png", "foto.png");

    expect(imageUrl).toBe("/api/storage/objects/uploads/abc");
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://storage.googleapis.com/bucket/dir/uploads/abc");
    expect(init).toMatchObject({ method: "PUT", headers: { "Content-Type": "image/png" } });
  });

  it("lança erro quando o upload assinado é rejeitado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const store = new ReplitObjectStore();

    await expect(store.put(Buffer.from("x"), "image/png", "foto.png")).rejects.toThrow(
      "Object storage upload failed: 403",
    );
  });

  it("remove é no-op: o App Storage retém os objetos", async () => {
    const store = new ReplitObjectStore();

    await expect(store.remove("/api/storage/objects/uploads/abc")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/storage/__tests__/replit.test.ts`
Expected: FAIL — `Failed to resolve import "../replit"`.

- [ ] **Step 3: Escrever a implementação mínima**

Criar `artifacts/api-server/src/lib/storage/replit.ts`:

```ts
import type { MediaStore } from "./types";

/**
 * Replit App Storage. `@google-cloud/storage` is loaded through a dynamic
 * import so that it can stay external in the Vercel bundle, where this
 * implementation is never selected and therefore never evaluated.
 */
export class ReplitObjectStore implements MediaStore {
  async put(buffer: Buffer, mimetype: string, _originalname: string): Promise<string> {
    const { ObjectStorageService } = await import("../objectStorage");
    const service = new ObjectStorageService();

    const uploadUrl = await service.getObjectEntityUploadURL();
    const uploaded = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimetype },
      body: buffer,
    });
    if (!uploaded.ok) {
      throw new Error(`Object storage upload failed: ${uploaded.status}`);
    }

    const objectPath = service.normalizeObjectEntityPath(uploadUrl);
    return `/api/storage/objects/${objectPath.replace(/^\/objects\//, "")}`;
  }

  /** Deliberate no-op: the previous implementation never deleted App Storage objects. */
  async remove(_imageUrl: string): Promise<void> {}
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/storage/__tests__/replit.test.ts`
Expected: PASS — 3 testes.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/storage/replit.ts artifacts/api-server/src/lib/storage/__tests__/replit.test.ts
git commit -m "feat(storage): adaptador do Object Storage do Replit"
```

---

## Task 4: Seleção da implementação por ambiente

**Files:**
- Create: `artifacts/api-server/src/lib/storage/index.ts`
- Test: `artifacts/api-server/src/lib/storage/__tests__/index.test.ts`

**Interfaces:**
- Consumes: `LocalDiskStore` (Task 1), `VercelBlobStore` (Task 2), `ReplitObjectStore` (Task 3).
- Produces:
  - `createMediaStore(env?: NodeJS.ProcessEnv): MediaStore` — pura, recebe o ambiente, sem estado.
  - `mediaStore(): MediaStore` — memoizada sobre `process.env`, usada pelas rotas.
  - Reexporta `type MediaStore`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/api-server/src/lib/storage/__tests__/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createMediaStore } from "../index";
import { LocalDiskStore } from "../local-disk";
import { ReplitObjectStore } from "../replit";
import { VercelBlobStore } from "../vercel-blob";

describe("createMediaStore", () => {
  it("usa o Vercel Blob quando BLOB_READ_WRITE_TOKEN está definido", () => {
    const store = createMediaStore({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x" });

    expect(store).toBeInstanceOf(VercelBlobStore);
  });

  it("prefere o Vercel Blob quando as duas variáveis estão definidas", () => {
    const store = createMediaStore({
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x",
      PRIVATE_OBJECT_DIR: "/bucket/.private",
    });

    expect(store).toBeInstanceOf(VercelBlobStore);
  });

  it("usa o Object Storage do Replit quando só PRIVATE_OBJECT_DIR está definido", () => {
    const store = createMediaStore({ PRIVATE_OBJECT_DIR: "/bucket/.private" });

    expect(store).toBeInstanceOf(ReplitObjectStore);
  });

  it("cai no disco local quando nenhuma das duas está definida", () => {
    const store = createMediaStore({});

    expect(store).toBeInstanceOf(LocalDiskStore);
  });

  it("trata string vazia como não definida", () => {
    const store = createMediaStore({ BLOB_READ_WRITE_TOKEN: "", PRIVATE_OBJECT_DIR: "" });

    expect(store).toBeInstanceOf(LocalDiskStore);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/storage/__tests__/index.test.ts`
Expected: FAIL — `Failed to resolve import "../index"`.

- [ ] **Step 3: Escrever a implementação mínima**

Criar `artifacts/api-server/src/lib/storage/index.ts`:

```ts
import { LocalDiskStore } from "./local-disk";
import { ReplitObjectStore } from "./replit";
import type { MediaStore } from "./types";
import { VercelBlobStore } from "./vercel-blob";

export type { MediaStore };

export function createMediaStore(env: NodeJS.ProcessEnv = process.env): MediaStore {
  if (env.BLOB_READ_WRITE_TOKEN) return new VercelBlobStore();
  if (env.PRIVATE_OBJECT_DIR) return new ReplitObjectStore();
  return new LocalDiskStore();
}

let cached: MediaStore | null = null;

/** Memoized store for the running process. Routes should use this. */
export function mediaStore(): MediaStore {
  if (!cached) cached = createMediaStore();
  return cached;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/storage/__tests__/index.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `pnpm --filter @workspace/api-server test`
Expected: PASS — todos os arquivos de teste, incluindo os anteriores do repositório.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/storage/index.ts artifacts/api-server/src/lib/storage/__tests__/index.test.ts
git commit -m "feat(storage): selecao da implementacao por ambiente"
```

---

## Task 5: Limite de upload configurável

**Files:**
- Create: `artifacts/api-server/src/lib/upload-limit.ts`
- Test: `artifacts/api-server/src/lib/__tests__/upload-limit.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `DEFAULT_MAX_UPLOAD_BYTES: number` (`20 * 1024 * 1024`)
  - `maxUploadBytes(env?: NodeJS.ProcessEnv): number`
  - `uploadTooLargeMessage(bytes: number): string`

**Contexto:** o corpo de requisição de uma função serverless na Vercel é limitado a 4,5 MB. `MAX_UPLOAD_BYTES=4000000` será configurado lá (Task 13). Fora da Vercel o padrão de 20 MB continua valendo.

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/api-server/src/lib/__tests__/upload-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_UPLOAD_BYTES, maxUploadBytes, uploadTooLargeMessage } from "../upload-limit";

describe("maxUploadBytes", () => {
  it("usa 20 MB quando MAX_UPLOAD_BYTES não está definida", () => {
    expect(maxUploadBytes({})).toBe(DEFAULT_MAX_UPLOAD_BYTES);
    expect(DEFAULT_MAX_UPLOAD_BYTES).toBe(20 * 1024 * 1024);
  });

  it("respeita o valor configurado", () => {
    expect(maxUploadBytes({ MAX_UPLOAD_BYTES: "4000000" })).toBe(4000000);
  });

  it("ignora valor inválido e volta ao padrão", () => {
    expect(maxUploadBytes({ MAX_UPLOAD_BYTES: "abc" })).toBe(DEFAULT_MAX_UPLOAD_BYTES);
    expect(maxUploadBytes({ MAX_UPLOAD_BYTES: "0" })).toBe(DEFAULT_MAX_UPLOAD_BYTES);
    expect(maxUploadBytes({ MAX_UPLOAD_BYTES: "-1" })).toBe(DEFAULT_MAX_UPLOAD_BYTES);
    expect(maxUploadBytes({ MAX_UPLOAD_BYTES: "" })).toBe(DEFAULT_MAX_UPLOAD_BYTES);
  });

  it("trunca valor fracionário", () => {
    expect(maxUploadBytes({ MAX_UPLOAD_BYTES: "1500.9" })).toBe(1500);
  });
});

describe("uploadTooLargeMessage", () => {
  it("informa o limite em megabytes, em português", () => {
    expect(uploadTooLargeMessage(4000000)).toBe("Imagem acima do limite de 4 MB.");
    expect(uploadTooLargeMessage(20 * 1024 * 1024)).toBe("Imagem acima do limite de 20 MB.");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/upload-limit.test.ts`
Expected: FAIL — `Failed to resolve import "../upload-limit"`.

- [ ] **Step 3: Escrever a implementação mínima**

Criar `artifacts/api-server/src/lib/upload-limit.ts`:

```ts
const BYTES_PER_MB = 1024 * 1024;

export const DEFAULT_MAX_UPLOAD_BYTES = 20 * BYTES_PER_MB;

export function maxUploadBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MAX_UPLOAD_BYTES;
  if (!raw) return DEFAULT_MAX_UPLOAD_BYTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_UPLOAD_BYTES;
  return Math.floor(parsed);
}

export function uploadTooLargeMessage(bytes: number): string {
  return `Imagem acima do limite de ${Math.round(bytes / BYTES_PER_MB)} MB.`;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/upload-limit.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/upload-limit.ts artifacts/api-server/src/lib/__tests__/upload-limit.test.ts
git commit -m "feat(api): limite de upload configuravel por MAX_UPLOAD_BYTES"
```

---

## Task 6: Rota de anúncios usa `MediaStore`

**Files:**
- Modify: `artifacts/api-server/src/routes/announcements.ts`

**Interfaces:**
- Consumes: `mediaStore()` de `../lib/storage` (Task 4); `maxUploadBytes`, `uploadTooLargeMessage` de `../lib/upload-limit` (Task 5).
- Produces: nada consumido por tarefas posteriores.

**O que muda e por quê:**

1. `mkdirSync` no nível do módulo (linhas 31-34) some. Em filesystem somente-leitura ele derruba a função inteira, inclusive em requisições que não tocam upload. O `LocalDiskStore` já cria o diretório sob demanda.
2. `persistBuffer` / `persistImage` / `deleteLocalImage` somem, substituídos pelo `MediaStore`.
3. `void migrateLegacyImages()` passa a ser condicional: sem isso um `SELECT *` dispara a cada cold start.
4. `upload.single("image")` é envolvido para converter erro do multer em **413** (tamanho) ou **400** (tipo), com mensagem em português.
5. `deleteLocalImage(...)` vira `await mediaStore().remove(...)`.

- [ ] **Step 1: Trocar os imports do topo do arquivo**

Substituir as linhas 1-7 atuais (bloco de imports até `import { ObjectStorageService } ...`) por:

```ts
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { eq, asc, sql } from "drizzle-orm";
import { db, announcementsTable } from "@workspace/db";
import { mediaStore } from "../lib/storage";
import { maxUploadBytes, uploadTooLargeMessage } from "../lib/upload-limit";
```

`fs` e `path` continuam sendo usados por `migrateLegacyImages`.

- [ ] **Step 2: Substituir o bloco de setup e os helpers de imagem**

Apagar tudo entre `const router: IRouter = Router();` e `router.get("/announcements", ...)` — ou seja, o `uploadsDir`/`mkdirSync`, o `multer`, o `objectStorage`, `persistBuffer`, `persistImage`, `deleteLocalImage`, `migrateLegacyImages` e o `void migrateLegacyImages();` — e colocar no lugar:

```ts
const uploadsDir = path.resolve(process.cwd(), "uploads");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes() },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

/**
 * Wraps multer so that its errors become explicit HTTP responses. On Vercel the
 * request body cap is lower than the default limit, so an oversized upload is an
 * expected outcome and must return a message the operator can act on.
 */
function uploadImage(req: Request, res: Response, next: NextFunction): void {
  upload.single("image")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: uploadTooLargeMessage(maxUploadBytes()) });
      return;
    }
    if (err instanceof Error && err.message === "Only image files are allowed") {
      res.status(400).json({ error: "Apenas arquivos de imagem são aceitos." });
      return;
    }
    next(err);
  });
}

async function persistImage(file: Express.Multer.File): Promise<string> {
  return mediaStore().put(file.buffer, file.mimetype, file.originalname);
}

/**
 * One-time migration of images written to local disk before App Storage existed.
 * Gated on PRIVATE_OBJECT_DIR: outside Replit there is no legacy disk to read,
 * and running it would issue a full table scan on every cold start.
 */
async function migrateLegacyImages() {
  const rows = await db.select().from(announcementsTable);
  for (const row of rows) {
    if (!row.imageUrl.startsWith("/api/uploads/")) continue;
    const filename = row.imageUrl.split("/").pop();
    if (!filename) continue;
    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) continue;
    try {
      const storedPath = await mediaStore().put(
        fs.readFileSync(filePath),
        "image/" + path.extname(filename).slice(1),
        filename,
      );
      await db.update(announcementsTable).set({ imageUrl: storedPath }).where(eq(announcementsTable.id, row.id));
    } catch (error) {
      console.error(`Could not migrate announcement image ${row.id}`, error);
    }
  }
}

if (process.env.PRIVATE_OBJECT_DIR) {
  void migrateLegacyImages();
}
```

- [ ] **Step 3: Trocar o middleware nas duas rotas de upload**

Nas rotas `router.post("/announcements", ...)` e `router.patch("/announcements/:id", ...)`, substituir a linha `upload.single("image"),` por:

```ts
  uploadImage,
```

(duas ocorrências, uma em cada rota)

- [ ] **Step 4: Trocar as duas chamadas de remoção**

Na rota `PATCH /announcements/:id`, substituir:

```ts
    if (req.file) {
      deleteLocalImage(existing.imageUrl);
    }
```

por:

```ts
    if (req.file) {
      await mediaStore().remove(existing.imageUrl);
    }
```

Na rota `DELETE /announcements/:id`, substituir:

```ts
  // Delete image file from disk
  deleteLocalImage(row.imageUrl);
```

por:

```ts
  await mediaStore().remove(row.imageUrl);
```

- [ ] **Step 5: Verificar tipos e testes**

Run: `pnpm --filter @workspace/api-server run typecheck && pnpm --filter @workspace/api-server test`
Expected: typecheck sem erro; todos os testes PASS.

- [ ] **Step 6: Confirmar que nenhum resíduo ficou**

Run: `rg "deleteLocalImage|persistBuffer|ObjectStorageService|mkdirSync" artifacts/api-server/src/routes/announcements.ts`
Expected: nenhuma saída.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/announcements.ts
git commit -m "refactor(api): anuncios usam MediaStore e limite de upload explicito"
```

---

## Task 7: Rota de storage sem import estático do Google Cloud

**Files:**
- Modify: `artifacts/api-server/src/routes/storage.ts`

**Interfaces:**
- Consumes: `../lib/objectStorage` por `import()` dinâmico.
- Produces: nada consumido por tarefas posteriores.

**Por quê:** o arquivo hoje importa `ObjectStorageService` estaticamente, e `objectStorage.ts` executa `new Storage({...})` no nível do módulo. Com `@google-cloud/*` externo no bundle da Vercel (Task 10), esse import estático derruba a função no primeiro carregamento. A rota também deve responder 404 quando o backend do Replit não está configurado, em vez de estourar.

- [ ] **Step 1: Reescrever o arquivo inteiro**

Substituir o conteúdo de `artifacts/api-server/src/routes/storage.ts` por:

```ts
import { Readable } from "stream";
import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

// Public read-only serving for announcement images stored in Replit App Storage.
// The @google-cloud/storage client is loaded lazily so that this module can be
// bundled for environments where that package is not installed.
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  if (!process.env.PRIVATE_OBJECT_DIR) {
    res.status(404).json({ error: "Object not found" });
    return;
  }

  const { ObjectNotFoundError, ObjectStorageService } = await import("../lib/objectStorage");

  try {
    const raw = req.params.path;
    const path = Array.isArray(raw) ? raw.join("/") : raw;
    const objectStorage = new ObjectStorageService();
    const file = await objectStorage.getObjectEntityFile(`/objects/${path}`);
    const response = await objectStorage.downloadObject(file, 86400);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving stored image");
    res.status(500).json({ error: "Failed to serve stored image" });
  }
});

export default router;
```

- [ ] **Step 2: Confirmar que não sobrou import estático do objectStorage**

Run: `rg "^import.*objectStorage" artifacts/api-server/src/routes/`
Expected: nenhuma saída.

- [ ] **Step 3: Verificar tipos**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/storage.ts
git commit -m "refactor(api): carregar o Object Storage do Replit sob demanda"
```

---

## Task 8: Validação de `SCAN_SALT` no app, não no entrypoint

**Files:**
- Create: `artifacts/api-server/src/lib/required-env.ts`
- Test: `artifacts/api-server/src/lib/__tests__/required-env.test.ts`
- Modify: `artifacts/api-server/src/app.ts`
- Modify: `artifacts/api-server/src/index.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `assertRequiredEnv(env?: NodeJS.ProcessEnv): void` — lança `Error` se `SCAN_SALT` faltar.

**Por quê:** o `throw` está hoje em `index.ts:4`, que **não roda** em serverless. Na Vercel a ausência da variável passaria despercebida e os scans de QR simplesmente não seriam gravados (`lib/scan-fingerprint.ts` exige o sal). Movendo para `app.ts`, os dois entrypoints validam.

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/api-server/src/lib/__tests__/required-env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertRequiredEnv } from "../required-env";

describe("assertRequiredEnv", () => {
  it("aceita ambiente com SCAN_SALT preenchido", () => {
    expect(() => assertRequiredEnv({ SCAN_SALT: "sal" })).not.toThrow();
  });

  it("rejeita SCAN_SALT ausente", () => {
    expect(() => assertRequiredEnv({})).toThrow(/SCAN_SALT/);
  });

  it("rejeita SCAN_SALT vazio", () => {
    expect(() => assertRequiredEnv({ SCAN_SALT: "" })).toThrow(/SCAN_SALT/);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/required-env.test.ts`
Expected: FAIL — `Failed to resolve import "../required-env"`.

- [ ] **Step 3: Escrever a implementação mínima**

Criar `artifacts/api-server/src/lib/required-env.ts`:

```ts
/**
 * Validated by app.ts so that both the long-running server and the serverless
 * entrypoint fail loudly. A missing SCAN_SALT would otherwise silently stop QR
 * scans from being recorded.
 */
export function assertRequiredEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.SCAN_SALT) {
    throw new Error(
      "SCAN_SALT must be set. Did you forget to configure the QR scan tracking salt?",
    );
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/required-env.test.ts`
Expected: PASS — 3 testes.

- [ ] **Step 5: Chamar a validação em `app.ts`**

Em `artifacts/api-server/src/app.ts`, adicionar o import junto aos demais:

```ts
import { assertRequiredEnv } from "./lib/required-env";
```

e, imediatamente antes de `const app: Express = express();`, adicionar:

```ts
assertRequiredEnv();
```

- [ ] **Step 6: Remover a validação duplicada de `index.ts`**

Em `artifacts/api-server/src/index.ts`, apagar o bloco:

```ts
if (!process.env["SCAN_SALT"]) {
  throw new Error(
    "SCAN_SALT must be set. Did you forget to configure the QR scan tracking salt?",
  );
}
```

O resto do arquivo (validação de `PORT` e `app.listen`) fica intacto.

- [ ] **Step 7: Verificar tipos e testes**

Run: `pnpm --filter @workspace/api-server run typecheck && pnpm --filter @workspace/api-server test`
Expected: typecheck sem erro; testes PASS.

- [ ] **Step 8: Commit**

```bash
git add artifacts/api-server/src/lib/required-env.ts artifacts/api-server/src/lib/__tests__/required-env.test.ts artifacts/api-server/src/app.ts artifacts/api-server/src/index.ts
git commit -m "fix(api): validar SCAN_SALT no app para valer tambem em serverless"
```

---

## Task 9: Origem pública do QR com fallback da Vercel

**Files:**
- Create: `artifacts/api-server/src/lib/public-base-url.ts`
- Test: `artifacts/api-server/src/lib/__tests__/public-base-url.test.ts`
- Modify: `artifacts/api-server/src/routes/qr.ts:27`

**Interfaces:**
- Consumes: nada.
- Produces: `publicBaseUrl(env: NodeJS.ProcessEnv, requestOrigin: string): string` — sempre sem barra no fim.

**Por quê:** sem `PUBLIC_BASE_URL`, o QR usa o host da requisição. Em deploy de preview isso grava uma URL efêmera dentro de um QR que pode ser impresso. `VERCEL_PROJECT_PRODUCTION_URL` é injetada automaticamente pela plataforma e aponta para o domínio estável de produção.

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/api-server/src/lib/__tests__/public-base-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { publicBaseUrl } from "../public-base-url";

describe("publicBaseUrl", () => {
  it("prefere PUBLIC_BASE_URL sobre tudo", () => {
    const base = publicBaseUrl(
      { PUBLIC_BASE_URL: "https://painel.exemplo.com", VERCEL_PROJECT_PRODUCTION_URL: "app.vercel.app" },
      "https://preview-abc.vercel.app",
    );

    expect(base).toBe("https://painel.exemplo.com");
  });

  it("remove a barra final de PUBLIC_BASE_URL", () => {
    expect(publicBaseUrl({ PUBLIC_BASE_URL: "https://painel.exemplo.com/" }, "https://x")).toBe(
      "https://painel.exemplo.com",
    );
  });

  it("usa o domínio de produção da Vercel quando PUBLIC_BASE_URL falta", () => {
    const base = publicBaseUrl(
      { VERCEL_PROJECT_PRODUCTION_URL: "painel.vercel.app" },
      "https://preview-abc.vercel.app",
    );

    expect(base).toBe("https://painel.vercel.app");
  });

  it("cai na origem da requisição quando não há nenhuma variável", () => {
    expect(publicBaseUrl({}, "http://localhost:8080/")).toBe("http://localhost:8080");
  });

  it("trata string vazia como não definida", () => {
    expect(publicBaseUrl({ PUBLIC_BASE_URL: "", VERCEL_PROJECT_PRODUCTION_URL: "" }, "https://x")).toBe(
      "https://x",
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/public-base-url.test.ts`
Expected: FAIL — `Failed to resolve import "../public-base-url"`.

- [ ] **Step 3: Escrever a implementação mínima**

Criar `artifacts/api-server/src/lib/public-base-url.ts`:

```ts
function withoutTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

/**
 * Origin embedded into generated QR codes. A printed QR outlives the deployment
 * that produced it, so an explicit domain always wins over the request host.
 */
export function publicBaseUrl(env: NodeJS.ProcessEnv, requestOrigin: string): string {
  if (env.PUBLIC_BASE_URL) return withoutTrailingSlash(env.PUBLIC_BASE_URL);
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return withoutTrailingSlash(requestOrigin);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/public-base-url.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 5: Usar o helper em `qr.ts`**

Em `artifacts/api-server/src/routes/qr.ts`, adicionar o import:

```ts
import { publicBaseUrl } from "../lib/public-base-url";
```

e substituir as duas linhas:

```ts
    const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const target = `${base.replace(/\/$/, "")}/r/${code}`;
```

por:

```ts
    const base = publicBaseUrl(process.env, `${req.protocol}://${req.get("host")}`);
    const target = `${base}/r/${code}`;
```

- [ ] **Step 6: Verificar tipos e testes**

Run: `pnpm --filter @workspace/api-server run typecheck && pnpm --filter @workspace/api-server test`
Expected: typecheck sem erro; testes PASS.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/lib/public-base-url.ts artifacts/api-server/src/lib/__tests__/public-base-url.test.ts artifacts/api-server/src/routes/qr.ts
git commit -m "feat(api): fallback de dominio de producao da Vercel no QR"
```

---

## Task 10: Entrypoint serverless e bundle da Vercel

**Files:**
- Create: `artifacts/api-server/src/serverless.ts`
- Modify: `artifacts/api-server/build.mjs`
- Modify: `artifacts/api-server/package.json` (script `build:vercel`)
- Modify: `lib/db/src/index.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `app` de `./app` (Task 8 já ajustado).
- Produces: `artifacts/api-server/dist-vercel/index.mjs`, um bundle ESM cujo `export default` é o app Express. A Task 12 copia esse arquivo.

**Contexto:** o launcher `Nodejs` da Vercel invoca o `export default` como `(req, res)`. Um app Express **é** exatamente essa função, então nenhum adaptador é necessário. O alvo `vercel` do build difere do alvo padrão em três pontos: entrypoint sem `listen`, saída em `dist-vercel/`, e sem o plugin do pino (em produção `logger.ts` não usa transport, então não há arquivo de worker a emitir e o bundle fica com um arquivo só).

- [ ] **Step 1: Criar o entrypoint serverless**

Criar `artifacts/api-server/src/serverless.ts`:

```ts
/**
 * Serverless entrypoint. The platform invokes the default export as a
 * (req, res) handler, which an Express app already is — no adapter needed.
 * Unlike index.ts this never binds a port and never requires PORT.
 */
export { default } from "./app";
```

- [ ] **Step 2: Adicionar o alvo `vercel` ao `build.mjs`**

Em `artifacts/api-server/build.mjs`, dentro de `buildAll()`, substituir as três primeiras linhas do corpo da função:

```js
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });
```

por:

```js
  // The Vercel target bundles a port-less entrypoint into its own directory and
  // drops the pino transport plugin: NODE_ENV=production disables pino-pretty,
  // so no worker file needs to be emitted and the output stays a single file.
  const isVercel = process.argv.includes("--vercel");
  const distDir = path.resolve(artifactDir, isVercel ? "dist-vercel" : "dist");
  await rm(distDir, { recursive: true, force: true });
```

Depois, dentro da chamada `esbuild({...})`, substituir:

```js
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
```

por:

```js
    entryPoints: [path.resolve(artifactDir, isVercel ? "src/serverless.ts" : "src/index.ts")],
```

A linha `outdir: distDir,` **não muda** — `distDir` já passou a ser condicional no passo anterior.

Por fim, substituir o bloco de plugins:

```js
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
```

por:

```js
    plugins: isVercel
      ? []
      : [
          // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
          esbuildPluginPino({ transports: ["pino-pretty"] }),
        ],
```

O array `external` fica **inalterado**: `@google-cloud/*` permanece externo, e é justamente por isso que a Task 3 e a Task 7 usam `import()` dinâmico.

- [ ] **Step 3: Adicionar o script de build**

Em `artifacts/api-server/package.json`, dentro de `"scripts"`, adicionar depois de `"build"`:

```json
    "build:vercel": "node ./build.mjs --vercel",
```

- [ ] **Step 4: Limitar o pool do Postgres**

Em `lib/db/src/index.ts`, substituir:

```ts
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

por:

```ts
// One connection per instance: a serverless invocation serves a single request
// at a time, and instance count scales with traffic, so a larger pool only
// multiplies idle connections against the database.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
```

- [ ] **Step 5: Ignorar os artefatos novos**

Em `.gitignore`, na seção `# compiled output`, adicionar depois da linha `dist`:

```
dist-vercel
.vercel
```

- [ ] **Step 6: Rodar o build e verificar a saída**

```bash
pnpm --filter @workspace/api-server run build:vercel
ls artifacts/api-server/dist-vercel
```

Expected: `index.mjs` e `index.mjs.map`, e **nenhum** arquivo de worker do pino.

- [ ] **Step 7: Verificar que o bundle exporta um handler**

```bash
SCAN_SALT=verificacao \
DATABASE_URL=postgres://u:p@localhost:5432/d \
node --input-type=module -e "import('./artifacts/api-server/dist-vercel/index.mjs').then(m => { console.log(typeof m.default); process.exit(typeof m.default === 'function' ? 0 : 1); })"
```

Expected: imprime `function` e sai com código 0. (`new Pool(...)` não conecta na construção, então a URL falsa é suficiente.)

- [ ] **Step 8: Confirmar que o build padrão continua funcionando**

```bash
pnpm --filter @workspace/api-server run build
ls artifacts/api-server/dist
```

Expected: build sem erro; `dist/index.mjs` presente junto dos arquivos do pino.

- [ ] **Step 9: Commit**

```bash
git add artifacts/api-server/src/serverless.ts artifacts/api-server/build.mjs artifacts/api-server/package.json lib/db/src/index.ts .gitignore
git commit -m "feat(api): entrypoint serverless e alvo de build para a Vercel"
```

---

## Task 11: Build do frontend sem envs de desenvolvimento

**Files:**
- Modify: `artifacts/signage/vite.config.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `artifacts/signage/dist/public/` gerado por `pnpm --filter @workspace/signage build` sem nenhuma variável de ambiente. A Task 12 copia esse diretório.

**Por quê:** o `throw` incondicional em `PORT` e `BASE_PATH` impede **qualquer** build de produção, não só o da Vercel. As duas variáveis só fazem sentido em `dev` e `serve`, onde há um servidor escutando. O `defineConfig` recebe o `command` (`"serve"` em dev/preview, `"build"` em build), que é exatamente essa distinção.

- [ ] **Step 1: Trocar a leitura das variáveis por resolução condicional**

Em `artifacts/signage/vite.config.ts`, apagar todo o bloco entre `import runtimeErrorOverlay ...` e `export default defineConfig({`:

```ts
const rawPort = process.env.PORT;

if (!rawPort) { /* ... */ }

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) { /* ... */ }

const basePath = process.env.BASE_PATH;

if (!basePath) { /* ... */ }
```

e colocar no lugar:

```ts
/**
 * PORT and BASE_PATH describe a running dev/preview server. A production build
 * emits static files and has neither, so they are required only for `vite dev`
 * and `vite preview`.
 */
function resolveServerPort(): number {
  const rawPort = process.env.PORT;

  if (!rawPort) {
    throw new Error(
      'PORT environment variable is required but was not provided.',
    );
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  return port;
}
```

- [ ] **Step 2: Tornar a config dependente do comando**

Substituir a assinatura:

```ts
export default defineConfig({
```

por:

```ts
export default defineConfig(async ({ command }) => {
  const port = command === 'serve' ? resolveServerPort() : 0;
  const basePath = process.env.BASE_PATH ?? '/';

  return {
```

e substituir o fechamento do arquivo:

```ts
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
```

por:

```ts
    preview: {
      port,
      host: '0.0.0.0',
      allowedHosts: true,
    },
  };
});
```

Reindentar o corpo do objeto (de `base:` até `preview:`) em dois espaços a mais. As chamadas `await import(...)` dentro do array de plugins continuam válidas porque a função agora é `async`.

- [ ] **Step 3: Verificar que o build funciona sem nenhuma env**

```bash
env -u PORT -u BASE_PATH pnpm --filter @workspace/signage run build
ls artifacts/signage/dist/public
```

Expected: build conclui; `index.html` e `assets/` presentes.

- [ ] **Step 4: Verificar que `dev` ainda exige `PORT`**

```bash
env -u PORT pnpm --filter @workspace/signage exec vite --config vite.config.ts 2>&1 | head -5
```

Expected: falha com `PORT environment variable is required but was not provided.`

- [ ] **Step 5: Verificar tipos**

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/vite.config.ts
git commit -m "fix(signage): exigir PORT e BASE_PATH apenas em dev e preview"
```

---

## Task 12: Script de build e configuração da Vercel

**Files:**
- Create: `scripts/build-vercel.mjs`
- Create: `vercel.json`
- Modify: `package.json` (raiz — campo `engines`)

**Interfaces:**
- Consumes: `pnpm --filter @workspace/signage run build` (Task 11) e `pnpm --filter @workspace/api-server run build:vercel` (Task 10).
- Produces: `.vercel/output/` completo, consumido pela plataforma.

**Contexto:** `scripts/` já é um pacote do workspace (tem `package.json` próprio), mas este script roda como arquivo solto via `node`, sem dependências além da biblioteca padrão. Quando `.vercel/output/` existe ao fim do build, a Vercel usa exclusivamente esse diretório e ignora Output Directory, detecção de framework e descoberta de funções.

- [ ] **Step 1: Escrever o script de build**

Criar `scripts/build-vercel.mjs`:

```js
/**
 * Builds the Vercel deployment output by hand, using the Build Output API v3.
 *
 * Automatic function discovery scans the source `api/` directory, which cannot
 * work here: the API bundle only exists after the build runs. Writing
 * .vercel/output/ explicitly removes every piece of guesswork.
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, ".vercel", "output");
const functionDir = path.join(outputDir, "functions", "api", "index.func");

function run(args) {
  execFileSync("pnpm", args, { cwd: root, stdio: "inherit" });
}

await rm(outputDir, { recursive: true, force: true });

run(["--filter", "@workspace/signage", "run", "build"]);
run(["--filter", "@workspace/api-server", "run", "build:vercel"]);

await mkdir(outputDir, { recursive: true });
await cp(path.join(root, "artifacts/signage/dist/public"), path.join(outputDir, "static"), {
  recursive: true,
});

await mkdir(functionDir, { recursive: true });
await cp(path.join(root, "artifacts/api-server/dist-vercel"), functionDir, { recursive: true });
await writeFile(
  path.join(functionDir, ".vc-config.json"),
  `${JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: true,
    },
    null,
    2,
  )}\n`,
);

await writeFile(
  path.join(outputDir, "config.json"),
  `${JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/api/(.*)", dest: "/api" },
        { src: "/r/(.*)", dest: "/api" },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  )}\n`,
);

console.log("Build output written to .vercel/output");
```

- [ ] **Step 2: Escrever o `vercel.json`**

Criar `vercel.json` na raiz:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "node scripts/build-vercel.mjs",
  "installCommand": "pnpm install --frozen-lockfile",
  "framework": null
}
```

- [ ] **Step 3: Declarar o piso de versão do Node**

Em `package.json` na raiz, adicionar depois de `"license": "MIT",`:

```json
  "engines": {
    "node": ">=22"
  },
```

Um range, não `22.x`: o Replit roda Node 24 (`.replit` declara `nodejs-24`) e uma
faixa fechada em 22 faria o pnpm avisar de incompatibilidade lá. A Vercel escolhe
a maior versão suportada que satisfaz o range, e o runtime da função permanece
fixado em `nodejs22.x` pelo `.vc-config.json`.

- [ ] **Step 4: Rodar o script e conferir a estrutura**

```bash
node scripts/build-vercel.mjs
find .vercel/output -maxdepth 3 -not -path "*/static/assets/*" | sort
```

Expected, entre outras entradas:

```
.vercel/output
.vercel/output/config.json
.vercel/output/functions
.vercel/output/functions/api
.vercel/output/functions/api/index.func
.vercel/output/static
.vercel/output/static/index.html
```

- [ ] **Step 5: Conferir o conteúdo da função**

```bash
ls -a .vercel/output/functions/api/index.func
cat .vercel/output/functions/api/index.func/.vc-config.json
cat .vercel/output/config.json
```

Expected: `index.mjs`, `index.mjs.map` e `.vc-config.json` com `runtime: "nodejs22.x"`; `config.json` com as quatro rotas na ordem `/api`, `/r`, `filesystem`, catch-all.

- [ ] **Step 6: Rodar a suíte inteira e o typecheck do workspace**

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server test
```

Expected: ambos verdes.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-vercel.mjs vercel.json package.json
git commit -m "build: gerar a saida da Vercel pela Build Output API v3"
```

---

## Task 13: Provisionamento, deploy de preview e verificação

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: tudo das tarefas anteriores.
- Produces: um deploy de produção funcionando.

**Esta tarefa envolve ações no painel da Vercel que exigem o usuário.** Onde estiver marcado **[usuário]**, pare e peça. Onde estiver marcado **[agente]**, execute.

- [ ] **Step 1: [usuário] Criar o projeto e provisionar as integrações**

Peça ao usuário que, em <https://vercel.com>:

1. **Add New → Project**, importe o repositório `negoNegoso/Smart-Tv-Ads`, Root Directory `.`, e **não** altere Build/Output Settings — o `vercel.json` já manda.
2. No projeto → **Storage → Create Database → Neon**. Confirme a conexão ao projeto: isso injeta `DATABASE_URL` nos três ambientes.
3. Em **Storage → Create → Blob**, crie o store e conecte ao projeto: isso injeta `BLOB_READ_WRITE_TOKEN`.
4. Confirme em **Settings → Environment Variables** que `DATABASE_URL` e `BLOB_READ_WRITE_TOKEN` aparecem.

Peça também o valor de `SCAN_SALT` e `SESSION_SECRET` que devem ir para produção. **Não reutilize os valores do `.env` local sem o usuário confirmar** — são segredos e o `.env` não está versionado.

- [ ] **Step 2: [agente] Vincular o repositório local ao projeto**

```bash
pnpm dlx vercel@latest link
```

Se pedir login, informe ao usuário que ele deve rodar `! pnpm dlx vercel@latest login` no prompt desta sessão (é interativo).

- [ ] **Step 3: [agente] Configurar as variáveis restantes**

```bash
printf '%s' "<SCAN_SALT>"       | pnpm dlx vercel@latest env add SCAN_SALT production
printf '%s' "<SESSION_SECRET>"  | pnpm dlx vercel@latest env add SESSION_SECRET production
printf '%s' "4000000"           | pnpm dlx vercel@latest env add MAX_UPLOAD_BYTES production
printf '%s' "4000000"           | pnpm dlx vercel@latest env add MAX_UPLOAD_BYTES preview
```

`PUBLIC_BASE_URL` fica para o Step 9, depois que o domínio de produção existir.

- [ ] **Step 4: [agente] Aplicar o schema no Neon**

```bash
pnpm dlx vercel@latest env pull .env.production.local --environment=production
set -a && . ./.env.production.local && set +a && pnpm --filter @workspace/db run push
```

Expected: `drizzle-kit push` cria as tabelas. Um banco novo é esperado estar vazio.

Conferir que a string usa o pooler:

```bash
grep -c -- '-pooler' .env.production.local
```

Expected: `1` ou mais — a `DATABASE_URL` usa o host com sufixo `-pooler`. Se der `0`, avise o usuário: sem o pooler o limite de conexões do Neon é atingido rápido, e a string pooled deve ser copiada do painel do Neon para `DATABASE_URL`.

Confirmar que o arquivo não vaza:

```bash
git check-ignore -v .env.production.local
```

Expected: casa com a regra `.env.*` do `.gitignore`.

- [ ] **Step 5: [agente] Build local antes de gastar deploy**

```bash
pnpm dlx vercel@latest build
```

Expected: conclui sem erro. Corrigir qualquer falha aqui antes de seguir.

- [ ] **Step 6: [agente] Deploy de preview**

```bash
pnpm dlx vercel@latest deploy --prebuilt
```

Anote a URL retornada.

- [ ] **Step 7: [agente] Verificação automatizada do preview**

Com `PREVIEW_URL` sendo a URL do Step 6:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' "$PREVIEW_URL/api/healthz"     # 200
curl -sS "$PREVIEW_URL/api/healthz"                                       # {"status":"ok"}
curl -sS -o /dev/null -w '%{http_code}\n' "$PREVIEW_URL/api/announcements" # 200
curl -sS -o /dev/null -w '%{http_code}\n' "$PREVIEW_URL/clients/1"        # 200 (SPA, não 404)
curl -sS "$PREVIEW_URL/clients/1" | grep -c '<div id="root">'             # 1
```

Expected: os códigos indicados. `/clients/1` retornando 200 com o `#root` prova que o catch-all para `index.html` funciona — é o que faz refresh e link direto pararem de dar 404.

- [ ] **Step 8: [usuário] Verificação manual no preview**

Peça ao usuário que confirme, na URL de preview, nesta ordem:

1. `/clients` carrega e lista dados do Neon.
2. Criar uma peça **com imagem**; a imagem aparece na listagem. (URL da imagem deve começar com `https://` e conter `blob.vercel-storage.com`.)
3. Editar a peça trocando a imagem; a nova aparece.
4. Excluir a peça; ela some da listagem.
5. Tentar subir uma imagem **acima de 4 MB**; erro esperado: `Imagem acima do limite de 4 MB.`
6. `/display/<deviceKey>` roda a playlist.
7. `/api/qr/<CODE>.png` devolve o PNG e o QR aponta para o domínio correto.
8. `/r/<CODE>` redireciona e o scan aparece em `/analytics`.

Só prossiga com o aval explícito do usuário.

- [ ] **Step 9: [agente] Promover para produção e fixar o domínio do QR**

```bash
pnpm dlx vercel@latest --prod
```

Com o domínio de produção retornado:

```bash
printf '%s' "https://<dominio-de-producao>" | pnpm dlx vercel@latest env add PUBLIC_BASE_URL production
pnpm dlx vercel@latest --prod --force
```

O segundo deploy é necessário porque `PUBLIC_BASE_URL` é lida em tempo de execução pela função, e a variável só passa a existir depois do primeiro deploy definir o domínio.

- [ ] **Step 10: [agente] Verificar produção**

```bash
curl -sS "https://<dominio-de-producao>/api/healthz"
```

Expected: `{"status":"ok"}`.

Peça ao usuário para conferir que um QR gerado agora aponta para `https://<dominio-de-producao>/r/<CODE>`.

- [ ] **Step 11: Documentar o deploy no README**

Em `README.md`, adicionar uma seção após a tabela de variáveis de ambiente:

````markdown
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
| `SCAN_SALT` | manual — sem ela a API não sobe |
| `SESSION_SECRET` | manual |
| `PUBLIC_BASE_URL` | manual, domínio de produção; usado no QR |
| `MAX_UPLOAD_BYTES` | `4000000` — o corpo de requisição da função é limitado a 4,5 MB |

`PORT` e `BASE_PATH` **não** são configurados na Vercel: valem apenas para
`vite dev`/`vite preview` e para o `dev.sh`.

### Comandos

```bash
pnpm dlx vercel@latest build            # build local, pega erro sem gastar deploy
pnpm dlx vercel@latest deploy --prebuilt # deploy de preview
pnpm dlx vercel@latest --prod            # produção
```

### Schema do banco

Aplicado manualmente, nunca no build:

```bash
pnpm dlx vercel@latest env pull .env.production.local --environment=production
set -a && . ./.env.production.local && set +a && pnpm --filter @workspace/db run push
```

### Armazenamento de imagens

`MediaStore` (`artifacts/api-server/src/lib/storage/`) escolhe a implementação
por ambiente: `BLOB_READ_WRITE_TOKEN` → Vercel Blob; `PRIVATE_OBJECT_DIR` →
Object Storage do Replit; nenhum dos dois → disco local (`dev.sh`). O deploy
Replit continua funcionando sem mudanças.
````

- [ ] **Step 12: Commit**

```bash
git add README.md
git commit -m "docs: documentar o deploy na Vercel"
```

---

## Auto-revisão

**Cobertura da spec:**

| Seção da spec | Tarefa |
| --- | --- |
| §3.1 Build Output API | 12 |
| §3.2 `scripts/build-vercel.mjs` e `config.json` | 12 |
| §3.3 `serverless.ts` e alvo `vercel` do esbuild | 10 |
| §3.4 `vite.config.ts` sem `PORT`/`BASE_PATH` no build | 11 |
| §4.1 interface `MediaStore` | 1 |
| §4.2 seleção por ambiente | 1, 2, 3, 4 |
| §4.3 `@google-cloud/storage` fora do bundle | 3, 7, 10 |
| §4.4 `mkdirSync` e `migrateLegacyImages` fora do import | 6 |
| §4.5 limite de upload e 413 | 5, 6 |
| §5 Neon, string pooled, `max: 1`, schema manual | 10 (pool), 13 (provisionamento e push) |
| §6 variáveis de ambiente e validação de `SCAN_SALT` | 8, 13 |
| §7 roteiro de verificação | 13 |
| §9 lista de arquivos | todas |

Nenhuma seção sem tarefa. As duas divergências conscientes estão registradas em Global Constraints.

**Placeholders:** nenhum "TBD", "similar à Task N" ou passo sem código. Os únicos valores a preencher em execução são segredos e URLs que só existem depois do provisionamento (`<SCAN_SALT>`, `<dominio-de-producao>`), todos marcados como entrada do usuário na Task 13.

**Consistência de tipos:** `MediaStore.put(buffer, mimetype, originalname) => Promise<string>` e `remove(imageUrl) => Promise<void>` usados de forma idêntica nas Tasks 1-4 e 6. `mediaStore()` (memoizada) é o que as rotas chamam; `createMediaStore(env)` é a versão pura testada. `maxUploadBytes` / `uploadTooLargeMessage` idênticos entre Tasks 5 e 6. `publicBaseUrl(env, requestOrigin)` idêntico entre Task 9 e `qr.ts`. `assertRequiredEnv(env?)` idêntico entre Task 8 e `app.ts`.
