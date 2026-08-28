# QR code por peça de campanha e métrica de scans — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir um QR code rastreável em cada peça veiculada por campanha, redirecionar o scan para um destino configurado no painel e apresentar os scans como métrica ao lado das exibições (plays).

**Architecture:** O QR é preso ao par campanha↔peça (`campaign_announcements`), que ganha um código curto imutável (`scan_code`) e uma URL de destino. A API expõe `/r/:code` (redirect público que registra o scan) e `/api/qr/:code.png` (imagem gerada server-side, cacheada para sempre). O player desenha a imagem por cima da peça em tempo de exibição — nada é queimado no arquivo original. As agregações de scans são somadas às de plays nos endpoints de analytics.

**Tech Stack:** Node 20+, pnpm workspace, Express 5, Drizzle ORM (PostgreSQL), Zod, OpenAPI + orval (codegen), React/Vite, Tailwind + shadcn/ui, `qrcode` (nova), `vitest` (nova).

**Spec:** `docs/superpowers/specs/2026-08-28-qrcode-scans-design.md`

## Global Constraints

- Gerenciador de pacotes: **pnpm** apenas. `npm install` e `yarn install` são bloqueados pelo `preinstall`.
- Schema é aplicado com `drizzle-kit push` (`pnpm --filter @workspace/db run push`), **não** com arquivos de migração SQL.
- Textos de interface em **português do Brasil**.
- `artifacts/signage/public/tv.html` roda em navegadores de Smart TV antigos: **apenas ES5** — `var`, `function`, concatenação de string com `+`, `XMLHttpRequest`. Nada de `let`, `const`, arrow function ou template literal nesse arquivo.
- Após mudar `lib/api-spec/openapi.yaml`, rodar `pnpm --filter @workspace/api-spec run codegen`.
- Após mudar `lib/db/src/schema/`, rodar `cd lib/db && npx tsc --build`.
- Validação final de qualquer task: `pnpm run typecheck`.
- IP bruto do visitante **nunca** é persistido. Só o hash com sal.
- Commits em português, seguindo o padrão do repositório (`feat:`, `fix:`, `docs:`, `refactor:`).

---

### Task 1: Infra de testes + gerador de `scanCode`

Primeiro runner de testes do repositório. O gerador vai em `@workspace/db` (e não no api-server) porque tanto a API quanto o script de backfill precisam dele; fica em um subpath export próprio para não arrastar a conexão com o banco — `lib/db/src/index.ts` lança erro se `DATABASE_URL` não estiver definida, o que quebraria os testes.

**Files:**
- Create: `lib/db/src/scan-code.ts`
- Modify: `lib/db/package.json` (bloco `exports`)
- Modify: `artifacts/api-server/package.json` (devDependency `vitest`, script `test`)
- Create: `artifacts/api-server/vitest.config.ts`
- Test: `artifacts/api-server/src/lib/__tests__/scan-code.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `generateScanCode(): string` — 8 caracteres do alfabeto base62 (`0-9A-Za-z`), importável via `import { generateScanCode } from "@workspace/db/scan-code"`.

- [ ] **Step 1: Adicionar vitest e o script de teste**

Em `artifacts/api-server/package.json`, adicionar em `scripts`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

E em `devDependencies`:

```json
    "vitest": "^3.2.4"
```

Instalar: `pnpm install`

- [ ] **Step 2: Criar a config do vitest**

Criar `artifacts/api-server/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Adicionar o subpath export em `lib/db/package.json`**

No bloco `exports`, que hoje é:

```json
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts"
  },
```

Passar a ser:

```json
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts",
    "./scan-code": "./src/scan-code.ts"
  },
```

- [ ] **Step 4: Escrever o teste que falha**

Criar `artifacts/api-server/src/lib/__tests__/scan-code.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateScanCode } from "@workspace/db/scan-code";

describe("generateScanCode", () => {
  it("gera 8 caracteres", () => {
    expect(generateScanCode()).toHaveLength(8);
  });

  it("usa apenas o alfabeto base62", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateScanCode()).toMatch(/^[0-9A-Za-z]{8}$/);
    }
  });

  it("não colide em 10.000 gerações", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) {
      codes.add(generateScanCode());
    }
    expect(codes.size).toBe(10_000);
  });
});
```

- [ ] **Step 5: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @workspace/api-server run test`
Expected: FAIL — `Cannot find module '@workspace/db/scan-code'`

- [ ] **Step 6: Implementar o gerador**

Criar `lib/db/src/scan-code.ts`:

```ts
import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CODE_LENGTH = 8;
// 256 % 62 = 8, então bytes >= 248 são descartados para evitar viés de módulo.
const MAX_UNBIASED_BYTE = 248;

export function generateScanCode(): string {
  let code = "";
  while (code.length < CODE_LENGTH) {
    const bytes = randomBytes(CODE_LENGTH);
    for (const byte of bytes) {
      if (byte >= MAX_UNBIASED_BYTE) continue;
      code += ALPHABET[byte % ALPHABET.length];
      if (code.length === CODE_LENGTH) break;
    }
  }
  return code;
}
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS — 3 testes

- [ ] **Step 8: Commit**

```bash
git add lib/db/src/scan-code.ts lib/db/package.json artifacts/api-server/package.json artifacts/api-server/vitest.config.ts artifacts/api-server/src/lib/__tests__/scan-code.test.ts pnpm-lock.yaml
git commit -m "feat(db): gerador de scanCode base62 e infra de testes com vitest"
```

---

### Task 2: Detecção de bot, fingerprint e cálculo de taxa

Três funções puras, todas no api-server. São exatamente os pontos onde um erro contamina silenciosamente o número entregue ao anunciante.

**Files:**
- Create: `artifacts/api-server/src/lib/bot-detect.ts`
- Create: `artifacts/api-server/src/lib/scan-fingerprint.ts`
- Create: `artifacts/api-server/src/lib/scan-rate.ts`
- Test: `artifacts/api-server/src/lib/__tests__/bot-detect.test.ts`
- Test: `artifacts/api-server/src/lib/__tests__/scan-fingerprint.test.ts`
- Test: `artifacts/api-server/src/lib/__tests__/scan-rate.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `isBotUserAgent(userAgent: string | undefined | null): boolean`
  - `fingerprintFor(ip: string, userAgent: string | undefined | null): string` — SHA-256 hex; lê o sal de `process.env.SCAN_SALT`
  - `scanRate(scans: number, plays: number): number` — fração (não percentual); `0` quando `plays <= 0`

- [ ] **Step 1: Escrever os testes que falham**

Criar `artifacts/api-server/src/lib/__tests__/bot-detect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isBotUserAgent } from "../bot-detect";

describe("isBotUserAgent", () => {
  it("classifica previews e crawlers como bot", () => {
    expect(isBotUserAgent("facebookexternalhit/1.1")).toBe(true);
    expect(isBotUserAgent("WhatsApp/2.23.20.0")).toBe(true);
    expect(isBotUserAgent("Twitterbot/1.0")).toBe(true);
    expect(isBotUserAgent("Slackbot-LinkExpanding 1.0")).toBe(true);
    expect(isBotUserAgent("curl/8.4.0")).toBe(true);
    expect(isBotUserAgent("Googlebot/2.1")).toBe(true);
  });

  it("não classifica navegadores reais como bot", () => {
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe(false);
  });

  it("trata user-agent ausente como bot", () => {
    expect(isBotUserAgent(undefined)).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
  });
});
```

Criar `artifacts/api-server/src/lib/__tests__/scan-fingerprint.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fingerprintFor } from "../scan-fingerprint";

const UA = "Mozilla/5.0 (iPhone) Safari/604.1";

