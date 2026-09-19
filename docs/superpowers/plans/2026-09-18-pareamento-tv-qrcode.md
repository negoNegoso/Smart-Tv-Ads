# Pareamento de TV por QR code — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TV abre `/tv`, gera a própria `deviceKey`, mostra um QR; o admin lê o QR, escolhe a empresa e dá nome, e a TV começa a exibir sozinha.

**Architecture:** Sem tabela nem coluna nova. A TV gera a key no formato do servidor, guarda no `localStorage` e consulta o endpoint de slides existente; 404 = "não vinculada" → tela de pareamento com QR servido pela API. O admin cria o device pelo `POST /devices` existente, que passa a aceitar `deviceKey` opcional. Uma página nova `/parear/:key` no painel faz a busca de empresa e o envio.

**Tech Stack:** Express 5 + drizzle (api-server), OpenAPI + orval (api-spec → api-zod / api-client-react), React + wouter + TanStack Query + shadcn (signage), `tv.html` ES5 puro, vitest + supertest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-pareamento-tv-qrcode-design.md`

## Global Constraints

- Formato da key: `^[0-9A-F]{16}$`. Normalização em todo lugar: remover espaços e `-`, depois maiúsculas.
- `tv.html` é ES5: sem `let`/`const`, arrow function, template string, `Promise` nova, classes. Todo `localStorage` dentro de `try/catch`.
- Sem migração: `lib/db/src/schema/` não muda.
- `devices.client_id` continua `NOT NULL`; nenhuma rota existente muda de comportamento quando `deviceKey` não é enviada.
- Textos de interface em português do Brasil, exatamente como no plano.
- `DeviceUpdate` não ganha `deviceKey`.
- Rotas de device ficam atrás de `requireAdmin`; só `GET /api/qr/pair/:key.png` é pública.
- Commits terminam com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Branch: `feat/pareamento-tv-qrcode` (já existe, com a spec commitada).

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `artifacts/api-server/src/lib/device-key.ts` | criar | padrão, normalização e parse da key |
| `artifacts/api-server/src/lib/__tests__/device-key.test.ts` | criar | testes do helper |
| `artifacts/api-server/src/routes/qr.ts` | modificar | `GET /qr/pair/:file` |
| `artifacts/api-server/src/routes/__tests__/qr-pair.test.ts` | criar | testes do QR de pareamento |
| `artifacts/api-server/src/routes/__tests__/gate.test.ts` | modificar | PNG público, `by-key` protegido |
| `lib/api-spec/openapi.yaml` | modificar | `deviceKey` em `DeviceInput`, operação `getDeviceByKey` |
| `lib/api-zod/src/generated/*`, `lib/api-client-react/src/generated/*` | regenerar | saída do orval |
| `artifacts/api-server/src/routes/devices.ts` | modificar | `POST /devices` com key + 409; `GET /devices/by-key/:key` |
| `artifacts/api-server/src/routes/__tests__/devices-pairing.test.ts` | criar | testes das duas rotas |
| `artifacts/signage/public/tv.html` | modificar | resolução da key, tela e polling de pareamento |
| `artifacts/signage/src/__tests__/tv-html.test.ts` | modificar | stub de status HTTP + testes de pareamento |
| `scripts/build-vercel.mjs` | modificar | rota `/tv` → `/tv.html` |
| `artifacts/signage/vite.config.ts` | modificar | `/tv` → `/tv.html` no dev |
| `artifacts/signage/src/lib/companies-api.ts` | modificar | exportar `request` |
| `artifacts/signage/src/lib/pairing-api.ts` | criar | key + chamadas de pareamento no front |
| `artifacts/signage/src/pages/parear.tsx` | criar | página `/parear/:key` |
| `artifacts/signage/src/pages/__tests__/parear.test.tsx` | criar | testes da página |
| `artifacts/signage/src/App.tsx` | modificar | rota `/parear/:key` |
| `README.md` | modificar | documentar `/tv` e `/parear/KEY` |

---

### Task 1: Helper da key + QR de pareamento público

**Files:**
- Create: `artifacts/api-server/src/lib/device-key.ts`
- Create: `artifacts/api-server/src/lib/__tests__/device-key.test.ts`
- Modify: `artifacts/api-server/src/routes/qr.ts`
- Create: `artifacts/api-server/src/routes/__tests__/qr-pair.test.ts`
- Modify: `artifacts/api-server/src/routes/__tests__/gate.test.ts`

**Interfaces:**
- Produces: `DEVICE_KEY_PATTERN: RegExp`, `normalizeDeviceKey(raw: string): string`, `parseDeviceKey(raw: unknown): string | null` em `artifacts/api-server/src/lib/device-key.ts`. Rota pública `GET /api/qr/pair/:KEY.png` → PNG com a URL `${publicBaseUrl}/parear/${KEY}`.

- [ ] **Step 1: Teste do helper (falhando)**

`artifacts/api-server/src/lib/__tests__/device-key.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEVICE_KEY_PATTERN, normalizeDeviceKey, parseDeviceKey } from "../device-key";

describe("device key", () => {
  it("normaliza minúsculas, traços e espaços", () => {
    expect(normalizeDeviceKey("a1b2-c3d4 e5f6-a7b8")).toBe("A1B2C3D4E5F6A7B8");
  });

  it("aceita 16 hex maiúsculos", () => {
    expect(DEVICE_KEY_PATTERN.test("A1B2C3D4E5F6A7B8")).toBe(true);
  });

  it("parse devolve a key normalizada quando válida", () => {
    expect(parseDeviceKey("a1b2-c3d4-e5f6-a7b8")).toBe("A1B2C3D4E5F6A7B8");
  });

  it("parse recusa tamanho errado, fora de hex e não-string", () => {
    expect(parseDeviceKey("A1B2C3D4E5F6A7B")).toBeNull();
    expect(parseDeviceKey("G1B2C3D4E5F6A7B8")).toBeNull();
    expect(parseDeviceKey(42)).toBeNull();
    expect(parseDeviceKey(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/device-key.test.ts`
Expected: FAIL — `Failed to resolve import "../device-key"`.

- [ ] **Step 3: Implementar o helper**

`artifacts/api-server/src/lib/device-key.ts`:

```ts
/** Mesmo formato que `POST /devices` gera: 16 hex maiúsculos. */
export const DEVICE_KEY_PATTERN = /^[0-9A-F]{16}$/;

