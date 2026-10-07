# Aviso urgente nas TVs — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O admin publica um aviso de texto que toma as TVs escolhidas (todas, por segmento ou por empresa) por até 24h, até expirar ou ser encerrado.

**Architecture:** Tabela `urgent_alerts`. Na criação o servidor desenha o aviso em 1920×1080 e 1080×1920 (satori, mesmo `rasterize` dos painéis) e guarda as duas artes como peças `source = "alert"`. O feed (`loadDeviceSlides`), para TV não vitrine, procura o aviso ativo mais recente que atinge a TV e, se houver, devolve só a peça da orientação da tela. Telemetria aceita e descarta exibições de aviso. Página `/avisos` no admin.

**Tech Stack:** TypeScript, Express, drizzle-orm (Postgres), zod, satori + resvg, vitest + supertest (API), React + TanStack Query + Testing Library (web), orval (contrato OpenAPI), pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-10-07-aviso-urgente-design.md`

## Global Constraints

- Branch `feat/aviso-urgente`; PR com título `feat(api): aviso urgente nas TVs`, merge commit.
- Commits no formato `tipo(escopo): descrição em português`, terminando com a linha exata `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (nunca outro nome de modelo).
- Código e comentários em português explicando o porquê; acentos e símbolos como UTF-8 real, nunca `\uXXXX`.
- Título até 60 caracteres (obrigatório); texto até 140 (opcional; vazio vira nulo).
- Alvo: `"all"` | `"segments"` | `"companies"`; TV sem segmento nunca entra pelo modo segmentos.
- Duração em minutos ∈ {30, 60, 120, 240, 480, 1440}; começa na hora.
- Ativo = `starts_at ≤ agora < ends_at` e `ended_at` nulo. Mais de um ativo → vale o mais recente (`created_at`, depois `id`).
- Takeover total: TV atingida recebe só a peça do aviso, da orientação da tela. Vitrine ignora avisos.
- Falha ao consultar avisos nunca tira as campanhas do ar: loga e segue com a volta normal.
- Aviso não conta exibição (os dois endpoints de telemetria aceitam e descartam).
- A TV não muda: arte é PNG gerado no servidor.
- Toda mudança de schema gera migração versionada com `pnpm --filter @workspace/db run generate` (com `DATABASE_URL` fictício) e a commita.

## Review Focus

- Feed de TV com aviso cuja peça daquela orientação foi apagada (`*_announcement_id` nulo) → volta normal, não lista vazia. Teste na Task 1 (`alertPieceIdFor`) e na Task 3.
- Testes antigos do feed (prévia do admin, portal, vitrine) cujo mock de banco não conhece avisos → a consulta extra devolve vazio e nada muda. Coberto rodando esses arquivos na Task 3.
- Aviso que expirou mas ainda veio do banco (relógio no limite) → não toma a TV. Teste na Task 3.
- `POST /urgent-alerts` com render falhando → 500 e nada gravado (nem peça, nem aviso). Teste na Task 5.
- Encerrar duas vezes → segunda chamada não regrava `ended_at`. Teste na Task 5.

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `artifacts/api-server/src/lib/alerts/alert-eligibility.ts` (novo) | regras puras: alvo, ativo, escolha do aviso, peça por orientação, status |
| `artifacts/api-server/src/lib/alerts/alert-template.ts` (novo) | árvore satori do aviso, limites, tamanho por orientação |
| `artifacts/api-server/src/lib/alerts/render.ts` (novo) | `renderAlert` → PNG |
| `artifacts/api-server/src/lib/panels/render.ts` | exporta `rasterize` |
| `lib/db/src/schema/urgent_alerts.ts` (novo) + `index.ts` + `lib/db/drizzle/*` | tabela e migração |
| `artifacts/api-server/src/lib/alerts/active-alert.ts` (novo) | consulta o aviso ativo da TV |
| `artifacts/api-server/src/lib/device-feed.ts` | takeover no feed |
| `lib/api-spec/openapi.yaml` + gerados (`lib/api-zod`, `lib/api-client-react`) | `source` da prévia aceita `alert` |
| `artifacts/signage/src/components/device-preview.tsx` | rótulo "Aviso urgente" |
| `artifacts/api-server/src/routes/telemetry.ts` | descarta exibição de aviso |
| `artifacts/api-server/src/routes/announcements.ts` | biblioteca sem peças `alert` |
| `artifacts/api-server/src/lib/alerts/alert-input.ts` (novo) | zod da criação |
| `artifacts/api-server/src/routes/urgent-alerts.ts` (novo) + `routes/index.ts` | API |
| `artifacts/signage/src/lib/urgent-alerts-api.ts` (novo) | cliente HTTP |
| `artifacts/signage/src/pages/urgent-alerts.tsx` (novo) + `App.tsx` + `components/nav-config.ts` | tela `/avisos` |

---

### Task 1: Regras puras do aviso

**Files:**
- Create: `artifacts/api-server/src/lib/alerts/alert-eligibility.ts`
- Test: `artifacts/api-server/src/lib/alerts/__tests__/alert-eligibility.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (usado pelas Tasks 3 e 5):
  - `export type AlertTarget = { targetMode: string; segmentIds: number[]; companyIds: number[] }`
  - `export type AlertWindow = { startsAt: Date; endsAt: Date; endedAt: Date | null; createdAt: Date }`
  - `export type AlertDevice = { companyId: number; segmentId: number | null }`
  - `export type AlertStatus = "active" | "expired" | "ended"`
  - `export function alertReachesDevice(alert: AlertTarget, device: AlertDevice): boolean`
  - `export function alertIsActive(alert: AlertWindow, now: Date): boolean`
  - `export function alertStatus(alert: AlertWindow, now: Date): AlertStatus`
  - `export function activeAlertFor<T extends AlertTarget & AlertWindow & { id: number }>(alerts: T[], device: AlertDevice, now: Date): T | null`
  - `export function alertPieceIdFor(alert: { landscapeAnnouncementId: number | null; portraitAnnouncementId: number | null }, screen: "landscape" | "portrait"): number | null`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// artifacts/api-server/src/lib/alerts/__tests__/alert-eligibility.test.ts
import { describe, expect, it } from "vitest";
import {
  activeAlertFor,
  alertIsActive,
  alertPieceIdFor,
  alertReachesDevice,
  alertStatus,
} from "../alert-eligibility";

const PADARIA = 5;
const t = (iso: string) => new Date(iso);

function alerta(over: Partial<Parameters<typeof activeAlertFor>[0][number]> = {}) {
  return {
    id: 1,
    targetMode: "all",
    segmentIds: [] as number[],
    companyIds: [] as number[],
    startsAt: t("2026-10-07T14:00:00Z"),
    endsAt: t("2026-10-07T16:00:00Z"),
    endedAt: null as Date | null,
    createdAt: t("2026-10-07T14:00:00Z"),
    ...over,
  };
}

const tvPadaria = { companyId: 10, segmentId: PADARIA };
const tvSemSegmento = { companyId: 20, segmentId: null };
const meioDoAviso = t("2026-10-07T15:00:00Z");

describe("alertReachesDevice", () => {
  it("todas as TVs atinge qualquer TV", () => {
    expect(alertReachesDevice(alerta(), tvSemSegmento)).toBe(true);
  });

  it("por segmento atinge só a TV cuja empresa está no segmento", () => {
    const aviso = alerta({ targetMode: "segments", segmentIds: [PADARIA] });
    expect(alertReachesDevice(aviso, tvPadaria)).toBe(true);
    expect(alertReachesDevice(aviso, { companyId: 11, segmentId: 6 })).toBe(false);
  });

  it("por segmento nunca atinge TV de empresa sem segmento", () => {
    expect(alertReachesDevice(alerta({ targetMode: "segments", segmentIds: [PADARIA] }), tvSemSegmento)).toBe(false);
  });

  it("por empresa atinge só as TVs da empresa", () => {
    const aviso = alerta({ targetMode: "companies", companyIds: [10] });
    expect(alertReachesDevice(aviso, tvPadaria)).toBe(true);
    expect(alertReachesDevice(aviso, tvSemSegmento)).toBe(false);
  });

  it("modo desconhecido não atinge ninguém", () => {
    expect(alertReachesDevice(alerta({ targetMode: "outro" }), tvPadaria)).toBe(false);
  });
});

describe("alertIsActive e alertStatus", () => {
  it("vale do início (incluso) ao fim (excluso)", () => {
    expect(alertIsActive(alerta(), t("2026-10-07T14:00:00Z"))).toBe(true);
    expect(alertIsActive(alerta(), t("2026-10-07T16:00:00Z"))).toBe(false);
    expect(alertIsActive(alerta(), t("2026-10-07T13:59:59Z"))).toBe(false);
  });

  it("encerrado à mão não vale mais", () => {
    expect(alertIsActive(alerta({ endedAt: t("2026-10-07T14:30:00Z") }), meioDoAviso)).toBe(false);
  });

  it("status: no ar, expirado ou encerrado", () => {
    expect(alertStatus(alerta(), meioDoAviso)).toBe("active");
    expect(alertStatus(alerta(), t("2026-10-07T17:00:00Z"))).toBe("expired");
    expect(alertStatus(alerta({ endedAt: t("2026-10-07T14:30:00Z") }), meioDoAviso)).toBe("ended");
  });
});

describe("activeAlertFor", () => {
  it("nenhum aviso ativo para a TV → null", () => {
    expect(activeAlertFor([alerta({ endsAt: t("2026-10-07T14:30:00Z") })], tvPadaria, meioDoAviso)).toBeNull();
    expect(activeAlertFor([], tvPadaria, meioDoAviso)).toBeNull();
  });

  it("ignora aviso que não atinge a TV", () => {
    const outraEmpresa = alerta({ targetMode: "companies", companyIds: [99] });
    expect(activeAlertFor([outraEmpresa], tvPadaria, meioDoAviso)).toBeNull();
  });

  it("com dois ativos vale o mais recente", () => {
    const antigo = alerta({ id: 1, createdAt: t("2026-10-07T14:00:00Z") });
    const novo = alerta({ id: 2, createdAt: t("2026-10-07T14:20:00Z") });
    expect(activeAlertFor([novo, antigo], tvPadaria, meioDoAviso)?.id).toBe(2);
    expect(activeAlertFor([antigo, novo], tvPadaria, meioDoAviso)?.id).toBe(2);
  });

  it("criados no mesmo instante: vale o de maior id", () => {
    expect(activeAlertFor([alerta({ id: 3 }), alerta({ id: 4 })], tvPadaria, meioDoAviso)?.id).toBe(4);
  });
});

describe("alertPieceIdFor", () => {
  const pecas = { landscapeAnnouncementId: 901, portraitAnnouncementId: 902 };

  it("escolhe a arte da orientação da tela", () => {
    expect(alertPieceIdFor(pecas, "landscape")).toBe(901);
    expect(alertPieceIdFor(pecas, "portrait")).toBe(902);
  });

  it("arte apagada → null (a TV segue a volta normal)", () => {
    expect(alertPieceIdFor({ landscapeAnnouncementId: null, portraitAnnouncementId: 902 }, "landscape")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/alerts/__tests__/alert-eligibility.test.ts`