describe("fingerprintFor", () => {
  beforeEach(() => {
    process.env.SCAN_SALT = "sal-de-teste";
  });

  afterEach(() => {
    delete process.env.SCAN_SALT;
  });

  it("é determinístico para o mesmo par ip + user-agent", () => {
    expect(fingerprintFor("203.0.113.9", UA)).toBe(fingerprintFor("203.0.113.9", UA));
  });

  it("muda quando o ip muda", () => {
    expect(fingerprintFor("203.0.113.9", UA)).not.toBe(fingerprintFor("203.0.113.10", UA));
  });

  it("muda quando o sal muda", () => {
    const comSalDeTeste = fingerprintFor("203.0.113.9", UA);
    process.env.SCAN_SALT = "outro-sal";
    expect(fingerprintFor("203.0.113.9", UA)).not.toBe(comSalDeTeste);
  });

  it("não vaza o ip no valor gerado", () => {
    expect(fingerprintFor("203.0.113.9", UA)).not.toContain("203.0.113.9");
    expect(fingerprintFor("203.0.113.9", UA)).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

Criar `artifacts/api-server/src/lib/__tests__/scan-rate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scanRate } from "../scan-rate";

describe("scanRate", () => {
  it("divide scans por exibições", () => {
    expect(scanRate(5, 1000)).toBeCloseTo(0.005, 10);
  });

  it("retorna 0 quando não há exibições", () => {
    expect(scanRate(3, 0)).toBe(0);
    expect(scanRate(0, 0)).toBe(0);
  });

  it("retorna 0 quando exibições é negativo", () => {
    expect(scanRate(3, -1)).toBe(0);
  });

  it("retorna 0 quando não há scans", () => {
    expect(scanRate(0, 500)).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `pnpm --filter @workspace/api-server run test`
Expected: FAIL — `Failed to resolve import "../bot-detect"` e equivalentes

- [ ] **Step 3: Implementar as três funções**

Criar `artifacts/api-server/src/lib/bot-detect.ts`:

```ts
const BOT_PATTERNS = [
  "bot",
  "crawler",
  "spider",
  "preview",
  "facebookexternalhit",
  "whatsapp",
  "telegram",
  "slack",
  "discord",
  "curl",
  "wget",
  "python-requests",
  "headlesschrome",
];

export function isBotUserAgent(userAgent: string | undefined | null): boolean {
  if (!userAgent) return true;
  const value = userAgent.toLowerCase();
  return BOT_PATTERNS.some((pattern) => value.includes(pattern));
}
```

Criar `artifacts/api-server/src/lib/scan-fingerprint.ts`:

```ts
import { createHash } from "node:crypto";

export function fingerprintFor(ip: string, userAgent: string | undefined | null): string {
  const salt = process.env.SCAN_SALT ?? "";
  return createHash("sha256").update(`${salt}|${ip}|${userAgent ?? ""}`).digest("hex");
}
```

Criar `artifacts/api-server/src/lib/scan-rate.ts`:

```ts
export function scanRate(scans: number, plays: number): number {
  if (!plays || plays <= 0) return 0;
  return scans / plays;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS — todos os arquivos de teste

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/bot-detect.ts artifacts/api-server/src/lib/scan-fingerprint.ts artifacts/api-server/src/lib/scan-rate.ts artifacts/api-server/src/lib/__tests__
git commit -m "feat(api): detecção de bot, fingerprint com sal e cálculo de taxa de scan"
```

---

### Task 3: Schema — colunas de QR e tabela `scans`

`scan_code` fica **nullable** no schema. Motivo: `drizzle-kit push` não consegue adicionar uma coluna `NOT NULL UNIQUE` a uma tabela que já tem linhas. O código sempre preenche o valor no insert, e o backfill preenche os vínculos existentes; o resto do sistema trata `null` como "sem QR", que é o mesmo caminho de `destination_url` nulo.

**Files:**
- Modify: `lib/db/src/schema/campaign_announcements.ts`
- Create: `lib/db/src/schema/scans.ts`
- Modify: `lib/db/src/schema/index.ts`
- Create: `scripts/src/backfill-scan-codes.ts`
- Modify: `scripts/package.json`

**Interfaces:**
- Consumes: `generateScanCode()` da Task 1.
- Produces: `scansTable` exportada de `@workspace/db`, com as colunas `id`, `campaignAnnouncementId`, `campaignId`, `announcementId`, `visitorId`, `fingerprint`, `userAgent`, `isBot`, `createdAt`. `campaignAnnouncementsTable.scanCode` e `.destinationUrl`.

- [ ] **Step 1: Adicionar as colunas em `campaign_announcements`**

Substituir o conteúdo de `lib/db/src/schema/campaign_announcements.ts`:

```ts
import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { campaignsTable } from "./campaigns";
import { announcementsTable } from "./announcements";

export const campaignAnnouncementsTable = pgTable(
  "campaign_announcements",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
    announcementId: integer("announcement_id").notNull().references(() => announcementsTable.id, { onDelete: "cascade" }),
    scanCode: text("scan_code").unique(),
    destinationUrl: text("destination_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("campaign_announcement_unique").on(t.campaignId, t.announcementId)],
);

export type CampaignAnnouncement = typeof campaignAnnouncementsTable.$inferSelect;
```

- [ ] **Step 2: Criar a tabela `scans`**

Criar `lib/db/src/schema/scans.ts`:

```ts
import { pgTable, serial, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { campaignsTable } from "./campaigns";
import { announcementsTable } from "./announcements";
import { campaignAnnouncementsTable } from "./campaign_announcements";

export const scansTable = pgTable(
  "scans",
  {
    id: serial("id").primaryKey(),
    campaignAnnouncementId: integer("campaign_announcement_id").references(() => campaignAnnouncementsTable.id, { onDelete: "set null" }),
    campaignId: integer("campaign_id").references(() => campaignsTable.id, { onDelete: "set null" }),
    announcementId: integer("announcement_id").references(() => announcementsTable.id, { onDelete: "set null" }),
    visitorId: text("visitor_id"),
    fingerprint: text("fingerprint"),
    userAgent: text("user_agent"),
    isBot: boolean("is_bot").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("scans_campaign_created_idx").on(t.campaignId, t.createdAt),
    index("scans_announcement_created_idx").on(t.announcementId, t.createdAt),
  ],
);

export type Scan = typeof scansTable.$inferSelect;
```

- [ ] **Step 3: Exportar a tabela nova**

Em `lib/db/src/schema/index.ts`, adicionar ao final:

```ts
export * from "./scans";
```

- [ ] **Step 4: Compilar a lib e aplicar o schema**

Run:
```bash
cd lib/db && npx tsc --build && cd ../..
pnpm --filter @workspace/db run push
```
Expected: `drizzle-kit` reporta a criação da tabela `scans` e das colunas `scan_code` / `destination_url`.

- [ ] **Step 5: Escrever o script de backfill**

Criar `scripts/src/backfill-scan-codes.ts`:

```ts
import { db, pool, campaignAnnouncementsTable } from "@workspace/db";
import { generateScanCode } from "@workspace/db/scan-code";
import { eq, isNull } from "drizzle-orm";

async function main() {
  const pendentes = await db
    .select({ id: campaignAnnouncementsTable.id })
    .from(campaignAnnouncementsTable)
    .where(isNull(campaignAnnouncementsTable.scanCode));

  let atualizados = 0;
  for (const linha of pendentes) {
    await db
      .update(campaignAnnouncementsTable)
      .set({ scanCode: generateScanCode() })
      .where(eq(campaignAnnouncementsTable.id, linha.id));
    atualizados += 1;
  }

  console.log(`Backfill concluído. Vínculos com scanCode gerado: ${atualizados}`);
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
```

Em `scripts/package.json`, adicionar em `scripts`:

```json
    "backfill:scan-codes": "tsx ./src/backfill-scan-codes.ts",
```

- [ ] **Step 6: Rodar o backfill e conferir o resultado**

Run: `pnpm --filter @workspace/scripts run backfill:scan-codes`
Expected: imprime `Backfill concluído. Vínculos com scanCode gerado: N`

Conferir no banco que não sobrou nenhum nulo:
```bash
psql "$DATABASE_URL" -c "select count(*) from campaign_announcements where scan_code is null;"
```
Expected: `0`

- [ ] **Step 7: Commit**

```bash
git add lib/db/src/schema scripts/src/backfill-scan-codes.ts scripts/package.json
git commit -m "feat(db): scan_code e destination_url no vínculo campanha-peça, tabela scans"
```

---

### Task 4: Endpoint público `/r/:code`

Fica fora do prefixo `/api` para o QR ficar com menos módulos e mais legível de longe. `cookie-parser` já é dependência do api-server — basta aplicá-lo neste router.

**Files:**
- Create: `artifacts/api-server/src/routes/redirect.ts`
- Modify: `artifacts/api-server/src/app.ts`
- Modify: `artifacts/signage/vite.config.ts:75-80` (proxy de desenvolvimento)

**Interfaces:**
- Consumes: `scansTable`, `campaignAnnouncementsTable` (Task 3); `isBotUserAgent`, `fingerprintFor` (Task 2).
- Produces: rota `GET /r/:code` → `302` para `destination_url`, ou `404`. Cookie `sc_v` com UUID do visitante.

- [ ] **Step 1: Escrever o router de redirect**

Criar `artifacts/api-server/src/routes/redirect.ts`:

```ts
import { Router, type IRouter } from "express";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, campaignAnnouncementsTable, scansTable } from "@workspace/db";
import { isBotUserAgent } from "../lib/bot-detect";
import { fingerprintFor } from "../lib/scan-fingerprint";
import { logger } from "../lib/logger";

const VISITOR_COOKIE = "sc_v";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const router: IRouter = Router();

router.use(cookieParser());

router.get("/:code", async (req, res): Promise<void> => {
  const code = req.params.code;

  const [link] = await db
    .select()
    .from(campaignAnnouncementsTable)
    .where(eq(campaignAnnouncementsTable.scanCode, code));

  if (!link || !link.destinationUrl) {
    res.status(404).send("Código inválido");
    return;
  }

  let visitorId = req.cookies?.[VISITOR_COOKIE] as string | undefined;
  if (!visitorId) {
    visitorId = randomUUID();
    res.cookie(VISITOR_COOKIE, visitorId, {
      maxAge: ONE_YEAR_MS,
      httpOnly: true,
      sameSite: "lax",
    });
  }

  const userAgent = req.get("user-agent") ?? null;
  const ip = req.ip ?? "";

  try {
    await db.insert(scansTable).values({
      campaignAnnouncementId: link.id,
      campaignId: link.campaignId,
      announcementId: link.announcementId,
      visitorId,
      fingerprint: fingerprintFor(ip, userAgent),
      userAgent,
      isBot: isBotUserAgent(userAgent),
    });
  } catch (error) {
    // O redirect do usuário final nunca pode quebrar por falha de registro.
    logger.error({ err: error, code }, "Falha ao registrar scan");
  }

  res.redirect(302, link.destinationUrl);
});

export default router;
```

- [ ] **Step 2: Montar o router antes do `/api`**

Em `artifacts/api-server/src/app.ts`, adicionar o import junto dos demais:

```ts
import redirectRouter from "./routes/redirect";
```

E montar logo antes da linha `app.use("/api", router);`:

```ts
app.use("/r", redirectRouter);
app.use("/api", router);
```

- [ ] **Step 3: Encaminhar `/r` no proxy de desenvolvimento**

Todo o frontend assume que a API está na mesma origem (`/api` relativo, tanto no painel quanto no `tv.html`). Em desenvolvimento isso funciona pelo proxy do Vite, que hoje só cobre `/api`. Em `artifacts/signage/vite.config.ts`, no bloco `proxy`, adicionar a segunda entrada:

```ts
    proxy: {
      '/api': {
        target: process.env.API_PROXY ?? 'http://localhost:8080',
        changeOrigin: true,
      },
      '/r': {
        target: process.env.API_PROXY ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
```

Sem isso, o QR escaneado a partir do painel local aponta para `http://localhost:21153/r/CODE` e devolve a página do frontend em vez do redirect.

- [ ] **Step 4: Subir a API e testar o caminho feliz**

Preparar um vínculo com destino, usando um `scan_code` real do banco:

```bash
psql "$DATABASE_URL" -c "update campaign_announcements set destination_url = 'https://example.com/oferta' where id = (select min(id) from campaign_announcements) returning scan_code;"
```

Subir a API (`pnpm --filter @workspace/api-server run dev`) e rodar, trocando `CODE` pelo valor retornado:

```bash
curl -i "http://localhost:8080/r/CODE"
```
Expected: `HTTP/1.1 302`, header `Location: https://example.com/oferta` e header `Set-Cookie: sc_v=...`

- [ ] **Step 5: Testar os 404**

```bash
curl -i "http://localhost:8080/r/naoexiste"
```
Expected: `HTTP/1.1 404`

```bash
psql "$DATABASE_URL" -c "update campaign_announcements set destination_url = null where id = (select min(id) from campaign_announcements) returning scan_code;"
curl -i "http://localhost:8080/r/CODE"
```
Expected: `HTTP/1.1 404` (vínculo sem destino não redireciona)

Restaurar o destino depois do teste:
```bash
psql "$DATABASE_URL" -c "update campaign_announcements set destination_url = 'https://example.com/oferta' where id = (select min(id) from campaign_announcements);"
```

- [ ] **Step 6: Testar a contagem bruta e a de únicos**

```bash
curl -s -c /tmp/qr-cookie.txt -o /dev/null -A "Mozilla/5.0 (iPhone) Safari/604.1" "http://localhost:8080/r/CODE"
curl -s -b /tmp/qr-cookie.txt -o /dev/null -A "Mozilla/5.0 (iPhone) Safari/604.1" "http://localhost:8080/r/CODE"
psql "$DATABASE_URL" -c "select count(*) as bruto, count(distinct coalesce(visitor_id, fingerprint)) as unicos, bool_or(is_bot) as tem_bot from scans where is_bot = false;"
```
Expected: `bruto = 2`, `unicos = 1`

E o registro de bot, que não deve entrar na conta:
```bash
curl -s -o /dev/null -A "facebookexternalhit/1.1" "http://localhost:8080/r/CODE"
psql "$DATABASE_URL" -c "select count(*) filter (where is_bot) as bots, count(*) filter (where not is_bot) as humanos from scans;"
```
Expected: `bots = 1`, `humanos = 2`

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/redirect.ts artifacts/api-server/src/app.ts artifacts/signage/vite.config.ts
git commit -m "feat(api): endpoint público /r/:code que registra scan e redireciona"
```

---

### Task 5: Endpoint da imagem do QR

**Files:**
- Create: `artifacts/api-server/src/routes/qr.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Modify: `artifacts/api-server/package.json`

**Interfaces:**
- Consumes: `campaignAnnouncementsTable` (Task 3).
- Produces: rota `GET /api/qr/:code.png` → PNG do QR apontando para `${PUBLIC_BASE_URL}/r/${code}`.

- [ ] **Step 1: Instalar a dependência `qrcode`**

```bash
pnpm --filter @workspace/api-server add qrcode
pnpm --filter @workspace/api-server add -D @types/qrcode
```

- [ ] **Step 2: Escrever o router**

Criar `artifacts/api-server/src/routes/qr.ts`:

```ts
import { Router, type IRouter } from "express";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { db, campaignAnnouncementsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/qr/:file", async (req, res): Promise<void> => {
  const file = req.params.file;
  if (!file.endsWith(".png")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const code = file.slice(0, -4);

  const [link] = await db
    .select({ id: campaignAnnouncementsTable.id })
    .from(campaignAnnouncementsTable)
    .where(eq(campaignAnnouncementsTable.scanCode, code));

  if (!link) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const target = `${base.replace(/\/$/, "")}/r/${code}`;

  const png = await QRCode.toBuffer(target, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(png);
});

export default router;
```

- [ ] **Step 3: Registrar o router**

Em `artifacts/api-server/src/routes/index.ts`, adicionar o import junto dos demais e o `router.use` antes do `export default`:

```ts
import qrRouter from "./qr";
```

```ts
router.use(qrRouter);
```

- [ ] **Step 4: Testar a imagem**

```bash
curl -i "http://localhost:8080/api/qr/CODE.png" -o /tmp/qr.png -D /tmp/qr-headers.txt
grep -i "content-type\|cache-control" /tmp/qr-headers.txt
file /tmp/qr.png
```
Expected: `content-type: image/png`, `cache-control: public, max-age=31536000, immutable`, e `file` reportando `PNG image data, 512 x 512`.

Abrir `/tmp/qr.png` e escanear com o celular.
Expected: abre `https://example.com/oferta`.

- [ ] **Step 5: Testar o 404**

```bash
curl -i -o /dev/null -w "%{http_code}\n" "http://localhost:8080/api/qr/naoexiste.png"
```
Expected: `404`

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/qr.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/package.json pnpm-lock.yaml
git commit -m "feat(api): endpoint /api/qr/:code.png com cache imutável"
```

---

### Task 6: URL de destino na API de campanhas

O formulário de campanha manda um mapa `announcementDestinations` (chave = id da peça em string, valor = URL ou string vazia). O `scanCode` passa a ser gerado no insert do vínculo, e a campanha devolve `announcementLinks` para a interface montar QR e métricas.

**Files:**
- Modify: `artifacts/api-server/src/routes/advertisers.ts:24-57` (`campaignInput`, `campaignSelection`), `:179-194` (POST), `:234-251` (PATCH)

**Interfaces:**
- Consumes: `generateScanCode()` (Task 1); colunas da Task 3.
- Produces: campo `announcementLinks` em toda resposta de campanha, no formato
  `Array<{ announcementId: number; title: string; scanCode: string | null; destinationUrl: string | null; plays: number; scans: number }>`.
  Entrada nova aceita em `POST /api/campaigns` e `PATCH /api/campaigns/:id`: `announcementDestinations: Record<string, string>`.

- [ ] **Step 1: Aceitar os destinos na entrada**

Em `artifacts/api-server/src/routes/advertisers.ts`, adicionar o import do gerador junto aos demais imports:

```ts
import { generateScanCode } from "@workspace/db/scan-code";
```

E no objeto `campaignInput`, adicionar a chave:

```ts
  announcementDestinations: z.record(z.string(), z.string().trim()).default({}),
```

- [ ] **Step 2: Expor os vínculos na seleção de campanha**

Em `campaignSelection`, adicionar a chave `announcementLinks` (mantendo todas as existentes):

```ts
  announcementLinks: sql<Array<{ announcementId: number; title: string; scanCode: string | null; destinationUrl: string | null; plays: number; scans: number }>>`coalesce((select json_agg(json_build_object(
    'announcementId', an.id,
    'title', an.title,
    'scanCode', cn.scan_code,
    'destinationUrl', cn.destination_url,
    'plays', (select count(*)::int from plays p where p.campaign_id = ${campaignsTable.id} and p.announcement_id = an.id),
    'scans', (select count(*)::int from scans s where s.campaign_id = ${campaignsTable.id} and s.announcement_id = an.id and s.is_bot = false)
  ) order by an.title) from campaign_announcements cn join announcements an on an.id = cn.announcement_id where cn.campaign_id = ${campaignsTable.id}), '[]'::json)`,
  scans: sql<number>`(select count(*)::int from scans s where s.campaign_id = ${campaignsTable.id} and s.is_bot = false)`,
```

- [ ] **Step 3: Escrever o helper de sincronização de destinos**

Ainda em `advertisers.ts`, logo abaixo de `announcementIdsFor`:

```ts
async function syncAnnouncementDestinations(campaignId: number, destinations: Record<string, string>) {
  for (const [announcementId, url] of Object.entries(destinations)) {
    const id = Number(announcementId);
    if (!Number.isInteger(id) || id <= 0) continue;
    await db
      .update(campaignAnnouncementsTable)
      .set({ destinationUrl: url.trim() ? url.trim() : null })
      .where(and(eq(campaignAnnouncementsTable.campaignId, campaignId), eq(campaignAnnouncementsTable.announcementId, id)));
  }
}
```

- [ ] **Step 4: Gerar `scanCode` no insert e aplicar os destinos (POST)**

No handler `POST /campaigns`, trocar a linha do insert dos vínculos:

```ts
  await db.insert(campaignAnnouncementsTable).values(announcementIds.map((announcementId) => ({ campaignId: campaign.id, announcementId }))).onConflictDoNothing();
```

por:

```ts
  await db.insert(campaignAnnouncementsTable).values(
    announcementIds.map((announcementId) => ({ campaignId: campaign.id, announcementId, scanCode: generateScanCode() })),
  ).onConflictDoNothing();
  await syncAnnouncementDestinations(campaign.id, input.announcementDestinations);
```

- [ ] **Step 5: Fazer o mesmo no PATCH**

No handler `PATCH /campaigns/:id`, trocar:

```ts
  await db.insert(campaignAnnouncementsTable).values(announcementIds.map((announcementId) => ({ campaignId: id, announcementId }))).onConflictDoNothing();
```

por:

```ts
  await db.insert(campaignAnnouncementsTable).values(
    announcementIds.map((announcementId) => ({ campaignId: id, announcementId, scanCode: generateScanCode() })),
  ).onConflictDoNothing();
```

E, logo após a linha do `delete` dos vínculos removidos (`notInArray(...)`), adicionar:

```ts
  await syncAnnouncementDestinations(id, input.announcementDestinations);
```

O `onConflictDoNothing` garante que um vínculo já existente mantém o `scanCode` original — códigos nunca mudam.

- [ ] **Step 6: Verificar pela API**

```bash
curl -s "http://localhost:8080/api/campaigns" | head -c 1200
```
Expected: cada campanha traz `announcementLinks` com `scanCode` preenchido e `scans`.

Criar uma campanha com destino e conferir que ele persistiu (trocar os ids pelos reais):

```bash
curl -s -X POST "http://localhost:8080/api/campaigns" \
  -H "Content-Type: application/json" \
  -d '{"advertiserId":1,"announcementIds":[1],"announcementDestinations":{"1":"https://example.com/promo"},"name":"Teste QR","contractValue":0,"startsAt":"2026-08-01","endsAt":"2026-12-31","allDevices":true,"deviceIds":[]}' | head -c 800
```
Expected: resposta `201` com `announcementLinks[0].destinationUrl = "https://example.com/promo"` e `scanCode` não nulo.

- [ ] **Step 7: Typecheck e commit**

```bash
pnpm --filter @workspace/api-server run typecheck
git add artifacts/api-server/src/routes/advertisers.ts
git commit -m "feat(api): URL de destino e scanCode por vínculo campanha-peça"
```

---

### Task 7: `qrImageUrl` no payload de slides

**Files:**
- Modify: `lib/api-spec/openapi.yaml:698-706` (schema `DisplaySlide`)
- Modify: `artifacts/api-server/src/routes/display.ts:40-80`

**Interfaces:**
- Consumes: colunas da Task 3.
- Produces: campo `qrImageUrl: string | null` em cada item de `GET /display/{deviceKey}/slides`. Consumido pelas Tasks 8 e 9.

- [ ] **Step 1: Declarar o campo no contrato**

Em `lib/api-spec/openapi.yaml`, no schema `DisplaySlide`, adicionar a propriedade (as demais permanecem):

```yaml
        qrImageUrl: { type: string, nullable: true }
```

O campo fica **fora** de `required` — clientes antigos continuam válidos.

- [ ] **Step 2: Rodar o codegen**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: `lib/api-zod` e `lib/api-client-react` regenerados sem erro.

- [ ] **Step 3: Selecionar as colunas na query de slides**

Em `artifacts/api-server/src/routes/display.ts`, no `select` de `playlistSlides`, adicionar após `campaignId`:

```ts
      scanCode: sql<string | null>`NULL`,
```

No `select` de `campaignSlides`, adicionar após `campaignId`:

```ts
      scanCode: sql<string | null>`CASE WHEN ${campaignAnnouncementsTable.destinationUrl} IS NULL THEN NULL ELSE ${campaignAnnouncementsTable.scanCode} END`,
```

O `CASE` garante que vínculo sem destino não exibe QR — o `/r/:code` responderia 404.

- [ ] **Step 4: Mapear para `qrImageUrl` na resposta**

Ainda em `display.ts`, trocar o bloco final:

```ts
  const seen = new Set<number>();
  const slides = [...campaignSlides, ...playlistSlides].filter((slide) => {
    if (seen.has(slide.announcementId)) return false;
    seen.add(slide.announcementId);
    return true;
  });

  res.json(GetDeviceSlidesResponse.parse(slides));
```

por:

```ts
  const seen = new Set<number>();
  const slides = [...campaignSlides, ...playlistSlides]
    .filter((slide) => {
      if (seen.has(slide.announcementId)) return false;
      seen.add(slide.announcementId);
      return true;
    })
    .map(({ scanCode, ...slide }) => ({
      ...slide,
      qrImageUrl: scanCode ? `/api/qr/${scanCode}.png` : null,
    }));

  res.json(GetDeviceSlidesResponse.parse(slides));
```

- [ ] **Step 5: Verificar o payload**

```bash
curl -s "http://localhost:8080/api/display/DEVICE_KEY/slides" | head -c 800
```
Expected: slides de campanha com destino trazem `"qrImageUrl":"/api/qr/CODE.png"`; slides de playlist e vínculos sem destino trazem `"qrImageUrl":null`.

- [ ] **Step 6: Typecheck e commit**

```bash
pnpm run typecheck
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/display.ts
git commit -m "feat(display): expor qrImageUrl no payload de slides"
```

---

### Task 8: Overlay do QR no `tv.html`

Arquivo ES5 puro. O fundo branco com padding é obrigatório: sem zona de silêncio clara, o QR não é lido sobre peças escuras.

**Files:**
- Modify: `artifacts/signage/public/tv.html:80-93` (CSS e markup), `:176-195` (`showSlide`)

**Interfaces:**
- Consumes: `slide.qrImageUrl` (Task 7).
- Produces: nada para outras tasks.

- [ ] **Step 1: Adicionar o CSS do overlay**

Em `artifacts/signage/public/tv.html`, antes do `</style>` da linha 81:

```css
    #qr-box {
      position: absolute;
      right: 3vh; bottom: 3vh;
      background: #fff;
      padding: 1vh;
      border-radius: 1vh;
      display: none;
      z-index: 3;
    }
    #qr-img { display: block; width: 12vh; height: 12vh; }
```

- [ ] **Step 2: Adicionar o markup**

Logo após o bloco `<div id="progress-track">…</div>` (linha 93):

```html
  <div id="qr-box"><img id="qr-img" alt="" /></div>
```

- [ ] **Step 3: Adicionar a referência de DOM**

No bloco de refs (junto de `var emptyEl = …`, linha 123):

```js
      var qrBox        = document.getElementById('qr-box');
      var qrImg        = document.getElementById('qr-img');
```

- [ ] **Step 4: Mostrar e esconder o QR a cada slide**

Em `showSlide`, logo após a linha `titleEl.textContent = slide.title;`:

```js
        if (slide.qrImageUrl) {
          qrImg.src = apiBase() + slide.qrImageUrl;
          qrBox.style.display = 'block';
        } else {
          qrBox.style.display = 'none';
          qrImg.removeAttribute('src');
        }
```

- [ ] **Step 5: Verificar no navegador**

Abrir `http://localhost:21153/tv.html?key=DEVICE_KEY`.
Expected:
- slide de campanha com destino mostra o QR branco no canto inferior direito;
- slide de playlist (ou campanha sem destino) não mostra nada nesse canto;
- escanear o QR na tela com o celular abre o destino cadastrado.

Conferir também que o arquivo continua ES5:
```bash
grep -nE "=>|\blet\b|\bconst\b|\`" artifacts/signage/public/tv.html
```
Expected: nenhuma ocorrência dentro do bloco `<script>`.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/public/tv.html
git commit -m "feat(tv): sobrepor QR code da campanha no slide"
```

---

### Task 9: Overlay do QR no `display.tsx`

Mesmo comportamento visual da Task 8, na versão React.

**Files:**
- Modify: `artifacts/signage/src/pages/display.tsx:103-140`

**Interfaces:**
- Consumes: `slide.qrImageUrl` (Task 7).
- Produces: nada para outras tasks.

- [ ] **Step 1: Renderizar o overlay**

Em `artifacts/signage/src/pages/display.tsx`, dentro do `return` do componente `Display`, entre o bloco do título (`<div className="absolute bottom-0 left-0 right-0 z-10 …">…</div>`) e a barra de progresso, adicionar:

```tsx
      {slide.qrImageUrl && (
        <div className="absolute bottom-[3vh] right-[3vh] z-30 rounded-[1vh] bg-white p-[1vh]">
          <img
            src={`${import.meta.env.BASE_URL}${slide.qrImageUrl.replace(/^\//, "")}`}
            alt=""
            className="block h-[12vh] w-[12vh]"
          />
        </div>
      )}
```

- [ ] **Step 2: Verificar no navegador**

Abrir `http://localhost:21153/display/DEVICE_KEY`.
Expected: mesmo comportamento da TV — QR presente só nos slides de campanha com destino, legível ao escanear.

- [ ] **Step 3: Typecheck e commit**

```bash
pnpm --filter @workspace/signage run typecheck
git add artifacts/signage/src/pages/display.tsx
git commit -m "feat(display-tsx): sobrepor QR code da campanha no slide"
```

---

### Task 10: Agregações de scans no analytics

Plays e scans são agregados em queries separadas e combinados em memória. Um `JOIN` direto entre `plays` e `scans` multiplicaria linhas e corromperia as duas contagens.

**Files:**
- Modify: `lib/api-spec/openapi.yaml:485-546` (paths), `:718-789` (schemas)
- Modify: `artifacts/api-server/src/routes/analytics.ts`

**Interfaces:**
- Consumes: `scansTable` (Task 3), `scanRate` (Task 2).
- Produces:
  - `AnalyticsSummary` com `totalScans`, `totalUniqueScans` e, em cada `topAnnouncements`, `scans` e `scanRate`;
  - `AnnouncementAnalytics` com `totalScans`, `totalUniqueScans`, `scanRate` e `byCampaign`;
  - `GET /api/analytics/campaigns/{campaignId}` → `CampaignAnalytics`.

- [ ] **Step 1: Declarar os campos e o endpoint no contrato**

Em `lib/api-spec/openapi.yaml`, no schema `AnnouncementPlayStat`, adicionar às `properties`:

```yaml
        scans: { type: integer }
        scanRate: { type: number }
```

No schema `AnalyticsSummary`, adicionar às `properties`:

```yaml
        totalScans: { type: integer }
        totalUniqueScans: { type: integer }
```

No schema `AnnouncementAnalytics`, adicionar às `properties`:

```yaml
        totalScans: { type: integer }
        totalUniqueScans: { type: integer }
        scanRate: { type: number }
        byCampaign:
          type: array
          items:
            type: object
            required: [campaignId, campaignName, plays, scans, scanRate]
            properties:
              campaignId: { type: integer }
              campaignName: { type: string }
              plays: { type: integer }
              scans: { type: integer }
              scanRate: { type: number }
```

Adicionar o schema novo, ao final do bloco `components.schemas`:

```yaml
    CampaignAnalytics:
      type: object
      required: [campaignId, campaignName, advertiserId, advertiserName, startsAt, endsAt, totalPlays, totalScans, totalUniqueScans, scanRate]
      properties:
        campaignId: { type: integer }
        campaignName: { type: string }
        advertiserId: { type: integer }
        advertiserName: { type: string }
        startsAt: { type: string, format: date-time }
        endsAt: { type: string, format: date-time }
        totalPlays: { type: integer }
        totalScans: { type: integer }
        totalUniqueScans: { type: integer }
        scanRate: { type: number }
        byAnnouncement:
          type: array
          items:
            $ref: "#/components/schemas/AnnouncementPlayStat"
```

E o path novo, logo após `/analytics/announcements/{announcementId}`:

```yaml
  /analytics/campaigns/{campaignId}:
    get:
      operationId: getCampaignAnalytics
      tags: [analytics]
      parameters:
        - { name: campaignId, in: path, required: true, schema: { type: integer } }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/CampaignAnalytics"
        "404":
          description: Not found
```

Nota: `AnnouncementPlayStat` é reusado em `ClientAnalytics` e `DeviceAnalytics`, que não calculam scans. Por isso `scans` e `scanRate` ficam **fora** de `required` — esses dois endpoints continuam válidos sem enviá-los.

- [ ] **Step 2: Rodar o codegen**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: geração sem erro; `GetCampaignAnalyticsResponse` e `GetCampaignAnalyticsParams` passam a existir em `@workspace/api-zod`.

- [ ] **Step 3: Somar os scans ao `/analytics/summary`**

Em `artifacts/api-server/src/routes/analytics.ts`, adicionar `scansTable` ao import de `@workspace/db`, `GetCampaignAnalyticsParams` e `GetCampaignAnalyticsResponse` ao import de `@workspace/api-zod`, e o import do helper:

```ts
import { scanRate } from "../lib/scan-rate";
```

No handler de `/analytics/summary`, entre a query `topAnnouncements` e o `res.json`, inserir:

```ts
  const [scanCounts] = await db
    .select({
      totalScans: sql<number>`COUNT(*) FILTER (WHERE ${scansTable.isBot} = false)::int`,
      totalUniqueScans: sql<number>`COUNT(DISTINCT COALESCE(${scansTable.visitorId}, ${scansTable.fingerprint})) FILTER (WHERE ${scansTable.isBot} = false)::int`,
    })
    .from(scansTable);

  const scansByAnnouncement = await db
    .select({
      announcementId: scansTable.announcementId,
      scans: sql<number>`COUNT(*)::int`,
    })
    .from(scansTable)
    .where(eq(scansTable.isBot, false))
    .groupBy(scansTable.announcementId);

  const scansMap = new Map(scansByAnnouncement.map((row) => [row.announcementId, row.scans]));
```

E trocar o `res.json` do handler por:

```ts
  res.json(
    GetAnalyticsSummaryResponse.parse({
      totalClients: counts?.totalClients ?? 0,
      totalDevices: counts?.totalDevices ?? 0,
      totalPlays: counts?.totalPlays ?? 0,
      totalDuration: counts?.totalDuration ?? 0,
      totalScans: scanCounts?.totalScans ?? 0,
      totalUniqueScans: scanCounts?.totalUniqueScans ?? 0,
      topAnnouncements: topAnnouncements.map((item) => {
        const scans = scansMap.get(item.announcementId) ?? 0;
        return { ...item, scans, scanRate: scanRate(scans, item.plays) };
      }),
    })
  );
```

- [ ] **Step 4: Somar os scans ao `/analytics/announcements/:announcementId`**

No handler correspondente, entre a query `byDevice` e o `res.json`, inserir:

```ts
  const [scanAgg] = await db
    .select({
      totalScans: sql<number>`COUNT(*) FILTER (WHERE ${scansTable.isBot} = false)::int`,
      totalUniqueScans: sql<number>`COUNT(DISTINCT COALESCE(${scansTable.visitorId}, ${scansTable.fingerprint})) FILTER (WHERE ${scansTable.isBot} = false)::int`,
    })
    .from(scansTable)
    .where(eq(scansTable.announcementId, announcementId));

  const playsByCampaign = await db
    .select({
      campaignId: campaignsTable.id,
      campaignName: campaignsTable.name,
      plays: sql<number>`COUNT(${playsTable.id})::int`,
    })
    .from(playsTable)
    .innerJoin(campaignsTable, eq(campaignsTable.id, playsTable.campaignId))
    .where(eq(playsTable.announcementId, announcementId))
    .groupBy(campaignsTable.id, campaignsTable.name);

  const scansByCampaign = await db
    .select({
      campaignId: scansTable.campaignId,
      scans: sql<number>`COUNT(*)::int`,
    })
    .from(scansTable)
    .where(and(eq(scansTable.announcementId, announcementId), eq(scansTable.isBot, false)))
    .groupBy(scansTable.campaignId);

  const scansByCampaignMap = new Map(scansByCampaign.map((row) => [row.campaignId, row.scans]));

  const byCampaign = playsByCampaign.map((row) => {
    const scans = scansByCampaignMap.get(row.campaignId) ?? 0;
    return { ...row, scans, scanRate: scanRate(scans, row.plays) };
  });
```

Adicionar `and` ao import de `drizzle-orm` e `campaignsTable` ao import de `@workspace/db`.

Trocar o `res.json` desse handler por:

```ts
  res.json(
    GetAnnouncementAnalyticsResponse.parse({
      announcementId,
      title: announcement.title,
      totalPlays: agg?.totalPlays ?? 0,
      totalDuration: agg?.totalDuration ?? 0,
      totalScans: scanAgg?.totalScans ?? 0,
      totalUniqueScans: scanAgg?.totalUniqueScans ?? 0,
      scanRate: scanRate(scanAgg?.totalScans ?? 0, agg?.totalPlays ?? 0),
      byCampaign,
      byDevice,
    })
  );
```

- [ ] **Step 5: Criar o endpoint de analytics por campanha**

Ainda em `analytics.ts`, antes do `export default router;`:

```ts
// Campaign analytics
router.get("/analytics/campaigns/:campaignId", async (req, res): Promise<void> => {
  const params = GetCampaignAnalyticsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const campaignId = params.data.campaignId;

  const [campaign] = await db
    .select({
      id: campaignsTable.id,
      name: campaignsTable.name,
      advertiserId: campaignsTable.advertiserId,
      advertiserName: advertisersTable.name,
      startsAt: campaignsTable.startsAt,
      endsAt: campaignsTable.endsAt,
    })
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .where(eq(campaignsTable.id, campaignId));

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const [playAgg] = await db
    .select({
      totalPlays: sql<number>`COUNT(${playsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .where(eq(playsTable.campaignId, campaignId));

  const [scanAgg] = await db
    .select({
      totalScans: sql<number>`COUNT(*) FILTER (WHERE ${scansTable.isBot} = false)::int`,
      totalUniqueScans: sql<number>`COUNT(DISTINCT COALESCE(${scansTable.visitorId}, ${scansTable.fingerprint})) FILTER (WHERE ${scansTable.isBot} = false)::int`,
    })
    .from(scansTable)
    .where(eq(scansTable.campaignId, campaignId));

  const playsByAnnouncement = await db
    .select({
      announcementId: playsTable.announcementId,
      title: announcementsTable.title,
      plays: sql<number>`COUNT(${playsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, playsTable.announcementId))
    .where(eq(playsTable.campaignId, campaignId))
    .groupBy(playsTable.announcementId, announcementsTable.title)
    .orderBy(desc(sql`COUNT(${playsTable.id})`));

  const scansByAnnouncement = await db
    .select({
      announcementId: scansTable.announcementId,
      scans: sql<number>`COUNT(*)::int`,
    })
    .from(scansTable)
    .where(and(eq(scansTable.campaignId, campaignId), eq(scansTable.isBot, false)))
    .groupBy(scansTable.announcementId);

  const scansMap = new Map(scansByAnnouncement.map((row) => [row.announcementId, row.scans]));

  res.json(
    GetCampaignAnalyticsResponse.parse({
      campaignId,
      campaignName: campaign.name,
      advertiserId: campaign.advertiserId,
      advertiserName: campaign.advertiserName,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      totalPlays: playAgg?.totalPlays ?? 0,
      totalScans: scanAgg?.totalScans ?? 0,
      totalUniqueScans: scanAgg?.totalUniqueScans ?? 0,
      scanRate: scanRate(scanAgg?.totalScans ?? 0, playAgg?.totalPlays ?? 0),
      byAnnouncement: playsByAnnouncement.map((item) => {
        const scans = scansMap.get(item.announcementId) ?? 0;
        return { ...item, scans, scanRate: scanRate(scans, item.plays) };
      }),
    })
  );
});
```

Adicionar `advertisersTable` e `campaignsTable` ao import de `@workspace/db`.

- [ ] **Step 6: Verificar os três endpoints**

```bash
curl -s "http://localhost:8080/api/analytics/summary" | head -c 600
curl -s "http://localhost:8080/api/analytics/announcements/1" | head -c 600
curl -s "http://localhost:8080/api/analytics/campaigns/1" | head -c 600
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8080/api/analytics/campaigns/999999"
```
Expected: os três primeiros trazem `totalScans`/`totalUniqueScans`/`scanRate` coerentes com as linhas de `scans` inseridas na Task 4; o último devolve `404`.

Conferir a divisão por zero: uma campanha sem nenhum play deve devolver `"scanRate":0`, nunca `null` nem erro.

- [ ] **Step 7: Typecheck e commit**

```bash
pnpm run typecheck
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/analytics.ts
git commit -m "feat(analytics): scans, visitantes únicos e taxa por peça e por campanha"
```

---

### Task 11: Scans na página `/analytics`

**Files:**
- Modify: `artifacts/signage/src/pages/analytics.tsx`

**Interfaces:**
- Consumes: `useGetAnalyticsSummary()` com os campos da Task 10.
- Produces: nada para outras tasks.

- [ ] **Step 1: Adicionar o formatador de taxa e o ícone**

Em `artifacts/signage/src/pages/analytics.tsx`, trocar a linha 1 por:

```tsx
import { Users, Monitor, Play, Clock, QrCode } from 'lucide-react';
```

E adicionar, após a função `formatDuration`:

```tsx
function formatRate(rate: number) {
  return `${(rate * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
```

Duas casas decimais são obrigatórias: em DOOH a taxa é da ordem de 0,1% a 1%, e arredondar para inteiro transformaria quase tudo em `0%`.

- [ ] **Step 2: Trocar a grade de estatísticas**

Substituir os dois `div` da grade (skeleton e dados) por versões de 5 colunas, adicionando o card de scans:

```tsx
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <StatCard label="Total de clientes" value={data?.totalClients ?? 0} icon={Users} />
          <StatCard label="Total de TVs" value={data?.totalDevices ?? 0} icon={Monitor} />
          <StatCard label="Total de exibições" value={data?.totalPlays ?? 0} icon={Play} />
          <StatCard label="Tempo total de exibição" value={formatDuration(data?.totalDuration ?? 0)} icon={Clock} />
          <StatCard
            label="Total de scans"
            value={data?.totalScans ?? 0}
            icon={QrCode}
            hint={`${data?.totalUniqueScans ?? 0} visitantes únicos`}
          />
        </div>
      )}
```

- [ ] **Step 3: Aceitar o `hint` no `StatCard`**

Trocar o componente `StatCard` por:

```tsx
function StatCard({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: React.ElementType; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Adicionar as colunas na tabela**

No `<thead>`, após a coluna `Exibições`, adicionar:

```tsx
                  <th className="text-right py-2 font-medium">Scans</th>
                  <th className="text-right py-2 font-medium">Taxa</th>
```

No `<tbody>`, após a célula de `{item.plays}`, adicionar:

```tsx
                    <td className="py-3 text-right tabular-nums">{item.scans ?? 0}</td>
                    <td className="py-3 text-right tabular-nums text-muted-foreground">{formatRate(item.scanRate ?? 0)}</td>
```

- [ ] **Step 5: Adicionar a nota de leitura da métrica**

Logo após o fechamento do `</Card>` da tabela, antes do `</div>` final:

```tsx
      <p className="mt-4 text-xs text-muted-foreground">
        Scan mede resposta, não alcance. Um scan não é atribuível a uma exibição específica, e múltiplos scans da mesma
        pessoa contam no número bruto — use a taxa para comparar peças e campanhas entre si.
      </p>
```

- [ ] **Step 6: Verificar no navegador**

Abrir `http://localhost:21153/analytics`.
Expected: cinco cards, o de scans mostrando o total e os únicos; tabela com `Scans` e `Taxa` (formato `0,37%`); nota de rodapé visível.

- [ ] **Step 7: Typecheck e commit**

```bash
pnpm --filter @workspace/signage run typecheck
git add artifacts/signage/src/pages/analytics.tsx
git commit -m "feat(ui): exibir scans, visitantes únicos e taxa na página de análises"
```

---

### Task 12: Destino e QR no painel de campanhas

**Files:**
- Modify: `artifacts/signage/src/pages/advertisers.tsx:22-38` (tipo `Campaign`), `:65` e `:104-157` (estado e submit), `:273` (formulário)
- Modify: `artifacts/signage/src/pages/advertiser-detail.tsx:11-22` (tipo), `:94-111` (card da campanha)

**Interfaces:**
- Consumes: `announcementLinks` e `scans` das respostas de campanha (Task 6); `/api/qr/:code.png` (Task 5).
- Produces: nada para outras tasks.

- [ ] **Step 1: Estender o tipo `Campaign` em `advertisers.tsx`**

Adicionar ao type `Campaign`:

```tsx
  scans: number;
  announcementLinks?: Array<{ announcementId: number; title: string; scanCode: string | null; destinationUrl: string | null; plays: number; scans: number }>;
```

- [ ] **Step 2: Guardar os destinos no estado do formulário**

Após a linha do estado `selectedAnnouncements` (linha 65), adicionar:

```tsx
  const [announcementDestinations, setAnnouncementDestinations] = useState<Record<string, string>>({});
```

Em `openNewCampaign`, após `setSelectedAnnouncements([]);`:

```tsx
    setAnnouncementDestinations({});
```

Em `openEditCampaign`, após `setSelectedAnnouncements(campaign.announcementIds ?? []);`:

```tsx
    setAnnouncementDestinations(
      Object.fromEntries((campaign.announcementLinks ?? []).map((link) => [String(link.announcementId), link.destinationUrl ?? ""])),
    );
```

Em `submitCampaign`, adicionar ao corpo do `JSON.stringify`, após `announcementIds: selectedAnnouncements,`:

```tsx
        announcementDestinations,
```

E no reset após o sucesso, junto de `setSelectedAnnouncements([]);`:

```tsx
    setAnnouncementDestinations({});
```

- [ ] **Step 3: Adicionar o campo de destino por peça no formulário**

Substituir o bloco "Anúncios / peças" (linha 273) por:

```tsx
            <div className="space-y-2">
              <Label>Anúncios / peças</Label>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-2">
                {announcements.map((a) => {
                  const checked = selectedAnnouncements.includes(a.id);
                  return (
                    <div key={a.id} className="rounded p-2 hover:bg-muted">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setSelectedAnnouncements(e.target.checked ? [...selectedAnnouncements, a.id] : selectedAnnouncements.filter((id) => id !== a.id))}
                        />
                        {a.title}
                      </label>
                      {checked && (
                        <Input
                          className="mt-2"
                          type="url"
                          placeholder="URL de destino do QR code (opcional)"
                          value={announcementDestinations[String(a.id)] ?? ""}
                          onChange={(e) => setAnnouncementDestinations({ ...announcementDestinations, [String(a.id)]: e.target.value })}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Peças com URL de destino exibem um QR code rastreável na TV.</p>
            </div>
```

- [ ] **Step 4: Mostrar o QR e as métricas na lista de campanhas**

Ainda em `advertisers.tsx`, no card de cada campanha (junto do trecho que hoje mostra `{campaign.advertiserName} · …` na linha 234), adicionar abaixo o bloco de vínculos:

```tsx
                  {(campaign.announcementLinks ?? []).filter((link) => link.destinationUrl && link.scanCode).map((link) => (
                    <div key={link.announcementId} className="mt-2 flex items-center gap-3 rounded-lg border p-2">
                      <img src={`${import.meta.env.BASE_URL}api/qr/${link.scanCode}.png`} alt="" className="h-14 w-14 rounded bg-white p-1" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{link.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{link.destinationUrl}</p>
                        <p className="text-xs text-muted-foreground">{link.plays} exibições · {link.scans} scans</p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/r/${link.scanCode}`);
                            toast({ title: "Link copiado" });
                          }}
                        >
                          Copiar link
                        </Button>
                        <a href={`${import.meta.env.BASE_URL}api/qr/${link.scanCode}.png`} download={`qr-${link.scanCode}.png`}>
                          <Button type="button" variant="outline" size="sm">Baixar PNG</Button>
                        </a>
                      </div>
                    </div>
                  ))}
```

- [ ] **Step 5: Mostrar scans no detalhe do anunciante**

Em `artifacts/signage/src/pages/advertiser-detail.tsx`, adicionar ao type `Campaign`:

```tsx
  scans: number;
  announcementLinks?: Array<{ announcementId: number; title: string; scanCode: string | null; destinationUrl: string | null; plays: number; scans: number }>;
```

E, na linha de métricas do card da campanha, trocar:

```tsx
                    <span>{campaign.plays} exibições</span>
```

por:

```tsx
                    <span>{campaign.plays} exibições</span>
                    <span>{campaign.scans ?? 0} scans</span>
                    <span>
                      Taxa {((campaign.plays > 0 ? (campaign.scans ?? 0) / campaign.plays : 0) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                    </span>
```

- [ ] **Step 6: Verificar no navegador**

Abrir `http://localhost:21153/advertisers`.
Expected:
- ao marcar uma peça no formulário de campanha, aparece o campo de URL de destino;
- salvar e reabrir a edição preserva a URL digitada;
- o card da campanha mostra a miniatura do QR, o destino, exibições e scans;
- "Copiar link" copia `http://localhost:21153/r/CODE`;
- "Baixar PNG" salva a imagem.

Abrir `http://localhost:21153/advertisers/1`.
Expected: cada campanha mostra exibições, scans e taxa com 2 casas.

- [ ] **Step 7: Typecheck e commit**

```bash
pnpm --filter @workspace/signage run typecheck
git add artifacts/signage/src/pages/advertisers.tsx artifacts/signage/src/pages/advertiser-detail.tsx
git commit -m "feat(ui): URL de destino, QR code e scans no painel de campanhas"
```

---

### Task 13: Documentação e fechamento

**Files:**
- Modify: `README.md` (tabela de variáveis de ambiente, rotas, arquitetura funcional, validação)

**Interfaces:**
- Consumes: tudo das tasks anteriores.
- Produces: nada.

- [ ] **Step 1: Documentar as variáveis novas**

Em `README.md`, na tabela de variáveis de ambiente, adicionar duas linhas:

```markdown
| `SCAN_SALT` | Sal do hash de identificação de scans do QR code. O IP bruto nunca é gravado |
| `PUBLIC_BASE_URL` | Origem pública onde `/r/CODE` responde, usada para montar o link dentro do QR code (ex.: `https://meu-painel.replit.app`). Sem ela, a API usa o host da própria requisição |
```

- [ ] **Step 2: Documentar as rotas novas**

Na lista de rotas do frontend, adicionar após a linha de `/analytics`:

```markdown
- `/r/CODE` — redirect público do QR code (servido pela API, registra o scan)
```

- [ ] **Step 3: Atualizar a arquitetura funcional**

Na seção "Arquitetura funcional", adicionar após o item de exibições (plays):

```markdown
- Cada vínculo entre campanha e peça tem um código curto imutável (`scanCode`) e uma URL de destino opcional. Com destino configurado, o player sobrepõe um QR code na peça; o scan passa por `/r/CODE`, é registrado na tabela `scans` e redireciona para o destino.
- Scans são apresentados junto das exibições em números brutos e visitantes únicos, mais a taxa `scans / exibições`. A métrica mede resposta, não alcance: um scan não é atribuível a uma exibição ou TV específica.
```

- [ ] **Step 4: Documentar o comando de teste**

Na seção "Validação", após o bloco com `pnpm run typecheck` / `pnpm run build`, adicionar:

```markdown
Testes unitários da API (geração de código, detecção de bot, fingerprint e taxa):

```bash
pnpm --filter @workspace/api-server run test
```
```

- [ ] **Step 5: Rodar a verificação completa**

```bash
pnpm --filter @workspace/api-server run test
pnpm run typecheck
PORT=8081 BASE_PATH=/ pnpm run build
```
Expected: testes passam, typecheck limpo, build dos três artifacts concluído.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: documentar QR code, métrica de scans e variáveis SCAN_SALT e PUBLIC_BASE_URL"
```

---

## Checklist de deploy

- [ ] `SCAN_SALT` definida no ambiente de produção (valor aleatório, longo, **nunca** versionado). Trocar o sal depois invalida a deduplicação por fingerprint dos scans antigos.
- [ ] `PUBLIC_BASE_URL` apontando para a origem pública onde `/r/CODE` responde — a mesma que serve o painel, já que todo o frontend assume API na mesma origem.
- [ ] Schema aplicado em produção pelo fluxo de publicação do Replit.
- [ ] `pnpm --filter @workspace/scripts run backfill:scan-codes` rodado uma vez contra o banco de produção.
- [ ] Um QR escaneado com celular real, em uma TV real, abrindo o destino correto.