/**
 * A TV mostra a key em blocos (`A1B2-C3D4-…`) e quem digita à mão pode usar
 * minúsculas: tudo isso é a mesma key.
 */
export function normalizeDeviceKey(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export function parseDeviceKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = normalizeDeviceKey(raw);
  return DEVICE_KEY_PATTERN.test(key) ? key : null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/device-key.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Teste da rota do QR (falhando)**

`artifacts/api-server/src/routes/__tests__/qr-pair.test.ts`:

```ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * QR que a TV não vinculada mostra. O device ainda não existe, então a rota
 * não pode depender do banco — só da key, validada por formato.
 */
const toBuffer = vi.fn();

vi.mock("qrcode", async (importOriginal) => {
  const real = (await importOriginal()) as { default: { toBuffer: (...a: unknown[]) => Promise<Buffer> } };
  return {
    default: {
      toBuffer: (...args: unknown[]) => {
        toBuffer(...args);
        return real.default.toBuffer(...args);
      },
    },
  };
});

vi.mock("@workspace/db", () => ({
  db: { select: () => { throw new Error("QR de pareamento não deve consultar o banco"); } },
  campaignAnnouncementsTable: { id: "id", scanCode: "scanCode" },
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../qr");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(router);
  return app;
}

beforeEach(() => {
  toBuffer.mockReset();
  process.env.PUBLIC_BASE_URL = "https://painel.test";
});

describe("GET /qr/pair/:key.png", () => {
  it("gera PNG apontando para /parear/KEY", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/qr/pair/A1B2C3D4E5F6A7B8.png");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(toBuffer.mock.calls[0][0]).toBe("https://painel.test/parear/A1B2C3D4E5F6A7B8");
  });

  it("normaliza minúsculas e traços", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/qr/pair/a1b2-c3d4-e5f6-a7b8.png");

    expect(res.status).toBe(200);
    expect(toBuffer.mock.calls[0][0]).toBe("https://painel.test/parear/A1B2C3D4E5F6A7B8");
  });

  it("key inválida dá 404", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    expect((await request(app).get("/qr/pair/CURTA.png")).status).toBe(404);
    expect((await request(app).get("/qr/pair/A1B2C3D4E5F6A7B8.jpg")).status).toBe(404);
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/qr-pair.test.ts`
Expected: FAIL — status 404 no primeiro teste (rota não existe).

- [ ] **Step 7: Implementar a rota**

Em `artifacts/api-server/src/routes/qr.ts`, adicionar o import e a rota nova antes de `export default router;`:

```ts
import { parseDeviceKey } from "../lib/device-key";
```

```ts
// QR da TV ainda não vinculada. O device não existe, então não há o que
// consultar: a key valida pelo formato e vira o link da tela de vínculo.
router.get("/qr/pair/:file", async (req, res): Promise<void> => {
  const file = req.params.file;
  const key = file.endsWith(".png") ? parseDeviceKey(file.slice(0, -4)) : null;
  if (!key) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  try {
    const base = publicBaseUrl(process.env, `${req.protocol}://${req.get("host")}`);
    const png = await QRCode.toBuffer(`${base}/parear/${key}`, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
      color: { dark: "#000000", light: "#FFFFFF" },
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(png);
  } catch (error) {
    req.log.error({ err: error }, "Error generating pairing QR code image");
    res.status(500).json({ error: "Failed to generate QR code image" });
  }
});
```

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/qr-pair.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 9: Porteiro — PNG público**

Em `artifacts/api-server/src/routes/__tests__/gate.test.ts`, dentro de `describe("porteiro de rotas", ...)`, adicionar:

```ts
  it("mantém /api/qr/pair público (a TV ainda não vinculada mostra o QR)", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/qr/pair/A1B2C3D4E5F6A7B8.png");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
  });
```

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/gate.test.ts`
Expected: PASS (rota pública já montada via `qrRouter` antes do `loadSession`).

- [ ] **Step 10: Commit**

```bash
git add artifacts/api-server/src/lib/device-key.ts artifacts/api-server/src/lib/__tests__/device-key.test.ts artifacts/api-server/src/routes/qr.ts artifacts/api-server/src/routes/__tests__/qr-pair.test.ts artifacts/api-server/src/routes/__tests__/gate.test.ts
git commit -m "feat(api): QR de pareamento da TV

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Contrato + `POST /devices` com key + `GET /devices/by-key/:key`

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (seção `/devices`, schema `DeviceInput`)
- Regenerate: `lib/api-zod/src/generated/*`, `lib/api-client-react/src/generated/*`
- Modify: `artifacts/api-server/src/routes/devices.ts`
- Create: `artifacts/api-server/src/routes/__tests__/devices-pairing.test.ts`
- Modify: `artifacts/api-server/src/routes/__tests__/gate.test.ts`

**Interfaces:**
- Consumes: `normalizeDeviceKey`, `parseDeviceKey` (Task 1).
- Produces:
  - `POST /api/devices` body `{ clientId: number; name: string; location?: string; deviceKey?: string }` → 201 `Device`; 400 formato; 409 `{ error: "Esta TV já está vinculada." }`.
  - `GET /api/devices/by-key/:key` → 200 `Device` (`{ id, clientId, clientName, name, location, deviceKey, lastSeenAt, createdAt }`), 400 `{ error: "Código de TV inválido." }`, 404 `{ error: "Device not found" }`. Admin.
  - zod gerado: `GetDeviceByKeyResponse`; `CreateDeviceBody` com `deviceKey` opcional.

- [ ] **Step 1: OpenAPI**

Em `lib/api-spec/openapi.yaml`, no `POST /devices` (operationId `createDevice`), acrescentar depois do `"400"`:

```yaml
        "409":
          description: Device key already linked
```

Logo antes da linha `  /devices/{id}:`, inserir o path novo:

```yaml
  /devices/by-key/{key}:
    get:
      operationId: getDeviceByKey
      tags: [devices]
      summary: Find the device that owns a device key (TV pairing)
      parameters:
        - { name: key, in: path, required: true, schema: { type: string } }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Device"
        "400":
          description: Invalid key format
        "404":
          description: Not found

```

Em `components.schemas.DeviceInput`, acrescentar a propriedade:

```yaml
        deviceKey: { type: string, pattern: "^[0-9A-F]{16}$" }
```

- [ ] **Step 2: Regenerar**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: termina sem erro. Conferir:

Run: `grep -n "GetDeviceByKeyResponse\|deviceKey" lib/api-zod/src/generated/api.ts | head`
Expected: aparecem `GetDeviceByKeyResponse` e `deviceKey` dentro de `CreateDeviceBody` com `.regex(`.

- [ ] **Step 3: Testes das rotas (falhando)**

`artifacts/api-server/src/routes/__tests__/devices-pairing.test.ts`:

```ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pareamento: a TV gera a própria key e o admin cria o device com ela. A key
 * precisa chegar intacta ao insert, e uma key que já existe é 409 — o banco é
 * quem garante unicidade (constraint `devices_device_key_unique`).
 */