Expected: FAIL — `Failed to load url ../alert-eligibility`.

- [ ] **Step 3: Implementar**

```ts
// artifacts/api-server/src/lib/alerts/alert-eligibility.ts
/** Alvo do aviso. `targetMode` vem do banco como texto. */
export type AlertTarget = { targetMode: string; segmentIds: number[]; companyIds: number[] };

/** Janela do aviso: começa na criação, termina em `endsAt` ou quando o admin encerra. */
export type AlertWindow = { startsAt: Date; endsAt: Date; endedAt: Date | null; createdAt: Date };

export type AlertDevice = { companyId: number; segmentId: number | null };

export type AlertStatus = "active" | "expired" | "ended";

/**
 * O aviso vale para esta TV? Por segmento, TV de empresa sem segmento fica de
 * fora — mesma regra das campanhas: não dá para afirmar que é do ramo. Modo
 * desconhecido não atinge ninguém: aviso que toma a TV inteira só entra quando
 * o alvo é certo.
 */
export function alertReachesDevice(alert: AlertTarget, device: AlertDevice): boolean {
  switch (alert.targetMode) {
    case "all":
      return true;
    case "segments":
      return device.segmentId !== null && alert.segmentIds.includes(device.segmentId);
    case "companies":
      return alert.companyIds.includes(device.companyId);
    default:
      return false;
  }
}

/** No ar agora: depois do início, antes do fim (excluso) e não encerrado à mão. */
export function alertIsActive(alert: AlertWindow, now: Date): boolean {
  const at = now.getTime();
  return alert.endedAt === null && alert.startsAt.getTime() <= at && at < alert.endsAt.getTime();
}

export function alertStatus(alert: AlertWindow, now: Date): AlertStatus {
  if (alert.endedAt !== null) return "ended";
  return alertIsActive(alert, now) ? "active" : "expired";
}

/**
 * O aviso que toma esta TV agora: entre os ativos que a atingem, o mais
 * recente — quem publicou por último é quem sabe o que a tela deve dizer.
 */
export function activeAlertFor<T extends AlertTarget & AlertWindow & { id: number }>(
  alerts: T[],
  device: AlertDevice,
  now: Date,
): T | null {
  let chosen: T | null = null;
  for (const alert of alerts) {
    if (!alertIsActive(alert, now) || !alertReachesDevice(alert, device)) continue;
    const newer =
      chosen === null ||
      alert.createdAt.getTime() > chosen.createdAt.getTime() ||
      (alert.createdAt.getTime() === chosen.createdAt.getTime() && alert.id > chosen.id);
    if (newer) chosen = alert;
  }
  return chosen;
}

/** Peça do aviso na orientação da tela; nula se a arte foi apagada. */
export function alertPieceIdFor(
  alert: { landscapeAnnouncementId: number | null; portraitAnnouncementId: number | null },
  screen: "landscape" | "portrait",
): number | null {
  return screen === "portrait" ? alert.portraitAnnouncementId : alert.landscapeAnnouncementId;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/alerts/__tests__/alert-eligibility.test.ts`
Expected: PASS.

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/alerts
git commit -F - <<'EOF'
feat(api): regras do aviso urgente (alvo, janela e escolha)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Arte do aviso (template e render)

**Files:**
- Create: `artifacts/api-server/src/lib/alerts/alert-template.ts`
- Create: `artifacts/api-server/src/lib/alerts/render.ts`
- Modify: `artifacts/api-server/src/lib/panels/render.ts` (exportar `rasterize`)
- Test: `artifacts/api-server/src/lib/alerts/__tests__/alert-template.test.ts`
- Test: `artifacts/api-server/src/lib/alerts/__tests__/alert-render.test.ts`

**Interfaces:**
- Consumes: `truncate` de `lib/panels/format.ts`; `rasterize(tree, width, height): Promise<Buffer>` de `lib/panels/render.ts` (passa a ser exportado).
- Produces (usado pela Task 5):
  - `export const MAX_ALERT_TITLE = 60`, `export const MAX_ALERT_BODY = 140`
  - `export type AlertOrientation = "landscape" | "portrait"`
  - `export type AlertArt = { title: string; body: string | null }`
  - `export function alertSize(orientation: AlertOrientation): { width: number; height: number }`
  - `export function alertNode(art: AlertArt, orientation: AlertOrientation): unknown`
  - `export function renderAlert(art: AlertArt, orientation: AlertOrientation): Promise<Buffer>` (em `lib/alerts/render.ts`)

- [ ] **Step 1: Escrever os testes que falham**

```ts
// artifacts/api-server/src/lib/alerts/__tests__/alert-template.test.ts
import { describe, expect, it } from "vitest";
import { MAX_ALERT_BODY, MAX_ALERT_TITLE, alertNode, alertSize } from "../alert-template";

/** Todos os textos da árvore satori, na ordem. */
function texts(tree: unknown): string[] {
  if (typeof tree === "string") return [tree];
  if (!tree || typeof tree !== "object") return [];
  const children = (tree as { props?: { children?: unknown } }).props?.children;
  return Array.isArray(children) ? children.flatMap(texts) : texts(children);
}

describe("alertSize", () => {
  it("deitado 1920×1080 e em pé 1080×1920", () => {
    expect(alertSize("landscape")).toEqual({ width: 1920, height: 1080 });
    expect(alertSize("portrait")).toEqual({ width: 1080, height: 1920 });
  });
});

describe("alertNode", () => {
  it.each(["landscape", "portrait"] as const)("mostra o selo, o título e o texto (%s)", (orientation) => {
    const out = texts(alertNode({ title: "Hoje fechamos às 18h", body: "Voltamos amanhã às 8h." }, orientation));
    expect(out).toEqual(["AVISO", "Hoje fechamos às 18h", "Voltamos amanhã às 8h."]);
  });

  it("sem texto, só o selo e o título", () => {
    expect(texts(alertNode({ title: "Sistema fora do ar", body: null }, "landscape"))).toEqual(["AVISO", "Sistema fora do ar"]);
  });

  it("corta título e texto nos limites", () => {
    const [, title, body] = texts(alertNode({ title: "t".repeat(80), body: "b".repeat(200) }, "landscape"));
    expect(title).toHaveLength(MAX_ALERT_TITLE);
    expect(title.endsWith("…")).toBe(true);
    expect(body).toHaveLength(MAX_ALERT_BODY);
    expect(body.endsWith("…")).toBe(true);
  });
});
```

```ts
// artifacts/api-server/src/lib/alerts/__tests__/alert-render.test.ts
import { describe, expect, it } from "vitest";
import { renderAlert } from "../render";

/** Lê largura e altura do cabeçalho IHDR de um PNG (bytes 16..24). */
function pngSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const arte = { title: "Hoje fechamos às 18h", body: "Voltamos amanhã às 8h." };

describe("renderAlert", () => {
  it("aviso deitado vira PNG 1920×1080", async () => {
    expect(pngSize(await renderAlert(arte, "landscape"))).toEqual({ width: 1920, height: 1080 });
  });

  it("aviso em pé vira PNG 1080×1920", async () => {
    expect(pngSize(await renderAlert(arte, "portrait"))).toEqual({ width: 1080, height: 1920 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/alerts/__tests__/alert-template.test.ts src/lib/alerts/__tests__/alert-render.test.ts`
Expected: FAIL — módulos `../alert-template` e `../render` não existem.

- [ ] **Step 3: Exportar `rasterize`**

Em `artifacts/api-server/src/lib/panels/render.ts`, trocar `async function rasterize(` por `export async function rasterize(` e acrescentar logo acima um comentário de uma linha: `// Exportada: o aviso urgente (lib/alerts) usa o mesmo caminho satori → PNG.`

- [ ] **Step 4: Implementar o template e o render**

```ts
// artifacts/api-server/src/lib/alerts/alert-template.ts
import { truncate } from "../panels/format";

/** Limites de caractere; a API recusa acima disso e o template corta por garantia. */
export const MAX_ALERT_TITLE = 60;
export const MAX_ALERT_BODY = 140;

export type AlertOrientation = "landscape" | "portrait";
export type AlertArt = { title: string; body: string | null };

/** Deitado é a TV comum; em pé é a TV girada na parede (as duas existem na rede). */
export function alertSize(orientation: AlertOrientation): { width: number; height: number } {
  return orientation === "portrait" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

// Vermelho escuro com faixa amarela: tem de parecer aviso, não anúncio.
const COLORS = {
  background: "#7F1D1D",
  band: "#FBBF24",
  bandText: "#1F2937",
  text: "#FFFFFF",
  muted: "#FECACA",
};

/** Nó satori: mesma forma de um elemento React, sem depender do React aqui. */
const node = (type: string, props: Record<string, unknown>) => ({ type, props });

export function alertNode(art: AlertArt, orientation: AlertOrientation): unknown {
  const portrait = orientation === "portrait";
  return node("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      backgroundColor: COLORS.background,
      color: COLORS.text,
      fontFamily: "Inter",
    },
    children: [
      node("div", {
        style: {
          display: "flex",
          alignItems: "center",
          height: portrait ? 160 : 120,
          padding: "0 80px",
          backgroundColor: COLORS.band,
          color: COLORS.bandText,
          fontSize: portrait ? 64 : 56,
          fontWeight: 700,
          letterSpacing: 4,
        },
        children: "AVISO",
      }),
      node("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          gap: 40,
          padding: portrait ? "0 80px" : "0 120px",
        },
        children: [
          node("div", {
            style: { fontSize: portrait ? 104 : 112, fontWeight: 700, lineHeight: 1.1 },
            children: truncate(art.title, MAX_ALERT_TITLE),
          }),
          art.body
            ? node("div", {
                style: { fontSize: portrait ? 52 : 56, color: COLORS.muted, lineHeight: 1.3 },
                children: truncate(art.body, MAX_ALERT_BODY),
              })
            : null,
        ].filter(Boolean),
      }),
    ],
  });
}
```

```ts
// artifacts/api-server/src/lib/alerts/render.ts
import { rasterize } from "../panels/render";
import { alertNode, alertSize, type AlertArt, type AlertOrientation } from "./alert-template";

/** PNG do aviso na orientação pedida (1920×1080 ou 1080×1920). */
export async function renderAlert(art: AlertArt, orientation: AlertOrientation): Promise<Buffer> {
  const { width, height } = alertSize(orientation);
  return rasterize(alertNode(art, orientation), width, height);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/alerts/__tests__/alert-template.test.ts src/lib/alerts/__tests__/alert-render.test.ts src/lib/panels/__tests__/render.test.ts`
Expected: PASS.

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/alerts artifacts/api-server/src/lib/panels/render.ts
git commit -F - <<'EOF'
feat(api): arte do aviso urgente deitada e em pé

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Tabela, consulta do aviso ativo e takeover no feed

**Files:**
- Create: `lib/db/src/schema/urgent_alerts.ts`
- Modify: `lib/db/src/schema/index.ts`
- Modify: `lib/db/src/schema/announcements.ts` (comentário do `source`)
- Create: `lib/db/drizzle/<gerado>.sql` (+ meta do drizzle-kit)
- Create: `artifacts/api-server/src/lib/alerts/active-alert.ts`
- Modify: `artifacts/api-server/src/lib/device-feed.ts`
- Modify: `lib/api-spec/openapi.yaml` (+ arquivos gerados em `lib/api-zod/src/generated` e `lib/api-client-react/src/generated`)
- Modify: `artifacts/signage/src/components/device-preview.tsx`
- Test: `artifacts/api-server/src/routes/__tests__/display-slides.test.ts`

**Interfaces:**
- Consumes: `activeAlertFor`, `alertPieceIdFor`, `AlertDevice` (Task 1).
- Produces:
  - `urgentAlertsTable` e `type UrgentAlert` exportados de `@workspace/db` (usados pela Task 5).
  - `export type AlertPiece = { announcementId: number; title: string; imageUrl: string | null; duration: number }`
  - `export async function findActiveAlertPiece(device: AlertDevice, screen: "landscape" | "portrait", now: Date): Promise<AlertPiece | null>` em `lib/alerts/active-alert.ts`.
  - `DeviceSlideSource` passa a incluir `"alert"`.

- [ ] **Step 1: Escrever os testes que falham**

Em `display-slides.test.ts`:

1. No mock de `@workspace/db`, acrescentar ao objeto devolvido:
   ```ts
  urgentAlertsTable: { id: "id", endedAt: "endedAt", endsAt: "endsAt" },
   ```
   e acrescentar `title: "title", imageUrl: "imageUrl", duration: "duration"` ao `announcementsTable` (mantendo as chaves existentes).
2. No fim do arquivo:

```ts
describe("GET /display/:deviceKey/feed — aviso urgente", () => {
  // Quarta, 12:00 em São Paulo; o aviso vai das 11:00 às 13:00.
  const AGORA = new Date("2026-10-07T15:00:00Z");
  const AVISO = {
    id: 1,
    title: "Hoje fechamos às 18h",
    body: null,
    targetMode: "all",
    segmentIds: [] as number[],
    companyIds: [] as number[],
    startsAt: new Date("2026-10-07T14:00:00Z"),
    endsAt: new Date("2026-10-07T16:00:00Z"),
    endedAt: null as Date | null,
    landscapeAnnouncementId: 901,
    portraitAnnouncementId: 902,
    createdAt: new Date("2026-10-07T14:00:00Z"),
  };
  const PECA = { announcementId: 901, title: "Hoje fechamos às 18h", imageUrl: "/api/uploads/aviso.png", duration: 15 };

  beforeEach(() => {
    dbSelect.mockReset();
    dbUpdate.mockReset();
    panelSlidesForClientMock.mockReset();
    panelSlidesForClientMock.mockResolvedValue([]);
    selectResults = [];
    selectCallIndex = 0;
    vi.useFakeTimers({ now: AGORA, toFake: ["Date"] });
  });
  afterEach(() => vi.useRealTimers());

  async function feed() {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    return request(app).get("/display/tv-1/feed");
  }

  it("TV no alvo recebe só a peça do aviso, sem legenda nem QR", async () => {
    selectResults = [[{ ...DEVICE_ROW, showcase: false }], [PLAYLIST_ROW], [CAMPAIGN_ROW], [AVISO], [PECA]];
    const res = await feed();
    expect(res.body.slides.map((s: { announcementId: number }) => s.announcementId)).toEqual([901]);
    expect(res.body.slides[0]).toMatchObject({ imageUrl: "/api/uploads/aviso.png", displayText: null, qrImageUrl: null });
  });

  it("TV fora do alvo segue a volta normal", async () => {
    const outraEmpresa = { ...AVISO, targetMode: "companies", companyIds: [999] };
    selectResults = [[{ ...DEVICE_ROW, showcase: false }], [PLAYLIST_ROW], [CAMPAIGN_ROW], [outraEmpresa], [PECA]];
    const res = await feed();
    expect(res.body.slides.map((s: { announcementId: number }) => s.announcementId)).toEqual([
      CAMPAIGN_ROW.announcementId,
      PLAYLIST_ROW.announcementId,
    ]);
  });

  it("aviso já vencido que ainda veio do banco não toma a TV", async () => {
    const vencido = { ...AVISO, endsAt: new Date("2026-10-07T14:59:00Z") };
    selectResults = [[{ ...DEVICE_ROW, showcase: false }], [PLAYLIST_ROW], [CAMPAIGN_ROW], [vencido], [PECA]];
    const res = await feed();
    expect(res.body.slides.map((s: { announcementId: number }) => s.announcementId)).not.toContain(901);
  });

  it("arte da orientação apagada → volta normal", async () => {
    const semArte = { ...AVISO, landscapeAnnouncementId: null };
    selectResults = [[{ ...DEVICE_ROW, showcase: false }], [PLAYLIST_ROW], [CAMPAIGN_ROW], [semArte], [PECA]];
    const res = await feed();
    expect(res.body.slides.map((s: { announcementId: number }) => s.announcementId)).toEqual([
      CAMPAIGN_ROW.announcementId,
      PLAYLIST_ROW.announcementId,
    ]);
  });

  it("vitrine ignora o aviso", async () => {
    selectResults = [[{ ...DEVICE_ROW, showcase: true }], [PLAYLIST_ROW], [CAMPAIGN_ROW], [AVISO], [PECA]];
    const res = await feed();
    expect(res.body.slides.map((s: { announcementId: number }) => s.announcementId)).not.toContain(901);
  });

  it("falha ao consultar avisos não tira a programação do ar", async () => {
    const falha = { then: (_ok: unknown, fail: (e: unknown) => void) => fail(new Error("relation does not exist")) };
    selectResults = [[{ ...DEVICE_ROW, showcase: false }], [PLAYLIST_ROW], [CAMPAIGN_ROW], falha];
    const res = await feed();
    expect(res.status).toBe(200);
    expect(res.body.slides.map((s: { announcementId: number }) => s.announcementId)).toEqual([
      CAMPAIGN_ROW.announcementId,
      PLAYLIST_ROW.announcementId,
    ]);
  });
});
```