const dbInsertValues = vi.fn();

let selectResults: unknown[] = [];
let selectCallIndex = 0;
let insertResult: unknown = [];

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    values: (v: unknown) => {
      dbInsertValues(v);
      return chain;
    },
    returning: () => chain,
    then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
      (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject),
  };
  return chain;
}

vi.mock("@workspace/db", () => ({
  db: {
    select: () => makeChain(selectResults[selectCallIndex++]),
    insert: () => makeChain(insertResult),
  },
  devicesTable: { id: "id", clientId: "clientId", deviceKey: "deviceKey" },
  devicePlaylistTable: { id: "id", deviceId: "deviceId" },
  announcementsTable: { id: "id" },
  clientsTable: { id: "id", companyId: "companyId" },
  companiesTable: { id: "id", name: "name" },
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../devices");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(express.json());
  app.use(router);
  return app;
}

const DEVICE = {
  id: 7,
  clientId: 3,
  clientName: "Padaria Central",
  name: "TV do caixa",
  location: null,
  deviceKey: "A1B2C3D4E5F6A7B8",
  lastSeenAt: null,
  createdAt: new Date("2026-09-18T12:00:00Z"),
};

beforeEach(() => {
  selectResults = [];
  selectCallIndex = 0;
  insertResult = [];
  dbInsertValues.mockReset();
});

describe("POST /devices com deviceKey", () => {
  it("usa a key enviada, normalizada", async () => {
    insertResult = [{ id: 7 }];
    selectResults = [[DEVICE]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/devices")
      .send({ clientId: 3, name: "TV do caixa", deviceKey: "a1b2-c3d4-e5f6-a7b8" });

    expect(res.status).toBe(201);
    expect(dbInsertValues.mock.calls[0][0]).toMatchObject({ deviceKey: "A1B2C3D4E5F6A7B8", clientId: 3 });
    expect(res.body.deviceKey).toBe("A1B2C3D4E5F6A7B8");
  });

  it("sem key gera uma no formato de sempre", async () => {
    insertResult = [{ id: 7 }];
    selectResults = [[DEVICE]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/devices").send({ clientId: 3, name: "TV do caixa" });

    expect(res.status).toBe(201);
    expect(dbInsertValues.mock.calls[0][0].deviceKey).toMatch(/^[0-9A-F]{16}$/);
  });

  it("key com formato inválido é 400", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/devices").send({ clientId: 3, name: "TV", deviceKey: "XYZ" });

    expect(res.status).toBe(400);
    expect(dbInsertValues).not.toHaveBeenCalled();
  });

  it("key que já existe é 409", async () => {
    insertResult = Object.assign(new Error("duplicate key"), { code: "23505" });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/devices")
      .send({ clientId: 3, name: "TV", deviceKey: "A1B2C3D4E5F6A7B8" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Esta TV já está vinculada." });
  });
});

describe("GET /devices/by-key/:key", () => {
  it("devolve o device com o nome da empresa", async () => {
    selectResults = [[DEVICE]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/devices/by-key/a1b2-c3d4-e5f6-a7b8");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 7, clientName: "Padaria Central", deviceKey: "A1B2C3D4E5F6A7B8" });
  });

  it("key livre é 404", async () => {
    selectResults = [[]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    expect((await request(app).get("/devices/by-key/A1B2C3D4E5F6A7B8")).status).toBe(404);
  });

  it("formato inválido é 400", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/devices/by-key/CURTA");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Código de TV inválido." });
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/devices-pairing.test.ts`
Expected: FAIL — primeiro teste recebe `deviceKey` gerada em vez da enviada; `by-key` responde 400 do `GetDeviceParams`.

- [ ] **Step 5: Implementar em `devices.ts`**

Imports: acrescentar `GetDeviceByKeyResponse` à lista de `@workspace/api-zod`, e:

```ts
import { normalizeDeviceKey, parseDeviceKey } from "../lib/device-key";

const PG_UNIQUE_VIOLATION = "23505";
```

Substituir o handler `router.post("/devices", ...)` inteiro por:

```ts
// Create device. A TV em pareamento manda a própria key; sem ela, gera aqui.
router.post("/devices", async (req, res): Promise<void> => {
  const body =
    typeof req.body?.deviceKey === "string"
      ? { ...req.body, deviceKey: normalizeDeviceKey(req.body.deviceKey) }
      : req.body;
  const parsed = CreateDeviceBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const deviceKey = parsed.data.deviceKey ?? randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
  let row: { id: number };
  try {
    [row] = await db
      .insert(devicesTable)
      .values({ ...parsed.data, deviceKey })
      .returning();
  } catch (err) {
    // O driver repassa o erro do pg intacto (ver lib/companies/store.ts).
    if ((err as { code?: string })?.code === PG_UNIQUE_VIOLATION) {
      res.status(409).json({ error: "Esta TV já está vinculada." });
      return;
    }
    throw err;
  }
  const withClient = await getDeviceWithClient(row.id);
  res.status(201).json(CreateDeviceResponse.parse(withClient));
});

// Device dono da key. Precisa vir antes de /devices/:id, senão "by-key"
// cai no parse numérico do id.
router.get("/devices/by-key/:key", async (req, res): Promise<void> => {
  const key = parseDeviceKey(req.params.key);
  if (!key) {
    res.status(400).json({ error: "Código de TV inválido." });
    return;
  }
  const rows = await db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      clientName: companiesTable.name,
      name: devicesTable.name,
      location: devicesTable.location,
      deviceKey: devicesTable.deviceKey,
      lastSeenAt: devicesTable.lastSeenAt,
      createdAt: devicesTable.createdAt,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(eq(devicesTable.deviceKey, key));
  if (!rows[0]) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json(GetDeviceByKeyResponse.parse(rows[0]));
});
```

Confirme que o bloco `router.get("/devices/by-key/:key", ...)` fica **acima** de `router.get("/devices/:id", ...)` no arquivo.

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/devices-pairing.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 7: Porteiro — `by-key` exige login**

Em `gate.test.ts`, dentro do mesmo `describe`, adicionar:

```ts
  it("protege /api/devices/by-key sem login", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/devices/by-key/A1B2C3D4E5F6A7B8");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Não autenticado." });
  });
```

- [ ] **Step 8: Suíte da API + typecheck**

Run: `pnpm --filter @workspace/api-server run test && pnpm --filter @workspace/api-server run typecheck`
Expected: tudo PASS, typecheck sem erro.

- [ ] **Step 9: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated artifacts/api-server/src/routes/devices.ts artifacts/api-server/src/routes/__tests__/devices-pairing.test.ts artifacts/api-server/src/routes/__tests__/gate.test.ts
git commit -m "feat(api): criar device com a key da TV e buscar por key

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: TV — key própria, tela e polling de pareamento, link `/tv`

**Files:**
- Modify: `artifacts/signage/public/tv.html`
- Modify: `artifacts/signage/src/__tests__/tv-html.test.ts`
- Modify: `scripts/build-vercel.mjs:104-109`
- Modify: `artifacts/signage/vite.config.ts` (lista `plugins`)

**Interfaces:**
- Consumes: `GET /api/qr/pair/<KEY>.png` (Task 1); `GET /api/display/<KEY>/slides` existente (404 quando não há device).
- Produces: DOM `#pair-screen` (classe `visible` quando pareando), `#pair-qr` (img), `#pair-key`, `#pair-url`; `localStorage['signage.deviceKey']`.

- [ ] **Step 1: Stub com status HTTP + testes (falhando)**

Em `tv-html.test.ts`:

1. Junto das variáveis do topo, acrescentar:

```ts
let statusDaLista = 200;
let gets: string[] = [];
```

2. No `beforeEach`, junto das outras resets: `statusDaLista = 200; gets = []; window.localStorage.clear();`

3. No `XhrStub.send`, trocar o ramo GET por:

```ts
      gets.push(this.url);
      this.readyState = 4;
      this.status = statusDaLista;
      this.responseText = statusDaLista === 200 ? JSON.stringify(listaDeSlides) : "";
      this.onreadystatechange?.();
```

4. No fim do arquivo, adicionar:

```ts
describe("tv.html: pareamento", () => {
  const pareando = () => document.getElementById("pair-screen")!.className === "visible";
  const semKeyNaUrl = () => window.history.replaceState({}, "", "/tv");

  it("sem key na URL gera uma, guarda e usa", () => {
    semKeyNaUrl();
    statusDaLista = 404;
    carregarTv();

    const key = window.localStorage.getItem("signage.deviceKey");
    expect(key).toMatch(/^[0-9A-F]{16}$/);
    expect(gets[0]).toContain(`/api/display/${key}/slides`);
  });

  it("reusa a key guardada", () => {
    semKeyNaUrl();
    window.localStorage.setItem("signage.deviceKey", "A1B2C3D4E5F6A7B8");
    statusDaLista = 404;
    carregarTv();

    expect(gets[0]).toContain("/api/display/A1B2C3D4E5F6A7B8/slides");
  });

  it("key da URL vence a guardada e não é gravada", () => {
    window.localStorage.setItem("signage.deviceKey", "A1B2C3D4E5F6A7B8");
    listaDeSlides = [slide(1, "https://blob/a.png")];
    carregarTv();

    expect(gets[0]).toContain("/api/display/CHAVE/slides");
    expect(window.localStorage.getItem("signage.deviceKey")).toBe("A1B2C3D4E5F6A7B8");
  });

  it("404 mostra QR, key em blocos e link", () => {
    semKeyNaUrl();
    window.localStorage.setItem("signage.deviceKey", "A1B2C3D4E5F6A7B8");
    statusDaLista = 404;
    carregarTv();

    expect(pareando()).toBe(true);
    expect((document.getElementById("pair-qr") as HTMLImageElement).src).toContain(
      "/api/qr/pair/A1B2C3D4E5F6A7B8.png",
    );
    expect(document.getElementById("pair-key")!.textContent).toBe("A1B2-C3D4-E5F6-A7B8");
    expect(document.getElementById("pair-url")!.textContent).toContain("/parear/A1B2C3D4E5F6A7B8");
    expect(document.getElementById("empty-screen")!.className).toBe("");
  });

  it("consulta a cada 5 s e sai do pareamento quando vinculada", () => {
    semKeyNaUrl();
    statusDaLista = 404;
    carregarTv();
    expect(pareando()).toBe(true);

    statusDaLista = 200;
    listaDeSlides = [slide(1, "https://blob/a.png")];
    vi.advanceTimersByTime(5000);
    responder("https://blob/a.png", true);

    expect(pareando()).toBe(false);
    expect(noAr()).toBe("https://blob/a.png");
  });

  it("device apagado: 404 no refresh volta ao pareamento", () => {
    listaDeSlides = [slide(1, "https://blob/a.png")];
    carregarTv();
    responder("https://blob/a.png", true);

    statusDaLista = 404;
    vi.advanceTimersByTime(60000);

    expect(pareando()).toBe(true);
    expect(noAr()).toBeNull();
  });

  it("erro de rede não abre o pareamento", () => {
    semKeyNaUrl();
    statusDaLista = 0;
    carregarTv();

    expect(pareando()).toBe(false);
    expect(document.getElementById("empty-screen")!.className).toBe("visible");
  });

  it("localStorage que lança exceção não quebra a TV", () => {
    semKeyNaUrl();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    statusDaLista = 404;
    carregarTv();

    expect(pareando()).toBe(true);
    expect(gets[0]).toMatch(/\/api\/display\/[0-9A-F]{16}\/slides/);
  });
});
```

E no `afterEach`, acrescentar `vi.restoreAllMocks();`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/__tests__/tv-html.test.ts`
Expected: os 8 testes antigos PASS; os de pareamento FAIL (`pair-screen` não existe / key não gerada).

- [ ] **Step 3: CSS e DOM da tela de pareamento**

Em `tv.html`, no `<style>`, depois da regra `#empty-sub`:

```css
    /* TV sem device: QR para o admin vincular. Acima de tudo, como o aviso. */
    #pair-screen {
      display: none;
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      z-index: 60;
      background: #0b0f19;
      color: #e5e7eb;
      text-align: center;
      padding-top: 6vh;
    }
    #pair-screen.visible { display: block; }
    #pair-title { font-size: 34px; margin-bottom: 24px; }
    #pair-qr { width: 42vh; height: 42vh; background: #fff; }
    #pair-help { font-size: 20px; margin-top: 24px; }
    #pair-key { font-size: 44px; letter-spacing: 6px; font-family: monospace; margin-top: 16px; }
    #pair-url { font-size: 18px; margin-top: 12px; color: #9ca3af; }
```

No `<body>`, logo antes de `<div id="empty-screen">`:

```html
<div id="pair-screen">
  <div id="pair-title">Vincular esta TV</div>
  <img id="pair-qr" alt="" />
  <div id="pair-help">Leia o QR code com o celular do administrador</div>
  <div id="pair-key"></div>
  <div id="pair-url"></div>
</div>
```

- [ ] **Step 4: `xhrGet` entrega o status**

Substituir `xhrGet` por:

```js
      // O status vai junto: 404 significa "TV sem device" (pareamento), que
      // não pode ser confundido com rede fora do ar.
      function xhrGet(url, cb) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) { return; }
          if (xhr.status >= 200 && xhr.status < 300) {
            try { cb(null, JSON.parse(xhr.responseText), xhr.status); }
            catch (e) { cb(e, null, xhr.status); }
          } else {
            cb(new Error('HTTP ' + xhr.status), null, xhr.status);
          }
        };
        xhr.send();
      }
```

- [ ] **Step 5: Resolução da key**

Logo abaixo de `getKey()` (que continua lendo só a URL), adicionar:

```js
      var STORAGE_KEY = 'signage.deviceKey';

      function readStoredKey() {
        try { return window.localStorage.getItem(STORAGE_KEY) || ''; }
        catch (e) { return ''; }
      }

      function storeKey(key) {
        try { window.localStorage.setItem(STORAGE_KEY, key); }
        catch (e) {}
      }

      // Mesmo formato do servidor: 16 hex maiúsculos. TV antiga sem crypto cai
      // no Math.random misturado ao relógio; a unicidade quem garante é o banco.
      function generateKey() {
        var out = '';
        var c = window.crypto || window.msCrypto;
        if (c && c.getRandomValues) {
          var bytes = new Uint8Array(8);
          c.getRandomValues(bytes);
          for (var i = 0; i < bytes.length; i++) {
            out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
          }
        } else {
          var seed = new Date().getTime();
          while (out.length < 16) {
            out += (((Math.random() * 16) ^ (seed >>> ((out.length % 8) * 4))) & 15).toString(16);
          }
        }
        return out.toUpperCase();
      }

      // URL (TVs antigas, não gravada) → guardada → nova, gravada.
      function resolveKey() {
        var fromUrl = getKey();
        if (fromUrl) { return fromUrl; }
        var stored = readStoredKey();
        if (stored) { return stored; }
        var fresh = generateKey();
        storeKey(fresh);
        return fresh;
      }

      var deviceKey = resolveKey();
```

Em `recordImpression`, trocar `var key = getKey();` por `var key = deviceKey;`.

- [ ] **Step 6: Mostrar/esconder pareamento e polling**

Depois de `showEmpty`, adicionar:

```js
      var PAIR_POLL_MS = 5000;
      var pairEl = document.getElementById('pair-screen');
      var pairTimer = null;

      function formatKey(key) {
        return key.match(/.{1,4}/g).join('-');
      }

      // Servidor não conhece a key: sem device ainda, ou device apagado. Tira
      // tudo do ar, mostra o QR e pergunta de novo a cada 5 s.
      function showPairing(key) {
        showEmpty();
        emptyEl.className = '';
        document.getElementById('pair-qr').src = apiBase() + '/api/qr/pair/' + encodeURIComponent(key) + '.png';
        document.getElementById('pair-key').textContent = formatKey(key);
        document.getElementById('pair-url').textContent = apiBase() + '/parear/' + key;
        pairEl.className = 'visible';
        if (!pairTimer) {
          pairTimer = setInterval(function () { fetchAndStart(key, true); }, PAIR_POLL_MS);
        }
      }

      function hidePairing() {
        pairEl.className = '';
        if (pairTimer) { clearInterval(pairTimer); pairTimer = null; }
      }
```

Em `fetchAndStart`, trocar a assinatura do callback e o início dele:

```js
        xhrGet(url, function (err, data, status) {
          if (status === 404) {
            showPairing(key);
            return;
          }
          hidePairing();
```

(o resto do callback — `if (err || !data) {...}` em diante — fica igual.)

Observação: após o pareamento, `slides` está vazio, então o primeiro 200 tem `changed === true` e inicia a exibição mesmo com `isRefresh === true`.

- [ ] **Step 7: `init` usa a key resolvida**

Substituir `init` por:

```js
      function init() {
        fetchAndStart(deviceKey, false);

        // Refresh slide list every 60 s without interrupting current slide
        refreshTimer = setInterval(function () {
          fetchAndStart(deviceKey, true);
        }, 60000);
      }
```

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/__tests__/tv-html.test.ts`
Expected: PASS (16 testes).

Conferir ES5: `grep -nE "\b(let|const)\b|=>|\`" artifacts/signage/public/tv.html`
Expected: nenhuma linha dentro do `<script>` de `tv.html` que você tocou.

- [ ] **Step 9: Link curto `/tv`**

`scripts/build-vercel.mjs`, na lista `routes`, depois de `{ src: "/r/(.*)", dest: "/api" },`:

```js
        // Link curto que o instalador digita no navegador da TV.
        { src: "/tv", dest: "/tv.html" },
```

`artifacts/signage/vite.config.ts`: antes do `export default`, adicionar o plugin (`type Plugin` já é importado de `vite` na linha 4):

```ts
/** `/tv` no dev, igual à rota da Vercel em scripts/build-vercel.mjs. */
function tvShortLink(): Plugin {
  return {
    name: 'signage-tv-short-link',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/tv' || req.url?.startsWith('/tv?')) {
          req.url = `/tv.html${req.url.slice(3)}`;
        }
        next();
      });
    },
  };
}
```

E na lista `plugins`, depois de `socialMetaTags(basePath),`: `tvShortLink(),`.

- [ ] **Step 10: Verificação manual rápida do `/tv`**

Run (com API rodando via `./dev.sh`): `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:21153/tv`
Expected: `200`, e `curl -s http://localhost:21153/tv | grep -c pair-screen` ≥ 1.

- [ ] **Step 11: Commit**

```bash
git add artifacts/signage/public/tv.html artifacts/signage/src/__tests__/tv-html.test.ts scripts/build-vercel.mjs artifacts/signage/vite.config.ts
git commit -m "feat(tv): pareamento por QR com key gerada na TV

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Página admin `/parear/:key`

**Files:**
- Modify: `artifacts/signage/src/lib/companies-api.ts` (exportar `request`)
- Create: `artifacts/signage/src/lib/pairing-api.ts`
- Create: `artifacts/signage/src/pages/parear.tsx`
- Create: `artifacts/signage/src/pages/__tests__/parear.test.tsx`
- Modify: `artifacts/signage/src/App.tsx` (import + rota em `AdminRoutes`)
- Modify: `README.md`

**Interfaces:**
- Consumes: `GET /api/devices/by-key/:key`, `POST /api/devices` (Task 2); `listCompanies({ role: 'client', q })`, `ApiError`, `request` de `companies-api.ts`.
- Produces: `ParearView({ rawKey }: { rawKey: string })` e default `ParearPage` em `pages/parear.tsx`; em `pairing-api.ts`: `normalizeDeviceKey`, `parseDeviceKey`, `formatDeviceKey`, `getDeviceByKey`, `createPairedDevice`, `deviceByKeyQueryKey`, tipo `PairedDevice`.

- [ ] **Step 1: Exportar `request`**

Em `artifacts/signage/src/lib/companies-api.ts`, trocar `async function request<T>(` por `export async function request<T>(`.

- [ ] **Step 2: `pairing-api.ts`**

```ts
import { ApiError, request } from './companies-api';

/** Igual ao servidor (artifacts/api-server/src/lib/device-key.ts). */
const DEVICE_KEY_PATTERN = /^[0-9A-F]{16}$/;

export function normalizeDeviceKey(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function parseDeviceKey(raw: string): string | null {
  const key = normalizeDeviceKey(raw);
  return DEVICE_KEY_PATTERN.test(key) ? key : null;
}

/** `A1B2C3D4E5F6A7B8` → `A1B2-C3D4-E5F6-A7B8`, como a TV mostra. */
export function formatDeviceKey(key: string): string {
  return key.match(/.{1,4}/g)?.join('-') ?? key;
}

export interface PairedDevice {
  id: number;
  clientId: number;
  clientName: string;
  name: string;
  location: string | null;
  deviceKey: string;
}

export const deviceByKeyQueryKey = (key: string) => ['devices', 'by-key', key] as const;

/** `null` = key livre, a TV ainda não foi vinculada. */
export async function getDeviceByKey(key: string): Promise<PairedDevice | null> {
  try {
    return await request<PairedDevice>(`/devices/by-key/${key}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export const createPairedDevice = (input: {
  clientId: number;
  name: string;
  location?: string;
  deviceKey: string;
}) => request<PairedDevice>('/devices', { method: 'POST', body: JSON.stringify(input) });
```

- [ ] **Step 3: Testes da página (falhando)**

`artifacts/signage/src/pages/__tests__/parear.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParearView } from '../parear';

const KEY = 'A1B2C3D4E5F6A7B8';
const COMPANY = { id: 5, name: 'Padaria Central', clientId: 3 };
const DEVICE = {
  id: 7, clientId: 3, clientName: 'Padaria Central', name: 'TV do caixa',
  location: null, deviceKey: KEY, lastSeenAt: null, createdAt: '2026-09-18T12:00:00Z',
};

type Reply = { status: number; body: unknown };

function stubApi(handler: (url: string, init?: RequestInit) => Reply) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const { status, body } = handler(String(url), init);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderView(rawKey = KEY) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ParearView rawKey={rawKey} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('ParearView', () => {
  it('key inválida avisa sem chamar a API', () => {
    const fetchMock = stubApi(() => ({ status: 200, body: {} }));
    renderView('CURTA');
    expect(screen.getByText('Código de TV inválido.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('TV já vinculada mostra a empresa', async () => {
    stubApi(() => ({ status: 200, body: DEVICE }));
    renderView('a1b2-c3d4-e5f6-a7b8');
    expect(await screen.findByText(/já está vinculada a/)).toBeInTheDocument();
    expect(screen.getByText('Padaria Central')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver TV' })).toHaveAttribute('href', '/devices/7');
  });

  it('TV livre mostra o formulário com o código em blocos', async () => {
    stubApi(() => ({ status: 404, body: { error: 'Device not found' } }));
    renderView();
    expect(await screen.findByRole('heading', { name: 'Vincular TV' })).toBeInTheDocument();
    expect(screen.getByText('A1B2-C3D4-E5F6-A7B8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vincular TV' })).toBeDisabled();
  });

  it('envia empresa, nome, local e a key', async () => {
    const fetchMock = stubApi((url, init) => {
      if (url.includes('/devices/by-key/')) return { status: 404, body: {} };
      if (url.includes('/companies')) return { status: 200, body: [COMPANY] };
      if (init?.method === 'POST') return { status: 201, body: DEVICE };
      return { status: 500, body: {} };
    });
    renderView();

    fireEvent.change(await screen.findByLabelText('Empresa'), { target: { value: 'pad' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Padaria Central' }));
    fireEvent.change(screen.getByLabelText('Nome da TV'), { target: { value: 'TV do caixa' } });
    fireEvent.change(screen.getByLabelText('Local (opcional)'), { target: { value: 'Balcão' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vincular TV' }));

    expect(await screen.findByText('TV vinculada! Ela começa a exibir em alguns segundos.')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({
      clientId: 3, name: 'TV do caixa', location: 'Balcão', deviceKey: KEY,
    });
    expect(screen.getByRole('link', { name: 'Ver empresa' })).toHaveAttribute('href', '/companies/5');
  });

  it('busca só empresas com perfil de TV', async () => {
    const fetchMock = stubApi((url) =>
      url.includes('/devices/by-key/') ? { status: 404, body: {} } : { status: 200, body: [] },
    );
    renderView();
    fireEvent.change(await screen.findByLabelText('Empresa'), { target: { value: 'xyz' } });
    expect(await screen.findByText(/Nenhuma empresa com perfil de TV encontrada/)).toBeInTheDocument();
    const companiesCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/companies'))!;
    expect(String(companiesCall[0])).toContain('role=client');
    expect(String(companiesCall[0])).toContain('q=xyz');
  });

  it('409 troca para "já vinculada"', async () => {
    let linked = false;
    stubApi((url, init) => {
      if (url.includes('/devices/by-key/')) return linked ? { status: 200, body: DEVICE } : { status: 404, body: {} };
      if (url.includes('/companies')) return { status: 200, body: [COMPANY] };
      if (init?.method === 'POST') {
        linked = true;
        return { status: 409, body: { error: 'Esta TV já está vinculada.' } };
      }
      return { status: 500, body: {} };
    });
    renderView();

    fireEvent.change(await screen.findByLabelText('Empresa'), { target: { value: 'pad' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Padaria Central' }));
    fireEvent.change(screen.getByLabelText('Nome da TV'), { target: { value: 'TV' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vincular TV' }));

    await waitFor(() => expect(screen.getByText(/já está vinculada a/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/pages/__tests__/parear.test.tsx`
Expected: FAIL — `Failed to resolve import "../parear"`.

- [ ] **Step 5: Implementar `pages/parear.tsx`**

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useRoute } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, listCompanies, type Company } from '@/lib/companies-api';
import {
  createPairedDevice,
  deviceByKeyQueryKey,
  formatDeviceKey,
  getDeviceByKey,
  parseDeviceKey,
  type PairedDevice,
} from '@/lib/pairing-api';

export default function ParearPage() {
  const [, params] = useRoute('/parear/:key');
  return <ParearView rawKey={params?.key ?? ''} />;
}

export function ParearView({ rawKey }: { rawKey: string }) {
  const key = parseDeviceKey(rawKey);
  if (!key) {
    return <Shell><p className="text-destructive">Código de TV inválido.</p></Shell>;
  }
  return <ParearKey deviceKey={key} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md space-y-4 p-4">{children}</div>;
}

function ParearKey({ deviceKey }: { deviceKey: string }) {
  const queryClient = useQueryClient();
  const existing = useQuery({
    queryKey: deviceByKeyQueryKey(deviceKey),
    queryFn: () => getDeviceByKey(deviceKey),
  });
  const [done, setDone] = useState<{ device: PairedDevice; companyId: number } | null>(null);

  if (done) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">Pronto</h1>
        <p>TV vinculada! Ela começa a exibir em alguns segundos.</p>
        <div className="flex flex-col gap-2">
          <Button asChild size="lg"><Link href={`/devices/${done.device.id}`}>Ver TV</Link></Button>
          <Button asChild size="lg" variant="outline"><Link href={`/companies/${done.companyId}`}>Ver empresa</Link></Button>
        </div>
      </Shell>
    );
  }

  if (existing.isLoading) return <Shell><Skeleton className="h-40 w-full" /></Shell>;
  if (existing.isError) return <Shell><p className="text-destructive">Não foi possível consultar a TV.</p></Shell>;

  if (existing.data) {
    const device = existing.data;
    return (
      <Shell>
        <p>
          Esta TV já está vinculada a <strong>{device.clientName}</strong> ({device.name}).
        </p>
        <Button asChild size="lg"><Link href={`/devices/${device.id}`}>Ver TV</Link></Button>
      </Shell>
    );
  }

  return (
    <PairForm
      deviceKey={deviceKey}
      onDone={setDone}
      onConflict={() => queryClient.invalidateQueries({ queryKey: deviceByKeyQueryKey(deviceKey) })}
    />
  );
}

function PairForm({
  deviceKey,
  onDone,
  onConflict,
}: {
  deviceKey: string;
  onDone: (r: { device: PairedDevice; companyId: number }) => void;
  onConflict: () => void;
}) {
  const [search, setSearch] = useState('');
  const [company, setCompany] = useState<Company | null>(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const q = search.trim();

  const companies = useQuery({
    queryKey: ['companies', { role: 'client', q }],
    queryFn: () => listCompanies({ role: 'client', q }),
    enabled: !company && q.length > 0,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createPairedDevice({
        clientId: company!.clientId!,
        name: name.trim(),
        ...(location.trim() ? { location: location.trim() } : {}),
        deviceKey,
      }),
    onSuccess: (device) => onDone({ device, companyId: company!.id }),
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) onConflict();
    },
  });

  const canSubmit = !!company && name.trim().length > 0 && !mutation.isPending;

  return (
    <Shell>
      <h1 className="text-2xl font-semibold">Vincular TV</h1>
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-muted-foreground">Confira com o código na tela da TV</p>
          <p className="font-mono text-2xl tracking-widest">{formatDeviceKey(deviceKey)}</p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label htmlFor="pair-company">Empresa</Label>
        {company ? (
          <div className="flex items-center justify-between rounded-md border p-3">
            <span>{company.name}</span>
            <Button variant="ghost" size="sm" onClick={() => setCompany(null)}>Trocar</Button>
          </div>
        ) : (
          <>
            <Input
              id="pair-company"
              className="h-12"
              placeholder="Buscar pelo nome"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {companies.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma empresa com perfil de TV encontrada. Cadastre em{' '}
                <Link href="/companies" className="underline">Empresas</Link>.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {companies.data?.map((c) => (
                <Button key={c.id} variant="outline" size="lg" className="justify-start" onClick={() => setCompany(c)}>
                  {c.name}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="pair-name">Nome da TV</Label>
        <Input id="pair-name" className="h-12" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="pair-location">Local (opcional)</Label>
        <Input id="pair-location" className="h-12" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>

      {mutation.isError && !(mutation.error instanceof ApiError && mutation.error.status === 409) && (
        <p className="text-destructive">{mutation.error.message}</p>
      )}

      <Button size="lg" className="w-full" disabled={!canSubmit} onClick={() => mutation.mutate()}>
        Vincular TV
      </Button>
    </Shell>
  );
}
```

Nota: a busca devolve só empresas com `clientId` (filtro `role=client`), por isso `company!.clientId!` é seguro.

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/pages/__tests__/parear.test.tsx`
Expected: PASS (6 testes). Se `getByRole('heading', { name: 'Vincular TV' })` colidir com o botão de mesmo texto, é esperado — `heading` e `button` são papéis diferentes.

- [ ] **Step 7: Rota no `App.tsx`**

Import junto dos outros de `./pages`:

```tsx
import ParearPage from './pages/parear';
```

Em `AdminRoutes`, logo depois do bloco `<Route path="/devices/:id">…</Route>`:

```tsx
      <Route path="/parear/:key">
        <Layout><ParearPage /></Layout>
      </Route>
```

- [ ] **Step 8: README**

Em `README.md`, na lista "O frontend possui as principais rotas", depois de `/tv.html?key=DEVICE_KEY`:

```markdown
- `/tv` — link curto para abrir na TV nova: ela gera a própria key e mostra um QR de pareamento
- `/parear/KEY` — tela (admin) aberta pelo QR da TV para vinculá-la a uma empresa
```

- [ ] **Step 9: Suíte do frontend + typecheck + build**

Run: `pnpm --filter @workspace/signage run test && pnpm run typecheck`
Expected: PASS e typecheck sem erro.

Run: `pnpm --filter @workspace/signage run build && pnpm --filter @workspace/api-server run build`
Expected: builds sem erro.

- [ ] **Step 10: Commit**

```bash
git add artifacts/signage/src/lib/companies-api.ts artifacts/signage/src/lib/pairing-api.ts artifacts/signage/src/pages/parear.tsx artifacts/signage/src/pages/__tests__/parear.test.tsx artifacts/signage/src/App.tsx README.md
git commit -m "feat(portal): tela de vínculo da TV pelo QR

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Verificação fim a fim (manual)

**Files:** nenhum.

- [ ] **Step 1:** `./dev.sh` e abrir `http://localhost:21153/tv` numa janela anônima (faz papel da TV). Esperado: tela "Vincular esta TV" com QR, key em blocos e link.
- [ ] **Step 2:** Abrir o link `/parear/<KEY>` mostrado (no celular via IP da máquina, ou outra aba logada como admin). Sem sessão, deve passar pelo `/login` e voltar à página.
- [ ] **Step 3:** Buscar uma empresa com perfil de TV, digitar nome, vincular. Esperado: "TV vinculada!"; em até 5 s a janela anônima sai do QR e exibe a playlist (ou a tela "Nenhum slide configurado" se a playlist estiver vazia).
- [ ] **Step 4:** Recarregar a janela anônima em `/tv`. Esperado: exibe direto, sem QR.
- [ ] **Step 5:** Reabrir `/parear/<KEY>`. Esperado: "Esta TV já está vinculada a …".
- [ ] **Step 6:** Apagar o device no painel. Esperado: em até 60 s a janela anônima volta ao QR com a mesma key.
- [ ] **Step 7:** Abrir `/tv.html?key=<KEY de uma TV antiga>`. Esperado: comportamento de antes.

Relatar o resultado de cada passo; qualquer divergência vira correção antes de abrir o PR.