Se `afterEach` não estiver importado de `vitest` no arquivo, acrescentar ao import.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/display-slides.test.ts`
Expected: FAIL — o primeiro teste novo recebe a volta normal em vez de `[901]`.

- [ ] **Step 3: Tabela e migração**

```ts
// lib/db/src/schema/urgent_alerts.ts
import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { announcementsTable } from "./announcements";

/**
 * Aviso urgente do admin: toma as TVs do alvo até `ends_at` (no máximo 24h
 * depois da criação) ou até ser encerrado (`ended_at`). Alvo em arrays na
 * própria linha: o aviso vive horas, não é editado e o feed lê tudo de uma vez.
 */
export const urgentAlertsTable = pgTable(
  "urgent_alerts",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body"),
    // "all" | "segments" | "companies"
    targetMode: text("target_mode").notNull(),
    segmentIds: integer("segment_ids").array().notNull().default([]),
    companyIds: integer("company_ids").array().notNull().default([]),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    // As duas artes geradas na criação. Peça apagada vira nulo e a TV daquela
    // orientação segue a programação normal.
    landscapeAnnouncementId: integer("landscape_announcement_id").references(() => announcementsTable.id, { onDelete: "set null" }),
    portraitAnnouncementId: integer("portrait_announcement_id").references(() => announcementsTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Toda TV consulta os avisos não vencidos a cada busca do feed.
  (t) => [index("urgent_alerts_ends_at_idx").on(t.endsAt)],
);

export type UrgentAlert = typeof urgentAlertsTable.$inferSelect;
```

Em `lib/db/src/schema/index.ts`, acrescentar no fim: `export * from "./urgent_alerts";`

Em `lib/db/src/schema/announcements.ts`, no comentário da coluna `source`, acrescentar o valor novo: `// "admin" (peça subida no painel de gestão) | "panel" (gerada por um painel do cliente) | "alert" (arte de aviso urgente; fora da biblioteca).` mantendo o resto do comentário existente.

Gerar e conferir:

```bash
cd lib/db && npx tsc --build && cd ../..
DATABASE_URL=postgres://u:p@localhost:5432/x pnpm --filter @workspace/db run generate
ls -t lib/db/drizzle/*.sql | head -1 | xargs cat
```

Expected: só `CREATE TABLE "urgent_alerts"`, as duas `FOREIGN KEY` para `announcements` (`ON DELETE set null`) e o `CREATE INDEX "urgent_alerts_ends_at_idx"`. Qualquer outra alteração → parar e reportar BLOCKED com o SQL.

- [ ] **Step 4: Consulta do aviso ativo**

```ts
// artifacts/api-server/src/lib/alerts/active-alert.ts
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, announcementsTable, urgentAlertsTable } from "@workspace/db";
import { activeAlertFor, alertPieceIdFor, type AlertDevice } from "./alert-eligibility";

export type AlertPiece = { announcementId: number; title: string; imageUrl: string | null; duration: number };

/**
 * A peça do aviso que toma esta TV agora, ou null. O banco só corta os
 * encerrados e os vencidos (índice em ends_at); início, alvo e desempate ficam
 * nas regras puras. Lista vazia ou ausente vale "nenhum aviso".
 */
export async function findActiveAlertPiece(
  device: AlertDevice,
  screen: "landscape" | "portrait",
  now: Date,
): Promise<AlertPiece | null> {
  const alerts =
    (await db
      .select()
      .from(urgentAlertsTable)
      .where(and(isNull(urgentAlertsTable.endedAt), gt(urgentAlertsTable.endsAt, now)))) ?? [];
  const alert = activeAlertFor(alerts, device, now);
  if (!alert) return null;
  const announcementId = alertPieceIdFor(alert, screen);
  if (announcementId === null) return null;
  const [piece] =
    (await db
      .select({
        announcementId: announcementsTable.id,
        title: announcementsTable.title,
        imageUrl: announcementsTable.imageUrl,
        duration: announcementsTable.duration,
      })
      .from(announcementsTable)
      .where(eq(announcementsTable.id, announcementId))) ?? [];
  return piece ?? null;
}
```

- [ ] **Step 5: Takeover no feed**

Em `artifacts/api-server/src/lib/device-feed.ts`:

1. Import: `import { findActiveAlertPiece } from "./alerts/active-alert";`
2. `export type DeviceSlideSource = "campaign" | "panel" | "playlist" | "alert";` e acrescentar ao comentário dela "ou aviso urgente do admin".
3. Logo depois do bloco `let panelSlides ... if (!device.showcase) { try { ... } catch ... }` e **antes** de `const screen = screenOrientationOf(device.orientation);`, mover a declaração de `screen` para antes deste trecho novo (uma só declaração) e inserir:

```ts
  // Aviso urgente toma a TV inteira: a volta vira só a arte dele, na
  // orientação da tela. A vitrine fica de fora (é espelhada na landing
  // pública). Falha aqui nunca derruba a programação — loga e segue.
  if (!device.showcase) {
    try {
      const alert = await findActiveAlertPiece(device, screen, now);
      if (alert) {
        return [
          {
            announcementId: alert.announcementId,
            campaignId: null,
            title: alert.title,
            displayText: null,
            imageUrl: alert.imageUrl,
            duration: alert.duration,
            mediaKind: "image",
            youtubeId: null,
            playbackMode: "capped",
            audioMode: "muted",
            source: "alert" as const,
            qrImageUrl: null,
            videoIds: null,
          },
        ];
      }
    } catch (error) {
      log.error({ err: error }, "Could not load urgent alert for device");
    }
  }
```

Se o TypeScript reclamar do tipo de retorno (a função passa a devolver dois formatos de array), declarar o tipo explícito do slide da TV e anotar o retorno de `loadDeviceSlides` como `Promise<FeedSlide[]>`, com `FeedSlide` contendo exatamente os campos que o `.map` final já devolve (`announcementId, campaignId, title, displayText, imageUrl, duration, mediaKind, youtubeId, playbackMode, audioMode, source, qrImageUrl, videoIds`). Não mudar os valores devolvidos na volta normal.

- [ ] **Step 6: Contrato da prévia aceita `alert`**

Em `lib/api-spec/openapi.yaml`, no schema `DevicePreviewSlide`, trocar `enum: [campaign, panel, playlist]` por `enum: [campaign, panel, playlist, alert]`. Regenerar:

```bash
pnpm --filter @workspace/api-spec run codegen
git diff --stat lib/api-zod lib/api-client-react
```

Expected: só os arquivos gerados mudam, e só no enum de `source` da prévia.

Em `artifacts/signage/src/components/device-preview.tsx`, acrescentar ao `SOURCE_LABEL`: `alert: 'Aviso urgente',`.

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/display-slides.test.ts src/routes/__tests__/device-preview.test.ts src/routes/__tests__/portal-device-preview.test.ts src/routes/__tests__/public-vitrine.test.ts`
Expected: PASS (os antigos seguem iguais: a consulta de avisos recebe vazio do mock).

Run: `pnpm --filter @workspace/api-server run test && pnpm run typecheck && pnpm --filter @workspace/signage run test`
Expected: tudo verde.

- [ ] **Step 8: Commit**

```bash
git add lib/db/src/schema lib/db/drizzle artifacts/api-server/src/lib/alerts/active-alert.ts artifacts/api-server/src/lib/device-feed.ts artifacts/api-server/src/routes/__tests__/display-slides.test.ts lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/signage/src/components/device-preview.tsx
git commit -F - <<'EOF'
feat(api): aviso urgente toma o feed das TVs do alvo

Tabela urgent_alerts com migração. A vitrine ignora o aviso, e falha ao
consultar avisos mantém a programação normal.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Telemetria descarta aviso e biblioteca não mostra aviso

**Files:**
- Modify: `artifacts/api-server/src/routes/telemetry.ts`
- Modify: `artifacts/api-server/src/routes/announcements.ts`
- Test: `artifacts/api-server/src/routes/__tests__/telemetry-plays.test.ts`
- Test: `artifacts/api-server/src/routes/__tests__/announcements-list-query.test.ts` (novo)

**Interfaces:**
- Consumes: `announcementsTable.source` (valor `"alert"` da Task 3).
- Produces: `export function buildAnnouncementsListQuery()` em `routes/announcements.ts`.

- [ ] **Step 1: Escrever os testes que falham**

Em `telemetry-plays.test.ts`:

1. No mock de `@workspace/db`, trocar `announcementsTable: { id: "id" }` por `announcementsTable: { id: "id", source: "source" }`.
2. No fim do arquivo:

```ts
describe("exibição de aviso urgente não conta", () => {
  async function postTo(app: Express, path: string, body: unknown) {
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const { port } = server.address() as { port: number };
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    } finally {
      server.close();
    }
  }

  it("lote: peça de aviso é descartada e o resto entra", async () => {
    inserted = [];
    selectResults = [[{ id: 1 }], [{ id: 5, source: "alert" }, { id: 6, source: "admin" }], []];
    returningRows = [{ id: 77 }];
    const app = await buildApp();
    const res = await postTo(app, "/telemetry/plays", {
      deviceKey: "tv-1",
      plays: [
        { playId: "a", announcementId: 5, durationSeconds: 15, ageSeconds: 1 },
        { playId: "b", announcementId: 6, durationSeconds: 10, ageSeconds: 1 },
      ],
    });
    expect(res.status).toBe(200);
    expect(inserted.map((row) => row.announcementId)).toEqual([6]);
    expect(res.body.discarded).toBe(1);
  });

  it("endpoint antigo: aviso responde ok e não grava", async () => {
    inserted = [];
    selectResults = [[{ id: 1, deviceKey: "tv-1" }], [{ source: "alert" }]];
    const app = await buildApp();
    const res = await postTo(app, "/telemetry/play", { deviceKey: "tv-1", announcementId: 5, durationSeconds: 15 });
    expect(res.status).toBe(201);
    expect(inserted).toEqual([]);
  });
});
```

Se `RecordPlayBody`/`RecordPlaysBody` exigirem outros campos nos itens (ver os testes existentes do arquivo), usar o mesmo formato deles.

Novo `announcements-list-query.test.ts`:

```ts
// artifacts/api-server/src/routes/__tests__/announcements-list-query.test.ts
import { afterAll, describe, expect, it } from "vitest";

// `.toSQL()` só monta o SQL; o DATABASE_URL fictício é só para o import de
// @workspace/db e é desfeito no fim (mesmo truque de device-feed-query.test).
const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
afterAll(() => {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

const { buildAnnouncementsListQuery } = await import("../announcements");

describe("buildAnnouncementsListQuery", () => {
  it("deixa de fora as artes de aviso urgente", () => {
    const { sql, params } = buildAnnouncementsListQuery().toSQL();
    expect(sql).toContain('"announcements"."source" <> $1');
    expect(params[0]).toBe("alert");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/telemetry-plays.test.ts src/routes/__tests__/announcements-list-query.test.ts`
Expected: FAIL — a peça 5 entra no lote; o endpoint antigo grava; `buildAnnouncementsListQuery` não existe.

- [ ] **Step 3: Implementar a telemetria**

Em `routes/telemetry.ts`:

1. Em `/telemetry/play`, logo depois do `if (!device) { ... }`:

```ts
  // Arte de aviso urgente não conta exibição (ver /telemetry/plays): responde
  // como se tivesse gravado para a TV não reenviar.
  const [piece] = await db
    .select({ source: announcementsTable.source })
    .from(announcementsTable)
    .where(eq(announcementsTable.id, announcementId));
  if (piece?.source === "alert") {
    res.status(201).json({ ok: true });
    return;
  }
```

2. Em `/telemetry/plays`, trocar a consulta das peças e o `Set` passado ao `buildPlayRows`:

```ts
  const announcements = await db
    .select({ id: announcementsTable.id, source: announcementsTable.source })
    .from(announcementsTable)
    .where(inArray(announcementsTable.id, announcementIds));
```

e, no `buildPlayRows(...)`, o terceiro argumento vira:

```ts
    // Arte de aviso urgente não conta exibição: entra como descartada, a TV
    // esvazia a fila e o contador público não infla durante o aviso.
    new Set(announcements.filter((a) => a.source !== "alert").map((a) => a.id)),
```

- [ ] **Step 4: Implementar a biblioteca sem avisos**

Em `routes/announcements.ts`:

1. Acrescentar `ne` ao import de `drizzle-orm` (manter os existentes).
2. Antes de `router.get("/announcements", ...)`:

```ts
/**
 * Biblioteca de peças: tudo menos as artes de aviso urgente, que só existem
 * para a TV registrar a exibição e não podem ser escolhidas para campanha.
 * Separada para o teste conferir o SQL sem banco.
 */
export function buildAnnouncementsListQuery() {
  return db
    .select()
    .from(announcementsTable)
    .where(ne(announcementsTable.source, "alert"))
    .orderBy(asc(announcementsTable.displayOrder), asc(announcementsTable.createdAt));
}
```

3. No handler, trocar a consulta inline por `const rows = await buildAnnouncementsListQuery();`.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/telemetry-plays.test.ts src/routes/__tests__/announcements-list-query.test.ts`
Expected: PASS.

Run: `pnpm --filter @workspace/api-server run test && pnpm --filter @workspace/api-server run typecheck`
Expected: tudo verde (se algum teste antigo de `/announcements` mockar o banco sem `.where`, ajustar o mock dele para aceitar `.where` e dizer qual no relatório).

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/telemetry.ts artifacts/api-server/src/routes/announcements.ts artifacts/api-server/src/routes/__tests__/telemetry-plays.test.ts artifacts/api-server/src/routes/__tests__/announcements-list-query.test.ts
git commit -F - <<'EOF'
feat(api): aviso urgente não conta exibição nem aparece na biblioteca

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: API de avisos urgentes

**Files:**
- Create: `artifacts/api-server/src/lib/alerts/alert-input.ts`
- Create: `artifacts/api-server/src/routes/urgent-alerts.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Test: `artifacts/api-server/src/routes/__tests__/urgent-alerts.test.ts`

**Interfaces:**
- Consumes: `alertReachesDevice`, `alertStatus` (Task 1); `renderAlert`, `MAX_ALERT_TITLE`, `MAX_ALERT_BODY` (Task 2); `urgentAlertsTable`, `UrgentAlert` (Task 3); `mediaStore()` de `lib/storage`.
- Produces (usado pela Task 6): `POST /urgent-alerts`, `GET /urgent-alerts`, `POST /urgent-alerts/:id/end`, todos respondendo o formato `UrgentAlertView`:
  `{ id, title, body, targetMode, segmentIds, companyIds, startsAt, endsAt, endedAt, status, reachedDevices, landscapeImageUrl, portraitImageUrl }` (datas em ISO).

- [ ] **Step 1: Escrever o teste que falha**

```ts
// artifacts/api-server/src/routes/__tests__/urgent-alerts.test.ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Banco falso com despacho por identidade de tabela (tabelas reais de
 * @workspace/db/schema). `where` não filtra: cada teste põe no estado só as
 * linhas que a consulta deveria achar.
 */
const state = vi.hoisted(() => ({
  alerts: [] as Array<Record<string, unknown>>,
  devices: [] as Array<Record<string, unknown>>,
  pieces: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
  nextId: 100,
}));

const renderAlertMock = vi.hoisted(() => vi.fn());
const putMock = vi.hoisted(() => vi.fn());

vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const name = (table: unknown) =>
    table === schema.urgentAlertsTable
      ? "urgent_alerts"
      : table === schema.announcementsTable
        ? "announcements"
        : table === schema.devicesTable
          ? "devices"
          : "outra";
  const rowsOf = (table: unknown) =>
    ({ urgent_alerts: state.alerts, announcements: state.pieces, devices: state.devices })[name(table)] ?? [];
  const query = (rows: unknown) => {
    const q: Record<string, unknown> = {
      then: (ok: (v: unknown) => void, fail?: (e: unknown) => void) => Promise.resolve(rows).then(ok, fail),
    };
    q.innerJoin = () => q;
    q.where = () => q;
    q.orderBy = () => q;
    q.limit = () => q;
    return q;
  };
  const db = {
    select: () => ({ from: (table: unknown) => query(rowsOf(table)) }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        state.inserts.push({ table: name(table), values });
        const row = { id: state.nextId++, endedAt: null, ...values };
        return { returning: () => Promise.resolve([row]) };
      },
    }),
    update: (table: unknown) => ({
      set: (patch: Record<string, unknown>) => {
        state.updates.push({ table: name(table), patch });
        return { where: () => ({ returning: () => Promise.resolve([{ ...state.alerts[0], ...patch }]) }) };
      },
    }),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(db),
  };
  return { db, ...schema };
});

vi.mock("../../lib/alerts/render", () => ({ renderAlert: (...a: unknown[]) => renderAlertMock(...a) }));
vi.mock("../../lib/storage", () => ({ mediaStore: () => ({ put: (...a: unknown[]) => putMock(...a) }) }));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../urgent-alerts");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(express.json());
  app.use(router);
  return app;
}

const corpo = (over: Record<string, unknown> = {}) => ({
  title: "Hoje fechamos às 18h",
  body: "Voltamos amanhã às 8h.",
  targetMode: "all",
  durationMinutes: 60,
  ...over,
});

const t = (iso: string) => new Date(iso);
function aviso(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    title: "Hoje fechamos às 18h",
    body: null,
    targetMode: "all",
    segmentIds: [],
    companyIds: [],
    startsAt: t("2026-10-07T14:00:00Z"),
    endsAt: t("2999-01-01T00:00:00Z"),
    endedAt: null,
    landscapeAnnouncementId: 901,
    portraitAnnouncementId: 902,
    createdAt: t("2026-10-07T14:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  state.alerts = [];
  state.devices = [];
  state.pieces = [];
  state.inserts = [];
  state.updates = [];
  state.nextId = 100;
  renderAlertMock.mockReset();
  renderAlertMock.mockResolvedValue(Buffer.from("png"));
  putMock.mockReset();
  putMock.mockImplementation((_b: Buffer, _m: string, name: string) => Promise.resolve(`/api/uploads/${name}`));
});

describe("POST /urgent-alerts", () => {
  it.each([
    ["título vazio", { title: "   " }],
    ["título longo", { title: "t".repeat(61) }],
    ["texto longo", { body: "b".repeat(141) }],
    ["segmentos sem segmento", { targetMode: "segments", segmentIds: [] }],
    ["empresas sem empresa", { targetMode: "companies", companyIds: [] }],
    ["duração fora da lista", { durationMinutes: 45 }],
    ["alvo desconhecido", { targetMode: "algumas" }],
  ])("400: %s, sem desenhar nada", async (_caso, over) => {
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).post("/urgent-alerts").send(corpo(over));
    expect(res.status).toBe(400);
    expect(renderAlertMock).not.toHaveBeenCalled();
    expect(state.inserts).toEqual([]);
  });

  it("desenha as duas artes, grava duas peças de aviso e o aviso", async () => {
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).post("/urgent-alerts").send(corpo());
    expect(res.status).toBe(201);
    expect(renderAlertMock.mock.calls.map((c) => c[1]).sort()).toEqual(["landscape", "portrait"]);
    expect(renderAlertMock.mock.calls[0][0]).toEqual({ title: "Hoje fechamos às 18h", body: "Voltamos amanhã às 8h." });

    const pecas = state.inserts.filter((i) => i.table === "announcements").map((i) => i.values);
    expect(pecas.map((p) => [p.source, p.orientation, p.mediaKind])).toEqual([
      ["alert", "landscape", "image"],
      ["alert", "portrait", "image"],
    ]);

    const [gravado] = state.inserts.filter((i) => i.table === "urgent_alerts").map((i) => i.values);
    expect(gravado.landscapeAnnouncementId).toBe(100);
    expect(gravado.portraitAnnouncementId).toBe(101);
    const minutos = ((gravado.endsAt as Date).getTime() - (gravado.startsAt as Date).getTime()) / 60_000;
    expect(minutos).toBe(60);
    expect(res.body.status).toBe("active");
  });

  it("texto vazio vira nulo", async () => {
    const { default: request } = await import("supertest");
    await request(await buildApp()).post("/urgent-alerts").send(corpo({ body: "" }));
    const [gravado] = state.inserts.filter((i) => i.table === "urgent_alerts").map((i) => i.values);
    expect(gravado.body).toBeNull();
  });

  it("por segmento grava só os segmentos, mesmo vindo empresas", async () => {
    const { default: request } = await import("supertest");
    await request(await buildApp())
      .post("/urgent-alerts")
      .send(corpo({ targetMode: "segments", segmentIds: [5], companyIds: [9] }));
    const [gravado] = state.inserts.filter((i) => i.table === "urgent_alerts").map((i) => i.values);
    expect(gravado.segmentIds).toEqual([5]);
    expect(gravado.companyIds).toEqual([]);
  });

  it("falha ao desenhar → 500 e nada gravado", async () => {
    renderAlertMock.mockRejectedValue(new Error("satori"));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).post("/urgent-alerts").send(corpo());
    expect(res.status).toBe(500);
    expect(state.inserts).toEqual([]);
    expect(putMock).not.toHaveBeenCalled();
  });
});

describe("GET /urgent-alerts", () => {
  it("ativos primeiro, com TVs atingidas (sem a vitrine) e as artes", async () => {
    state.alerts = [
      aviso({ id: 8, endsAt: t("2026-10-07T15:00:00Z"), createdAt: t("2026-10-07T14:30:00Z") }),
      aviso({ id: 7 }),
    ];
    state.devices = [
      { companyId: 1, segmentId: 5, showcase: false },
      { companyId: 2, segmentId: null, showcase: false },
      { companyId: 3, segmentId: 5, showcase: true },
    ];
    state.pieces = [
      { id: 901, imageUrl: "/api/uploads/d.png" },
      { id: 902, imageUrl: "/api/uploads/e.png" },
    ];
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/urgent-alerts");
    expect(res.status).toBe(200);
    expect(res.body.map((a: { id: number; status: string }) => [a.id, a.status])).toEqual([
      [7, "active"],
      [8, "expired"],
    ]);
    expect(res.body[0]).toMatchObject({
      reachedDevices: 2,
      landscapeImageUrl: "/api/uploads/d.png",
      portraitImageUrl: "/api/uploads/e.png",
    });
  });
});

describe("POST /urgent-alerts/:id/end", () => {
  it("grava o encerramento", async () => {
    state.alerts = [aviso()];
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).post("/urgent-alerts/7/end");
    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].patch.endedAt).toBeInstanceOf(Date);
    expect(res.body.status).toBe("ended");
  });

  it("já encerrado não regrava", async () => {
    state.alerts = [aviso({ endedAt: t("2026-10-07T14:10:00Z") })];
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).post("/urgent-alerts/7/end");
    expect(res.status).toBe(200);
    expect(state.updates).toEqual([]);
  });

  it("aviso inexistente → 404", async () => {
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).post("/urgent-alerts/99/end");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/urgent-alerts.test.ts`
Expected: FAIL — `Failed to load url ../urgent-alerts`.

- [ ] **Step 3: Implementar a validação**

```ts
// artifacts/api-server/src/lib/alerts/alert-input.ts
import { z } from "zod";
import { MAX_ALERT_BODY, MAX_ALERT_TITLE } from "./alert-template";

/** Durações que o admin pode escolher, em minutos. 24h é o teto: aviso esquecido não trava a rede. */
export const ALERT_DURATIONS = [30, 60, 120, 240, 480, 1440] as const;

export const alertInput = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Escreva o título do aviso.")
      .max(MAX_ALERT_TITLE, `O título tem no máximo ${MAX_ALERT_TITLE} caracteres.`),
    body: z
      .string()
      .trim()
      .max(MAX_ALERT_BODY, `O texto tem no máximo ${MAX_ALERT_BODY} caracteres.`)
      .nullish()
      .transform((value) => (value ? value : null)),
    targetMode: z.enum(["all", "segments", "companies"]),
    segmentIds: z.array(z.coerce.number().int().positive()).default([]),
    companyIds: z.array(z.coerce.number().int().positive()).default([]),
    durationMinutes: z.coerce
      .number()
      .refine((n) => (ALERT_DURATIONS as readonly number[]).includes(n), "Escolha uma duração da lista."),
  })
  .refine((v) => v.targetMode !== "segments" || v.segmentIds.length > 0, {
    message: "Escolha ao menos um segmento.",
  })
  .refine((v) => v.targetMode !== "companies" || v.companyIds.length > 0, {
    message: "Escolha ao menos uma empresa.",
  });

export type AlertInput = z.infer<typeof alertInput>;
```

- [ ] **Step 4: Implementar as rotas**

```ts
// artifacts/api-server/src/routes/urgent-alerts.ts
import { Router, type IRouter } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import {
  db,
  announcementsTable,
  clientsTable,
  companiesTable,
  devicesTable,
  urgentAlertsTable,
  type UrgentAlert,
} from "@workspace/db";
import { alertInput } from "../lib/alerts/alert-input";
import { alertReachesDevice, alertStatus } from "../lib/alerts/alert-eligibility";
import { renderAlert } from "../lib/alerts/render";
import { mediaStore } from "../lib/storage";

const router: IRouter = Router();

/** Quantos avisos fora do ar o histórico mostra. */
const HISTORY_LIMIT = 20;

/**
 * Formato que o admin lê: status calculado agora, quantas TVs o alvo pega
 * (vitrine fora, ela ignora avisos) e as URLs das duas artes.
 */
async function describeAlerts(rows: UrgentAlert[], now: Date = new Date()) {
  const devices = await db
    .select({ companyId: clientsTable.companyId, segmentId: companiesTable.segmentId, showcase: devicesTable.showcase })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId));
  const screens = devices.filter((device) => !device.showcase);

  const pieceIds = rows
    .flatMap((row) => [row.landscapeAnnouncementId, row.portraitAnnouncementId])
    .filter((id): id is number => id != null);
  const pieces = pieceIds.length
    ? await db
        .select({ id: announcementsTable.id, imageUrl: announcementsTable.imageUrl })
        .from(announcementsTable)
        .where(inArray(announcementsTable.id, pieceIds))
    : [];
  const imageOf = new Map(pieces.map((piece) => [piece.id, piece.imageUrl]));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    targetMode: row.targetMode,
    segmentIds: row.segmentIds,
    companyIds: row.companyIds,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    status: alertStatus(row, now),
    reachedDevices: screens.filter((device) => alertReachesDevice(row, device)).length,
    landscapeImageUrl: row.landscapeAnnouncementId != null ? imageOf.get(row.landscapeAnnouncementId) ?? null : null,
    portraitImageUrl: row.portraitAnnouncementId != null ? imageOf.get(row.portraitAnnouncementId) ?? null : null,
  }));
}

router.post("/urgent-alerts", async (req, res): Promise<void> => {
  const parsed = alertInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
    return;
  }
  const input = parsed.data;
  const now = new Date();
  const art = { title: input.title, body: input.body };

  // Desenha tudo antes de gravar qualquer coisa: arte que falha não deixa
  // aviso pela metade no banco.
  let landscapePng: Buffer;
  let portraitPng: Buffer;
  try {
    [landscapePng, portraitPng] = await Promise.all([renderAlert(art, "landscape"), renderAlert(art, "portrait")]);
  } catch (err) {
    req.log.error({ err }, "Falha ao desenhar o aviso urgente");
    res.status(500).json({ error: "Não foi possível gerar a arte do aviso." });
    return;
  }

  const store = mediaStore();
  const stamp = now.getTime();
  const [landscapeUrl, portraitUrl] = await Promise.all([
    store.put(landscapePng, "image/png", `alert-${stamp}-landscape.png`),
    store.put(portraitPng, "image/png", `alert-${stamp}-portrait.png`),
  ]);

  const piece = (orientation: "landscape" | "portrait", imageUrl: string) => ({
    title: input.title,
    imageUrl,
    mediaKind: "image",
    orientation,
    source: "alert",
    duration: 15,
    isActive: true,
  });

  const alert = await db.transaction(async (tx) => {
    const [landscape] = await tx
      .insert(announcementsTable)
      .values(piece("landscape", landscapeUrl))
      .returning({ id: announcementsTable.id });
    const [portrait] = await tx
      .insert(announcementsTable)
      .values(piece("portrait", portraitUrl))
      .returning({ id: announcementsTable.id });
    const [row] = await tx
      .insert(urgentAlertsTable)
      .values({
        title: input.title,
        body: input.body,
        targetMode: input.targetMode,
        // Só o alvo do modo escolhido vai para o banco.
        segmentIds: input.targetMode === "segments" ? input.segmentIds : [],
        companyIds: input.targetMode === "companies" ? input.companyIds : [],
        startsAt: now,
        endsAt: new Date(stamp + input.durationMinutes * 60_000),
        landscapeAnnouncementId: landscape.id,
        portraitAnnouncementId: portrait.id,
        createdAt: now,
      })
      .returning();
    return row;
  });

  const [view] = await describeAlerts([alert], now);
  res.status(201).json(view);
});

router.get("/urgent-alerts", async (_req, res): Promise<void> => {
  const now = new Date();
  const rows = await db
    .select()
    .from(urgentAlertsTable)
    .orderBy(desc(urgentAlertsTable.createdAt), desc(urgentAlertsTable.id))
    .limit(100);
  const byNewest = [...rows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
  );
  const active = byNewest.filter((row) => alertStatus(row, now) === "active");
  const history = byNewest.filter((row) => alertStatus(row, now) !== "active").slice(0, HISTORY_LIMIT);
  res.json(await describeAlerts([...active, ...history], now));
});

router.post("/urgent-alerts/:id/end", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [existing] = Number.isInteger(id) && id > 0
    ? await db.select().from(urgentAlertsTable).where(eq(urgentAlertsTable.id, id))
    : [];
  if (!existing) {
    res.status(404).json({ error: "Aviso não encontrado." });
    return;
  }
  // Encerrar de novo não muda a hora do primeiro encerramento.
  let row = existing;
  if (!existing.endedAt) {
    [row] = await db
      .update(urgentAlertsTable)
      .set({ endedAt: new Date() })
      .where(eq(urgentAlertsTable.id, id))
      .returning();
  }
  const [view] = await describeAlerts([row]);
  res.json(view);
});

export default router;
```

(O `sort` em memória repete a ordem do SQL de propósito: o teste usa banco falso que não ordena, e a regra "mais recente primeiro" tem de valer de qualquer jeito.)

Em `routes/index.ts`: `import urgentAlertsRouter from "./urgent-alerts";` junto dos outros imports e `router.use(urgentAlertsRouter);` logo depois de `router.use(analyticsRouter);` (depois do `requireAdmin`).

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/urgent-alerts.test.ts`
Expected: PASS.

Run: `pnpm --filter @workspace/api-server run test && pnpm --filter @workspace/api-server run typecheck`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/alerts/alert-input.ts artifacts/api-server/src/routes/urgent-alerts.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/src/routes/__tests__/urgent-alerts.test.ts
git commit -F - <<'EOF'
feat(api): rotas para publicar, listar e encerrar avisos urgentes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Tela "Avisos urgentes" no admin

**Files:**
- Create: `artifacts/signage/src/lib/urgent-alerts-api.ts`
- Create: `artifacts/signage/src/pages/urgent-alerts.tsx`
- Modify: `artifacts/signage/src/App.tsx`
- Modify: `artifacts/signage/src/components/nav-config.ts`
- Test: `artifacts/signage/src/pages/__tests__/urgent-alerts.test.tsx`
- Test: `artifacts/signage/src/components/__tests__/nav-config.test.ts`

**Interfaces:**
- Consumes: API da Task 5; `request`, `ApiError`, `listCompanies`, `companiesQueryKey` de `@/lib/companies-api`; `useListSegments` de `@workspace/api-client-react`; `mediaUrl` de `@/lib/media-url`.
- Produces: rota `/avisos`; item de menu "Avisos urgentes".

- [ ] **Step 1: Escrever os testes que falham**

Em `nav-config.test.ts`, no teste do admin, trocar a lista esperada de `hrefs(adminNav)` por:

```ts
    expect(hrefs(adminNav)).toEqual(['/', '/parque', '/avisos', '/companies', '/segments', '/admin', '/panels', '/divulgacao', '/users-admin']);
```

Novo `pages/__tests__/urgent-alerts.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toaster';
import UrgentAlerts from '../urgent-alerts';

function json(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

const PADARIA = { id: 1, slug: 'padaria', name: 'Padaria' };
const NO_AR = {
  id: 7,
  title: 'Hoje fechamos às 18h',
  body: null,
  targetMode: 'all',
  segmentIds: [],
  companyIds: [],
  startsAt: '2026-10-07T17:00:00.000Z',
  endsAt: '2026-10-07T21:00:00.000Z',
  endedAt: null,
  status: 'active',
  reachedDevices: 42,
  landscapeImageUrl: '/api/uploads/d.png',
  portraitImageUrl: '/api/uploads/e.png',
};

function stub(alerts: unknown[] = []) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/urgent-alerts') && init?.method === 'POST') return json(201, NO_AR);
    if (u.includes('/urgent-alerts')) return json(200, alerts);
    if (u.includes('/segments')) return json(200, [PADARIA]);
    if (u.includes('/companies')) return json(200, [{ id: 9, name: 'Mercado Bom', segmentId: 1 }]);
    return json(404, { error: 'não mockado' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <UrgentAlerts />
      <Toaster />
    </QueryClientProvider>,
  );
}

const posts = (fetchMock: ReturnType<typeof stub>) =>
  (fetchMock.mock.calls as unknown as [string, RequestInit | undefined][]).filter(([, init]) => init?.method === 'POST');

afterEach(() => vi.unstubAllGlobals());

describe('UrgentAlerts', () => {
  it('publica só depois de confirmar, com o corpo certo', async () => {
    const fetchMock = stub();
    renderPage();
    await userEvent.type(screen.getByLabelText('Título'), 'Hoje fechamos às 18h');
    await userEvent.click(screen.getByLabelText('Por segmento'));
    await userEvent.click(await screen.findByLabelText('Padaria'));
    await userEvent.selectOptions(screen.getByLabelText('Duração'), '120');
    await userEvent.click(screen.getByRole('button', { name: 'Publicar aviso' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Campanhas ficam pausadas nelas/)).toBeInTheDocument();
    expect(posts(fetchMock)).toHaveLength(0);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar agora' }));
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    expect(JSON.parse(posts(fetchMock)[0][1]!.body as string)).toEqual({
      title: 'Hoje fechamos às 18h',
      body: '',
      targetMode: 'segments',
      segmentIds: [1],
      companyIds: [],
      durationMinutes: 120,
    });
  });

  it('publicar fica desabilitado sem título', async () => {
    stub();
    renderPage();
    expect(screen.getByRole('button', { name: 'Publicar aviso' })).toBeDisabled();
  });

  it('mostra o aviso no ar e encerra depois de confirmar', async () => {
    const fetchMock = stub([NO_AR]);
    renderPage();
    expect(await screen.findByText(/No ar em 42 TVs até 18:00/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Encerrar agora' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(posts(fetchMock).map(([url]) => String(url))).toEqual([expect.stringContaining('/urgent-alerts/7/end')]));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/pages/__tests__/urgent-alerts.test.tsx src/components/__tests__/nav-config.test.ts`
Expected: FAIL — `../urgent-alerts` não existe; menu sem `/avisos`.

- [ ] **Step 3: Cliente HTTP**

```ts
// artifacts/signage/src/lib/urgent-alerts-api.ts
import { request } from '@/lib/companies-api';

export type AlertTargetMode = 'all' | 'segments' | 'companies';

export type UrgentAlert = {
  id: number;
  title: string;
  body: string | null;
  targetMode: AlertTargetMode;
  segmentIds: number[];
  companyIds: number[];
  startsAt: string;
  endsAt: string;
  endedAt: string | null;
  status: 'active' | 'expired' | 'ended';
  reachedDevices: number;
  landscapeImageUrl: string | null;
  portraitImageUrl: string | null;
};

export type NewUrgentAlert = {
  title: string;
  body: string;
  targetMode: AlertTargetMode;
  segmentIds: number[];
  companyIds: number[];
  durationMinutes: number;
};

/** Mesmas durações que a API aceita. */
export const ALERT_DURATIONS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hora' },
  { minutes: 120, label: '2 horas' },
  { minutes: 240, label: '4 horas' },
  { minutes: 480, label: '8 horas' },
  { minutes: 1440, label: '24 horas' },
] as const;

export const urgentAlertsQueryKey = ['urgent-alerts'] as const;

export const listUrgentAlerts = () => request<UrgentAlert[]>('/urgent-alerts');

export const createUrgentAlert = (input: NewUrgentAlert) =>
  request<UrgentAlert>('/urgent-alerts', { method: 'POST', body: JSON.stringify(input) });

export const endUrgentAlert = (id: number) =>
  request<UrgentAlert>(`/urgent-alerts/${id}/end`, { method: 'POST' });
```

- [ ] **Step 4: Página**

```tsx
// artifacts/signage/src/pages/urgent-alerts.tsx
import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useListSegments } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ApiError, companiesQueryKey, listCompanies } from '@/lib/companies-api';
import { mediaUrl } from '@/lib/media-url';
import {
  ALERT_DURATIONS,
  createUrgentAlert,
  endUrgentAlert,
  listUrgentAlerts,
  urgentAlertsQueryKey,
  type AlertTargetMode,
  type UrgentAlert,
} from '@/lib/urgent-alerts-api';

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

/** Hora de quem assiste à TV, não a do navegador do admin. */
function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

const STATUS_LABEL: Record<UrgentAlert['status'], string> = { active: 'No ar', expired: 'Expirado', ended: 'Encerrado' };

function targetLabel(alert: UrgentAlert) {
  if (alert.targetMode === 'segments') return `${alert.segmentIds.length} segmento(s)`;
  if (alert.targetMode === 'companies') return `${alert.companyIds.length} empresa(s)`;
  return 'Todas as TVs';
}

const TARGETS: Array<{ value: AlertTargetMode; label: string }> = [
  { value: 'all', label: 'Todas as TVs' },
  { value: 'segments', label: 'Por segmento' },
  { value: 'companies', label: 'Por empresa' },
];

export default function UrgentAlerts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: alerts = [] } = useQuery({ queryKey: urgentAlertsQueryKey, queryFn: listUrgentAlerts });
  const { data: segments = [] } = useListSegments();
  const { data: companies = [] } = useQuery({ queryKey: [...companiesQueryKey, {}], queryFn: () => listCompanies() });

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetMode, setTargetMode] = useState<AlertTargetMode>('all');
  const [segmentIds, setSegmentIds] = useState<number[]>([]);
  const [companyIds, setCompanyIds] = useState<number[]>([]);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [confirming, setConfirming] = useState(false);
  const [ending, setEnding] = useState<UrgentAlert | null>(null);

  const active = alerts.filter((alert) => alert.status === 'active');
  const targetMissing =
    (targetMode === 'segments' && segmentIds.length === 0) || (targetMode === 'companies' && companyIds.length === 0);
  const canPublish = title.trim().length > 0 && !targetMissing;

  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  function openConfirm(event: FormEvent) {
    event.preventDefault();
    if (canPublish) setConfirming(true);
  }

  async function publish() {
    try {
      await createUrgentAlert({ title, body, targetMode, segmentIds, companyIds, durationMinutes });
      toast({ title: 'Aviso no ar. As TVs mostram em até 1 minuto.' });
      setTitle('');
      setBody('');
      setTargetMode('all');
      setSegmentIds([]);
      setCompanyIds([]);
    } catch (err) {
      toast({ title: errorMessage(err, 'Não foi possível publicar o aviso.'), variant: 'destructive' });
    } finally {
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: urgentAlertsQueryKey });
    }
  }

  async function endNow() {
    if (!ending) return;
    try {
      await endUrgentAlert(ending.id);
      toast({ title: 'Aviso encerrado. As TVs voltam à programação em até 1 minuto.' });
    } catch (err) {
      toast({ title: errorMessage(err, 'Não foi possível encerrar o aviso.'), variant: 'destructive' });
    } finally {
      setEnding(null);
      await queryClient.invalidateQueries({ queryKey: urgentAlertsQueryKey });
    }
  }

  // Prévia do fim para a confirmação: o servidor conta a partir do envio.
  const endsAtPreview = hhmm(new Date(Date.now() + durationMinutes * 60_000).toISOString());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Avisos urgentes</h1>
        <p className="text-sm text-muted-foreground">
          O aviso toma as TVs escolhidas na hora: elas mostram só ele até o fim do prazo ou até você encerrar.
        </p>
      </div>

      {active.map((alert) => (
        <div key={alert.id} role="status" className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
          <p className="text-sm">
            No ar em {alert.reachedDevices} TVs até {hhmm(alert.endsAt)} — <strong>{alert.title}</strong>
          </p>
          <Button variant="destructive" size="sm" onClick={() => setEnding(alert)}>Encerrar agora</Button>
        </div>
      ))}

      <form onSubmit={openConfirm} className="space-y-4 rounded-lg border p-4">
        <div className="space-y-2">
          <Label htmlFor="alert-title">Título</Label>
          <Input id="alert-title" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Hoje fechamos às 18h" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="alert-body">Texto (opcional)</Label>
          <Input id="alert-body" maxLength={140} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">TVs</legend>
          <div className="flex flex-wrap gap-4">
            {TARGETS.map((target) => (
              <label key={target.value} className="flex items-center gap-2 text-sm">
                <input type="radio" name="alert-target" checked={targetMode === target.value} onChange={() => setTargetMode(target.value)} />
                {target.label}
              </label>
            ))}
          </div>
          {targetMode === 'segments' && (
            <div className="flex flex-wrap gap-3">
              {segments.map((segment) => (
                <label key={segment.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={segmentIds.includes(segment.id)} onChange={() => setSegmentIds(toggle(segmentIds, segment.id))} />
                  {segment.name}
                </label>
              ))}
            </div>
          )}
          {targetMode === 'companies' && (
            <div className="flex flex-wrap gap-3">
              {companies.map((company) => (
                <label key={company.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={companyIds.includes(company.id)} onChange={() => setCompanyIds(toggle(companyIds, company.id))} />
                  {company.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="alert-duration">Duração</Label>
          <select id="alert-duration" className={selectClass} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
            {ALERT_DURATIONS.map((option) => (
              <option key={option.minutes} value={option.minutes}>{option.label}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={!canPublish}>Publicar aviso</Button>
      </form>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Histórico</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum aviso publicado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex items-center gap-3 rounded-lg border p-3">
                {alert.landscapeImageUrl && (
                  <img src={mediaUrl(alert.landscapeImageUrl)} alt="" className="h-12 w-20 rounded object-cover" />
                )}
                <div className="flex-1 text-sm">
                  <p className="font-medium">{alert.title}</p>
                  <p className="text-muted-foreground">
                    {targetLabel(alert)} · {day(alert.startsAt)} {hhmm(alert.startsAt)}–{hhmm(alert.endedAt ?? alert.endsAt)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{STATUS_LABEL[alert.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader><DialogTitle>Publicar aviso urgente?</DialogTitle></DialogHeader>
          <p className="text-sm">As TVs escolhidas vão mostrar só este aviso até {endsAtPreview}. Campanhas ficam pausadas nelas.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={publish}>Publicar agora</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ending !== null} onOpenChange={(open) => !open && setEnding(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Encerrar o aviso?</DialogTitle></DialogHeader>
          <p className="text-sm">As TVs voltam à programação normal em até 1 minuto.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnding(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={endNow}>Encerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

Se o tipo `Company` de `companies-api` não tiver `name`, usar o campo de nome que ele tem e dizer no relatório.

- [ ] **Step 5: Rota e menu**

Em `App.tsx`: `import UrgentAlerts from './pages/urgent-alerts';` junto dos imports de páginas e, logo depois do bloco `<Route path="/parque">…</Route>`:

```tsx
      <Route path="/avisos">
        <Layout><UrgentAlerts /></Layout>
      </Route>
```

Em `components/nav-config.ts`: acrescentar `Siren` ao import de `lucide-react` e, no grupo "Operação", depois do item `/parque`:

```ts
      { href: '/avisos', label: 'Avisos urgentes', icon: Siren },
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/pages/__tests__/urgent-alerts.test.tsx src/components/__tests__/nav-config.test.ts`
Expected: PASS.

Run: `pnpm --filter @workspace/signage run test && pnpm --filter @workspace/signage run typecheck`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add artifacts/signage/src/lib/urgent-alerts-api.ts artifacts/signage/src/pages/urgent-alerts.tsx artifacts/signage/src/pages/__tests__/urgent-alerts.test.tsx artifacts/signage/src/App.tsx artifacts/signage/src/components/nav-config.ts artifacts/signage/src/components/__tests__/nav-config.test.ts
git commit -F - <<'EOF'
feat(portal): tela de avisos urgentes no admin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Verificação final

**Files:** nenhum.

- [ ] **Step 1: Suite completa, tipos e builds**

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/signage run test
pnpm --filter @workspace/signage run build
pnpm --filter @workspace/api-server run build
```

Expected: tudo verde.

- [ ] **Step 2: Migração**

```bash
git diff main -- 'lib/db/drizzle/*.sql'
```

Expected: só o `CREATE TABLE "urgent_alerts"`, as duas FKs e o índice.

- [ ] **Step 3: Acentos**

```bash
git diff main -- . ':!docs' ':!lib/api-zod' ':!lib/api-client-react' | grep -n '\\u00\|\\u20' || echo "sem escapes"
```

Expected: `sem escapes`.
