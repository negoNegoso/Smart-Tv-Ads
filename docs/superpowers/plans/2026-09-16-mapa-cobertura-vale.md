# Mapa de cobertura do Vale do Ribeira — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a faixa de contadores da landing por uma seção com mapa clicável dos 24 municípios do Vale do Ribeira, mostrando estabelecimentos parceiros por cidade.

**Architecture:** A lista canônica dos 24 códigos IBGE vive em `@workspace/db/vale-do-ribeira` (subpath, sem tocar o `index.ts` que exige `DATABASE_URL`), e é usada pelo servidor, pelo script gerador e pelo teste do asset. `GET /public/stats` ganha `cities: [{ ibge, companies }]`, agregado por `companies.city_ibge` com `JOIN clients`. A geometria vem da malha IBGE convertida por um script manual em paths SVG pré-projetados e commitados; o componente só desenha e trata clique — nenhuma biblioteca de mapa entra no bundle.

**Tech Stack:** TypeScript, Express 5, Drizzle ORM + PostgreSQL, zod, Orval, vitest + supertest, React + TanStack Query + Tailwind, tsx (scripts).

**Spec:** `docs/superpowers/specs/2026-09-16-mapa-cobertura-vale-design.md`

## Global Constraints

- Branch: `feat/mapa-cobertura-vale`. Nunca commitar em `main`.
- Gerenciador: **pnpm**. Nunca `npm`/`yarn`.
- Textos de UI em **português do Brasil**, e todos dentro de `artifacts/signage/src/lib/landing-content.ts`. Nenhum texto de interface dentro de `.tsx` em `components/landing/`.
- Testes não tocam banco nem rede: `vi.mock("@workspace/db", ...)` no api-server e `vi.stubGlobal('fetch', ...)` no signage.
- Após alterar `lib/api-spec/openapi.yaml`: `pnpm --filter @workspace/api-spec run codegen`.
- Após alterar `lib/db`: `cd lib/db && npx tsc --build`.
- A rota `/public/stats` é a única sem sessão: nenhum nome de empresa, endereço ou coordenada pode sair dela. Só código IBGE e contagem.
- "Parceiro" = empresa com perfil de dono de TV (`JOIN clients`). Anunciante puro não conta.
- Os 24 códigos IBGE, em ordem alfabética de nome: `3502705` Apiaí, `3505351` Barra do Chapéu, `3505401` Barra do Turvo, `3509254` Cajati, `3509908` Cananéia, `3514809` Eldorado, `3520301` Iguape, `3520426` Ilha Comprida, `3521200` Iporanga, `3522158` Itaoca, `3522653` Itapirapuã Paulista, `3523305` Itariri, `3524600` Jacupiranga, `3526100` Juquiá, `3526209` Juquitiba, `3529906` Miracatu, `3536208` Pariquera-Açu, `3537206` Pedro de Toledo, `3537602` Peruíbe, `3542602` Registro, `3542800` Ribeira, `3549953` São Lourenço da Serra, `3551801` Sete Barras, `3553500` Tapiraí.
- `artifacts/signage/src/lib/mapa-vale.ts` é **arquivo gerado**: nunca editar à mão, sempre regerar com o script da Task 3.
- `pnpm run typecheck` na raiz só volta a ficar verde ao fim da Task 5.

---

## Estrutura de arquivos

**Criar:**

| arquivo | responsabilidade |
| --- | --- |
| `lib/db/src/vale-do-ribeira.ts` | lista canônica dos 24 códigos IBGE (puro, sem conexão) |
| `artifacts/api-server/src/lib/public-stats/coverage.ts` | `coverageFromRows` — filtro e ordenação (puro) |
| `artifacts/api-server/src/lib/public-stats/__tests__/coverage.test.ts` | testes do filtro e da lista |
| `scripts/src/gerar-malha-vale.ts` | baixa a malha IBGE e gera o asset SVG |
| `artifacts/signage/src/lib/mapa-vale.ts` | **gerado**: `VALE_VIEW_BOX` + `VALE_MUNICIPIOS` |
| `artifacts/signage/src/lib/__tests__/mapa-vale.test.ts` | asset tem os 24, paths válidos, códigos batem com o servidor |
| `artifacts/signage/src/components/landing/cobertura.tsx` | seção com mapa clicável |
| `artifacts/signage/src/components/landing/__tests__/cobertura.test.tsx` | seleção, clique, cidade apagada, falha da API |

**Modificar:** `lib/db/package.json` (exports), `lib/api-spec/openapi.yaml` (`PublicStats`), `artifacts/api-server/src/lib/public-stats/queries.ts`, `artifacts/api-server/src/routes/__tests__/public-stats.test.ts`, `scripts/package.json`, `artifacts/signage/src/hooks/use-public-stats.ts`, `artifacts/signage/src/lib/landing-content.ts`, `artifacts/signage/src/pages/landing.tsx`.

**Remover (Task 5):** `artifacts/signage/src/components/landing/stats-band.tsx`.

---

### Task 1: Lista canônica dos municípios e filtro de cobertura

**Files:**
- Create: `lib/db/src/vale-do-ribeira.ts`
- Modify: `lib/db/package.json` (campo `exports`)
- Create: `artifacts/api-server/src/lib/public-stats/coverage.ts`
- Test: `artifacts/api-server/src/lib/public-stats/__tests__/coverage.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `VALE_DO_RIBEIRA` (`readonly { ibge: string; nome: string }[]`), `VALE_DO_RIBEIRA_IBGE` (`readonly string[]`) de `@workspace/db/vale-do-ribeira`; `CityCoverage` (`{ ibge: string; companies: number }`) e `coverageFromRows(rows: { ibge: string | null; companies: number }[]): CityCoverage[]` de `../public-stats/coverage`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/api-server/src/lib/public-stats/__tests__/coverage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { VALE_DO_RIBEIRA, VALE_DO_RIBEIRA_IBGE } from "@workspace/db/vale-do-ribeira";
import { coverageFromRows } from "../coverage";

describe("lista do Vale do Ribeira", () => {
  it("tem os 24 municípios, sem repetição", () => {
    expect(VALE_DO_RIBEIRA).toHaveLength(24);
    expect(new Set(VALE_DO_RIBEIRA_IBGE).size).toBe(24);
  });

  it("guarda código de 7 dígitos de São Paulo (prefixo 35)", () => {
    for (const ibge of VALE_DO_RIBEIRA_IBGE) {
      expect(ibge).toMatch(/^35\d{5}$/);
    }
  });

  it("está em ordem alfabética de nome", () => {
    const nomes = VALE_DO_RIBEIRA.map((m) => m.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")));
  });
});

describe("coverageFromRows", () => {
  it("mantém só municípios da lista", () => {
    const rows = [
      { ibge: "3542602", companies: 4 }, // Registro
      { ibge: "3550308", companies: 9 }, // São Paulo, fora do Vale
    ];
    expect(coverageFromRows(rows)).toEqual([{ ibge: "3542602", companies: 4 }]);
  });

  it("descarta empresa sem código IBGE", () => {
    expect(coverageFromRows([{ ibge: null, companies: 3 }])).toEqual([]);
  });

  it("descarta contagem zero ou negativa", () => {
    const rows = [
      { ibge: "3542602", companies: 0 },
      { ibge: "3509254", companies: -1 },
    ];
    expect(coverageFromRows(rows)).toEqual([]);
  });

  it("ordena por contagem desc, empate pelo código", () => {
    const rows = [
      { ibge: "3529906", companies: 2 }, // Miracatu
      { ibge: "3542602", companies: 7 }, // Registro
      { ibge: "3509254", companies: 2 }, // Cajati
    ];
    expect(coverageFromRows(rows)).toEqual([
      { ibge: "3542602", companies: 7 },
      { ibge: "3509254", companies: 2 },
      { ibge: "3529906", companies: 2 },
    ]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `pnpm --filter @workspace/api-server run test src/lib/public-stats/__tests__/coverage.test.ts`
Expected: FAIL — `Cannot find module '@workspace/db/vale-do-ribeira'`.

- [ ] **Step 3: Criar a lista canônica**

Criar `lib/db/src/vale-do-ribeira.ts`:

```ts
/**
 * Municípios do Vale do Ribeira (recorte ampliado de bacia, não a região
 * imediata de Registro sozinha), por código IBGE.
 *
 * Vive em lib/db, e não no api-server, porque três pacotes precisam da mesma
 * lista: o servidor agrega por ela, o script que gera o mapa filtra a malha
 * IBGE por ela, e o teste do asset compara as duas pontas. O arquivo não
 * importa nada de banco — entra pelo subpath `@workspace/db/vale-do-ribeira`
 * justamente para não passar pelo index.ts, que lança sem DATABASE_URL.
 *
 * Mudar esta lista exige regerar o mapa:
 *   pnpm --filter @workspace/scripts run gerar:malha-vale
 */
export const VALE_DO_RIBEIRA = [
  { ibge: "3502705", nome: "Apiaí" },
  { ibge: "3505351", nome: "Barra do Chapéu" },
  { ibge: "3505401", nome: "Barra do Turvo" },
  { ibge: "3509254", nome: "Cajati" },
  { ibge: "3509908", nome: "Cananéia" },
  { ibge: "3514809", nome: "Eldorado" },
  { ibge: "3520301", nome: "Iguape" },
  { ibge: "3520426", nome: "Ilha Comprida" },
  { ibge: "3521200", nome: "Iporanga" },
  { ibge: "3522158", nome: "Itaoca" },
  { ibge: "3522653", nome: "Itapirapuã Paulista" },
  { ibge: "3523305", nome: "Itariri" },
  { ibge: "3524600", nome: "Jacupiranga" },
  { ibge: "3526100", nome: "Juquiá" },
  { ibge: "3526209", nome: "Juquitiba" },
  { ibge: "3529906", nome: "Miracatu" },
  { ibge: "3536208", nome: "Pariquera-Açu" },
  { ibge: "3537206", nome: "Pedro de Toledo" },
  { ibge: "3537602", nome: "Peruíbe" },
  { ibge: "3542602", nome: "Registro" },
  { ibge: "3542800", nome: "Ribeira" },
  { ibge: "3549953", nome: "São Lourenço da Serra" },
  { ibge: "3551801", nome: "Sete Barras" },
  { ibge: "3553500", nome: "Tapiraí" },
] as const;

export const VALE_DO_RIBEIRA_IBGE: readonly string[] = VALE_DO_RIBEIRA.map((m) => m.ibge);
```

Em `lib/db/package.json`, adicionar a entrada no `exports` (depois de `"./scan-code"`):

```json
    "./vale-do-ribeira": "./src/vale-do-ribeira.ts",
```

- [ ] **Step 4: Criar o filtro puro**

Criar `artifacts/api-server/src/lib/public-stats/coverage.ts`:

```ts
import { VALE_DO_RIBEIRA_IBGE } from "@workspace/db/vale-do-ribeira";

/** Uma cidade acesa no mapa da landing. Só código e contagem: nome de empresa nunca sai daqui. */
export interface CityCoverage {
  ibge: string;
  companies: number;
}

const DENTRO_DO_VALE = new Set(VALE_DO_RIBEIRA_IBGE);

/**
 * Converte o resultado do GROUP BY no que a landing consome.
 *
 * Puro de propósito: é a regra que erra em silêncio. Cidade fora do recorte,
 * empresa sem CEP consultado (ibge nulo) e contagem zero saem aqui, não no SQL,
 * para que o teste possa provar cada descarte sem banco.
 *
 * Ordem por contagem desc (o front seleciona o primeiro), empate pelo código
 * para o render ser determinístico.
 */
export function coverageFromRows(
  rows: { ibge: string | null; companies: number }[],
): CityCoverage[] {
  return rows
    .filter((row): row is { ibge: string; companies: number } =>
      row.ibge !== null && DENTRO_DO_VALE.has(row.ibge) && row.companies > 0,
    )
    .map((row) => ({ ibge: row.ibge, companies: row.companies }))
    .sort((a, b) => b.companies - a.companies || a.ibge.localeCompare(b.ibge));
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `pnpm --filter @workspace/api-server run test src/lib/public-stats/__tests__/coverage.test.ts`
Expected: PASS, 7 testes.

Run também: `cd lib/db && npx tsc --build`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add lib/db/src/vale-do-ribeira.ts lib/db/package.json \
  artifacts/api-server/src/lib/public-stats/coverage.ts \
  artifacts/api-server/src/lib/public-stats/__tests__/coverage.test.ts
git commit -m "feat(public-stats): lista do Vale do Ribeira e filtro de cobertura"
```

---

### Task 2: `GET /public/stats` devolve cobertura por cidade

**Files:**
- Modify: `lib/api-spec/openapi.yaml:1030-1037` (schema `PublicStats`)
- Modify: `artifacts/api-server/src/lib/public-stats/queries.ts`
- Modify: `artifacts/api-server/src/routes/__tests__/public-stats.test.ts`

**Interfaces:**
- Consumes: `coverageFromRows`, `CityCoverage` (Task 1); `VALE_DO_RIBEIRA_IBGE` (Task 1).
- Produces: `citiesCoverage(): Promise<CityCoverage[]>` e `PublicStats` com o campo `cities: CityCoverage[]`, em `lib/public-stats/queries.ts`.

- [ ] **Step 1: Escrever o teste que falha**

Em `artifacts/api-server/src/routes/__tests__/public-stats.test.ts`, os três testes existentes de `GET /public/stats` passam a mockar `cities` (sem isso o `GetPublicStatsResponse.parse` rejeita o payload). Substituir o `describe("GET /public/stats", ...)` inteiro por:

```ts
describe("GET /public/stats", () => {
  const VAZIO = { plays30d: 0, activeScreens: 0, clients: 0, segments: 0, cities: [] };

  beforeEach(() => {
    publicStats.mockReset();
  });

  it("responde os contadores e a cobertura por cidade", async () => {
    publicStats.mockResolvedValue({
      plays30d: 1204,
      activeScreens: 7,
      clients: 5,
      segments: 3,
      cities: [
        { ibge: "3542602", companies: 4 },
        { ibge: "3509254", companies: 1 },
      ],
    });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/public/stats");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      plays30d: 1204,
      activeScreens: 7,
      clients: 5,
      segments: 3,
      cities: [
        { ibge: "3542602", companies: 4 },
        { ibge: "3509254", companies: 1 },
      ],
    });
  });

  it("aceita rede sem nenhuma cidade parceira", async () => {
    publicStats.mockResolvedValue(VAZIO);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/public/stats");
    expect(res.status).toBe(200);
    expect(res.body.cities).toEqual([]);
  });

  it("não vaza nome nem endereço de estabelecimento", async () => {
    publicStats.mockResolvedValue({
      plays30d: 1,
      activeScreens: 1,
      clients: 1,
      segments: 1,
      cities: [{ ibge: "3542602", companies: 1 }],
    });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/public/stats");
    expect(Object.keys(res.body.cities[0])).toEqual(["ibge", "companies"]);
  });

  it("permite cache no CDN", async () => {
    publicStats.mockResolvedValue(VAZIO);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/public/stats");
    expect(res.headers["cache-control"]).toBe("public, s-maxage=300, stale-while-revalidate=600");
  });

  it("não exige sessão", async () => {
    publicStats.mockResolvedValue(VAZIO);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/public/stats");
    expect(res.status).not.toBe(401);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `pnpm --filter @workspace/api-server run test src/routes/__tests__/public-stats.test.ts`
Expected: FAIL — o zod gerado ainda não conhece `cities`, então `res.body` sai sem o campo e a asserção de igualdade quebra.

- [ ] **Step 3: Estender o contrato e regerar o cliente**

Em `lib/api-spec/openapi.yaml`, substituir o schema `PublicStats`:

```yaml
    PublicStats:
      type: object
      required: [plays30d, activeScreens, clients, segments, cities]
      properties:
        plays30d: { type: integer }
        activeScreens: { type: integer }
        clients: { type: integer }
        segments: { type: integer }
        # Cobertura por município do Vale do Ribeira. Só cidade com pelo menos
        # um estabelecimento parceiro entra na lista; nome de empresa, endereço
        # e coordenada nunca saem desta rota.
        cities:
          type: array
          items:
            type: object
            required: [ibge, companies]
            properties:
              ibge: { type: string }
              companies: { type: integer }
```

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: `lib/api-zod/src/generated/api.ts` passa a ter `cities` em `GetPublicStatsResponse`; `lib/api-client-react` regenerado; typecheck dos libs verde.

- [ ] **Step 4: Implementar a consulta**

Em `artifacts/api-server/src/lib/public-stats/queries.ts`, ajustar os imports do topo e acrescentar a consulta:

```ts
import { eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db, playsTable, devicesTable, clientsTable, companiesTable } from "@workspace/db";
import { VALE_DO_RIBEIRA_IBGE } from "@workspace/db/vale-do-ribeira";
import { coverageFromRows, type CityCoverage } from "./coverage";
```

Acrescentar `cities` à interface:

```ts
export interface PublicStats {
  plays30d: number;
  activeScreens: number;
  clients: number;
  segments: number;
  cities: CityCoverage[];
}
```

E a função, antes de `publicStats`:

```ts
/**
 * Quantos estabelecimentos parceiros a rede tem em cada município do Vale.
 *
 * O innerJoin com clients é o que define "parceiro": empresa que só anuncia
 * não vira ponto no mapa. O IN restringe ao recorte da landing — cidade fora
 * dele não é desenhada, então contá-la só gastaria linha.
 */
export async function citiesCoverage(): Promise<CityCoverage[]> {
  const rows = await db
    .select({
      ibge: companiesTable.cityIbge,
      companies: sql<number>`COUNT(*)::int`,
    })
    .from(companiesTable)
    .innerJoin(clientsTable, eq(clientsTable.companyId, companiesTable.id))
    .where(inArray(companiesTable.cityIbge, [...VALE_DO_RIBEIRA_IBGE]))
    .groupBy(companiesTable.cityIbge);

  return coverageFromRows(rows);
}
```

No fim de `publicStats`, buscar a cobertura e incluí-la no retorno:

```ts
  const cities = await citiesCoverage();

  return {
    plays30d: plays?.n ?? 0,
    activeScreens: screens?.n ?? 0,
    clients: clients?.n ?? 0,
    segments: segments?.n ?? 0,
    cities,
  };
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `pnpm --filter @workspace/api-server run test src/routes/__tests__/public-stats.test.ts`
Expected: PASS, 7 testes (2 de janela de tempo + 5 da rota).

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react \
  artifacts/api-server/src/lib/public-stats/queries.ts \
  artifacts/api-server/src/routes/__tests__/public-stats.test.ts
git commit -m "feat(api): /public/stats devolve parceiros por município do Vale"
```

---

### Task 3: Script que gera o mapa e o asset commitado

**Files:**
- Create: `scripts/src/gerar-malha-vale.ts`
- Modify: `scripts/package.json` (script `gerar:malha-vale`)
- Create (gerado): `artifacts/signage/src/lib/mapa-vale.ts`
- Test: `artifacts/signage/src/lib/__tests__/mapa-vale.test.ts`

**Interfaces:**
- Consumes: `VALE_DO_RIBEIRA` (Task 1).
- Produces: `VALE_VIEW_BOX: string` e `VALE_MUNICIPIOS: { ibge: string; nome: string; path: string }[]` em `@/lib/mapa-vale`, ordenados por nome.

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/signage/src/lib/__tests__/mapa-vale.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { VALE_DO_RIBEIRA_IBGE } from '@workspace/db/vale-do-ribeira';
import { VALE_MUNICIPIOS, VALE_VIEW_BOX } from '../mapa-vale';

describe('asset do mapa do Vale', () => {
  it('tem um município para cada código do servidor', () => {
    expect([...VALE_MUNICIPIOS.map((m) => m.ibge)].sort()).toEqual([...VALE_DO_RIBEIRA_IBGE].sort());
  });

  it('desenha um path fechado para cada município', () => {
    for (const municipio of VALE_MUNICIPIOS) {
      expect(municipio.path.startsWith('M')).toBe(true);
      expect(municipio.path.endsWith('Z')).toBe(true);
      expect(municipio.path.length).toBeGreaterThan(20);
    }
  });

  it('tem nome legível em todo município', () => {
    for (const municipio of VALE_MUNICIPIOS) {
      expect(municipio.nome.trim().length).toBeGreaterThan(2);
    }
  });

  it('declara uma viewBox começando na origem', () => {
    expect(VALE_VIEW_BOX).toMatch(/^0 0 1000 \d+(\.\d+)?$/);
  });

  it('mantém a ordem alfabética', () => {
    const nomes = VALE_MUNICIPIOS.map((m) => m.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `pnpm --filter @workspace/signage run test src/lib/__tests__/mapa-vale.test.ts`
Expected: FAIL — `Failed to resolve import "../mapa-vale"`.

- [ ] **Step 3: Escrever o script gerador**

Criar `scripts/src/gerar-malha-vale.ts`:

```ts
/**
 * Gera o mapa do Vale do Ribeira da landing a partir da malha do IBGE.
 *
 *   pnpm --filter @workspace/scripts run gerar:malha-vale
 *
 * Rodado à mão, só quando a lista de municípios mudar: o resultado é
 * commitado, e assim o build nunca depende da rede do IBGE nem muda de forma
 * sozinho quando eles republicam a malha.
 *
 * A malha vem por estado (o endpoint por região imediata responde 500) e é
 * filtrada pelos 24 códigos. A projeção é Mercator esférico normalizado pela
 * bbox dos municípios selecionados — o mapa é regional e pequeno, então não há
 * distorção que justifique uma projeção mais cara.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VALE_DO_RIBEIRA } from "@workspace/db/vale-do-ribeira";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, "..", "..", "artifacts", "signage", "src", "lib", "mapa-vale.ts");

const MALHA =
  "https://servicodados.ibge.gov.br/api/v3/malhas/estados/35" +
  "?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=municipio";

const LARGURA = 1000;

/** As respostas do IBGE trazem caracteres de controle que quebram JSON.parse estrito. */
async function baixarJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IBGE respondeu ${res.status} em ${url}`);
  const texto = await res.text();
  return JSON.parse(texto.replace(/[ -]/g, " "));
}

function mercatorY(latGraus: number): number {
  const lat = (latGraus * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + lat / 2));
}

/** Um Polygon vira uma lista de anéis; um MultiPolygon, a concatenação dos anéis de cada parte. */
function aneis(geometry: any): number[][][] {
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  throw new Error(`Geometria inesperada: ${geometry.type}`);
}

async function main() {
  const porCodigo = new Map(VALE_DO_RIBEIRA.map((m) => [m.ibge, m.nome]));
  const malha = await baixarJson(MALHA);

  const selecionados = malha.features.filter((f: any) =>
    porCodigo.has(String(f.properties.codarea)),
  );
  if (selecionados.length !== VALE_DO_RIBEIRA.length) {
    throw new Error(
      `Esperava ${VALE_DO_RIBEIRA.length} municípios na malha, achei ${selecionados.length}`,
    );
  }

  // bbox em coordenadas já projetadas: x = longitude, y = Mercator da latitude.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const feature of selecionados) {
    for (const anel of aneis(feature.geometry)) {
      for (const [lng, lat] of anel) {
        const y = mercatorY(lat);
        if (lng < minX) minX = lng;
        if (lng > maxX) maxX = lng;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const escala = LARGURA / (maxX - minX);
  const altura = Number(((maxY - minY) * escala).toFixed(2));

  // y invertido: no SVG cresce para baixo, no Mercator para cima (norte).
  const paraSvg = ([lng, lat]: number[]) =>
    `${((lng - minX) * escala).toFixed(2)} ${((maxY - mercatorY(lat)) * escala).toFixed(2)}`;

  const municipios = selecionados
    .map((feature: any) => {
      const ibge = String(feature.properties.codarea);
      const path = aneis(feature.geometry)
        .map((anel) => `M${anel.map(paraSvg).join("L")}Z`)
        .join("");
      return { ibge, nome: porCodigo.get(ibge)!, path };
    })
    .sort((a: any, b: any) => a.nome.localeCompare(b.nome, "pt-BR"));

  const linhas = municipios
    .map((m: any) => `  { ibge: '${m.ibge}', nome: ${JSON.stringify(m.nome)}, path: '${m.path}' },`)
    .join("\n");

  writeFileSync(
    SAIDA,
    `/**
 * ARQUIVO GERADO — não editar à mão.
 *
 * Fonte: malha municipal do IBGE (qualidade intermediária), projetada em
 * Mercator e normalizada para a viewBox abaixo.
 *
 * Regerar:
 *   pnpm --filter @workspace/scripts run gerar:malha-vale
 */
export interface MunicipioMapa {
  ibge: string;
  nome: string;
  /** Path SVG já projetado, na viewBox de VALE_VIEW_BOX. */
  path: string;
}

export const VALE_VIEW_BOX = '0 0 ${LARGURA} ${altura}';

export const VALE_MUNICIPIOS: MunicipioMapa[] = [
${linhas}
];
`,
    "utf8",
  );

  console.log(`Mapa gerado: ${municipios.length} municípios, viewBox 0 0 ${LARGURA} ${altura}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Em `scripts/package.json`, acrescentar ao bloco `scripts`:

```json
    "gerar:malha-vale": "tsx ./src/gerar-malha-vale.ts",
```

- [ ] **Step 4: Rodar o gerador**

Run: `pnpm --filter @workspace/scripts run gerar:malha-vale`
Expected: imprime `Mapa gerado: 24 municípios, viewBox 0 0 1000 <altura>` e cria `artifacts/signage/src/lib/mapa-vale.ts` (~50 KB).

Se o IBGE estiver fora do ar, o script falha alto e nada é gravado — repetir depois, sem editar o asset à mão.

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `pnpm --filter @workspace/signage run test src/lib/__tests__/mapa-vale.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 6: Commit**

```bash
git add scripts/src/gerar-malha-vale.ts scripts/package.json \
  artifacts/signage/src/lib/mapa-vale.ts \
  artifacts/signage/src/lib/__tests__/mapa-vale.test.ts
git commit -m "feat(landing): gerador da malha do Vale e asset do mapa"
```

---

### Task 4: Seção de cobertura com mapa clicável

**Files:**
- Modify: `artifacts/signage/src/hooks/use-public-stats.ts`
- Modify: `artifacts/signage/src/lib/landing-content.ts`
- Create: `artifacts/signage/src/components/landing/cobertura.tsx`
- Test: `artifacts/signage/src/components/landing/__tests__/cobertura.test.tsx`

**Interfaces:**
- Consumes: `VALE_MUNICIPIOS`, `VALE_VIEW_BOX` (Task 3); `cities` no payload de `/public/stats` (Task 2).
- Produces: `Cobertura` (componente sem props) em `@/components/landing/cobertura`; `LANDING.cobertura` em `landing-content.ts`; `CityCoverage` e `PublicStats.cities` em `@/hooks/use-public-stats`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/signage/src/components/landing/__tests__/cobertura.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cobertura } from '../cobertura';

const BASE = { plays30d: 10, activeScreens: 12, clients: 5, segments: 3 };

function stubStats(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })),
  );
}

function renderSecao() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Cobertura />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Cobertura', () => {
  it('começa na cidade com mais parceiros', async () => {
    stubStats({
      ...BASE,
      cities: [
        { ibge: '3529906', companies: 2 }, // Miracatu
        { ibge: '3542602', companies: 9 }, // Registro
      ],
    });
    renderSecao();
    expect(await screen.findByText('Registro')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('troca o número ao clicar em outra cidade parceira', async () => {
    stubStats({
      ...BASE,
      cities: [
        { ibge: '3542602', companies: 9 },
        { ibge: '3529906', companies: 2 },
      ],
    });
    renderSecao();
    await userEvent.click(await screen.findByRole('button', { name: /Miracatu/ }));
    expect(screen.getByText('Miracatu')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('não deixa clicar em cidade sem parceiro', async () => {
    stubStats({ ...BASE, cities: [{ ibge: '3542602', companies: 9 }] });
    renderSecao();
    await screen.findByText('Registro');
    expect(screen.queryByRole('button', { name: /Tapiraí/ })).not.toBeInTheDocument();
  });

  it('some da página quando a API falha', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500 })));
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Cobertura />
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('some da página quando nenhuma cidade tem parceiro', async () => {
    stubStats({ ...BASE, cities: [] });
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Cobertura />
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `pnpm --filter @workspace/signage run test src/components/landing/__tests__/cobertura.test.tsx`
Expected: FAIL — `Failed to resolve import "../cobertura"`.

- [ ] **Step 3: Acrescentar `cities` ao hook**

Em `artifacts/signage/src/hooks/use-public-stats.ts`, trocar a interface:

```ts
export interface CityCoverage {
  ibge: string;
  companies: number;
}

export interface PublicStats {
  plays30d: number;
  activeScreens: number;
  clients: number;
  segments: number;
  cities: CityCoverage[];
}
```

O resto do arquivo não muda.

- [ ] **Step 4: Acrescentar a copy**

Em `artifacts/signage/src/lib/landing-content.ts`, dentro de `LANDING`, logo depois do bloco `stats`:

```ts
  cobertura: {
    title: 'Onde a sua marca aparece',
    subtitle:
      'Telas instaladas no comércio do Vale do Ribeira. Toque numa cidade para ver quantos estabelecimentos parceiros a rede já tem lá.',
    screensLabel: 'telas ativas na rede',
    regionLabel: '24 cidades do Vale do Ribeira',
    cityLabel: 'estabelecimentos parceiros',
    listLabel: 'Cidades com telas',
    mapLabel: 'Mapa do Vale do Ribeira',
    cta: 'Quero anunciar aqui',
    ctaMessage: 'Olá! Quero anunciar nas telas da Smart Vale TV em',
  },
```

- [ ] **Step 5: Escrever o componente**

Criar `artifacts/signage/src/components/landing/cobertura.tsx`:

```tsx
import * as React from 'react';
import { LANDING, whatsappUrl } from '@/lib/landing-content';
import { usePublicStats } from '@/hooks/use-public-stats';
import { VALE_MUNICIPIOS, VALE_VIEW_BOX } from '@/lib/mapa-vale';

const format = new Intl.NumberFormat('pt-BR');

/**
 * Cobertura da rede, cidade a cidade.
 *
 * Herda as duas regras da faixa de números que esta seção substituiu: falha da
 * API não vira mensagem na tela, e número que não ajuda não vai para a tela —
 * sem nenhuma cidade parceira, a seção inteira não existe.
 *
 * O SVG é decoração (aria-hidden): a lista de botões abaixo dele carrega a
 * mesma seleção e é a interface para teclado e leitor de tela. Os dois
 * controlam o mesmo estado, então nunca divergem.
 */
export function Cobertura() {
  const { data } = usePublicStats();
  const [selecionada, setSelecionada] = React.useState<string | null>(null);

  const porCidade = React.useMemo(() => {
    const mapa = new Map<string, number>();
    for (const cidade of data?.cities ?? []) mapa.set(cidade.ibge, cidade.companies);
    return mapa;
  }, [data]);

  // Cidade com mais parceiros; empate pelo código, para o render ser determinístico.
  const padrao = React.useMemo(() => {
    const cidades = [...porCidade.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    return cidades[0]?.[0] ?? null;
  }, [porCidade]);

  if (!data || porCidade.size === 0) return null;

  const ativa = selecionada && porCidade.has(selecionada) ? selecionada : padrao;
  const municipioAtivo = VALE_MUNICIPIOS.find((m) => m.ibge === ativa);
  const parceiros = ativa ? (porCidade.get(ativa) ?? 0) : 0;

  return (
    <section className="border-b border-zinc-200 bg-zinc-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-2 md:items-center md:py-20">
        <div>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-zinc-900 sm:text-4xl">
            {LANDING.cobertura.title}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-600">
            {LANDING.cobertura.subtitle}
          </p>

          <p className="mt-8 text-lg font-semibold text-zinc-900">
            {format.format(data.activeScreens)}{' '}
            <span className="font-normal text-zinc-600">{LANDING.cobertura.screensLabel}</span>
          </p>
          <p className="text-lg font-semibold text-zinc-900">{LANDING.cobertura.regionLabel}</p>

          {municipioAtivo && (
            <div className="mt-8">
              <p className="text-xl font-semibold text-zinc-900">{municipioAtivo.nome}</p>
              <p className="text-3xl font-semibold tracking-tight text-primary">
                {format.format(parceiros)}
              </p>
              <p className="mt-1 text-sm text-zinc-600">{LANDING.cobertura.cityLabel}</p>

              <a
                href={whatsappUrl(`${LANDING.cobertura.ctaMessage} ${municipioAtivo.nome}.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                {LANDING.cobertura.cta}
              </a>
            </div>
          )}
        </div>

        <div>
          <svg
            viewBox={VALE_VIEW_BOX}
            className="mx-auto hidden h-auto w-full max-w-md md:block"
            aria-hidden="true"
          >
            {VALE_MUNICIPIOS.map((municipio) => {
              const temParceiro = porCidade.has(municipio.ibge);
              return (
                <path
                  key={municipio.ibge}
                  d={municipio.path}
                  fill={
                    municipio.ibge === ativa
                      ? 'hsl(var(--primary))'
                      : temParceiro
                        ? 'rgb(191 219 254)'
                        : 'rgb(228 228 231)'
                  }
                  stroke="white"
                  strokeWidth={1.5}
                  style={{ pointerEvents: temParceiro ? 'auto' : 'none', cursor: temParceiro ? 'pointer' : 'default' }}
                  onClick={temParceiro ? () => setSelecionada(municipio.ibge) : undefined}
                />
              );
            })}
          </svg>

          <ul className="mt-6 flex flex-wrap gap-2" aria-label={LANDING.cobertura.listLabel}>
            {VALE_MUNICIPIOS.filter((m) => porCidade.has(m.ibge)).map((municipio) => (
              <li key={municipio.ibge}>
                <button
                  type="button"
                  aria-pressed={municipio.ibge === ativa}
                  onClick={() => setSelecionada(municipio.ibge)}
                  className={
                    municipio.ibge === ativa
                      ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-white'
                      : 'rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:border-primary'
                  }
                >
                  {municipio.nome}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `pnpm --filter @workspace/signage run test src/components/landing/__tests__/cobertura.test.tsx`
Expected: PASS, 5 testes.

- [ ] **Step 7: Commit**

```bash
git add artifacts/signage/src/hooks/use-public-stats.ts \
  artifacts/signage/src/lib/landing-content.ts \
  artifacts/signage/src/components/landing/cobertura.tsx \
  artifacts/signage/src/components/landing/__tests__/cobertura.test.tsx
git commit -m "feat(landing): seção de cobertura com mapa clicável do Vale"
```

---

### Task 5: Trocar a faixa de números pela seção de cobertura

**Files:**
- Modify: `artifacts/signage/src/pages/landing.tsx`
- Delete: `artifacts/signage/src/components/landing/stats-band.tsx`
- Modify: `artifacts/signage/src/lib/landing-content.ts` (remover `LANDING.stats`)

**Interfaces:**
- Consumes: `Cobertura` (Task 4).
- Produces: landing sem `StatsBand`.

- [ ] **Step 1: Trocar a seção na página**

Em `artifacts/signage/src/pages/landing.tsx`, trocar o import e o uso:

```tsx
import { Cobertura } from '@/components/landing/cobertura';
```

(no lugar de `import { StatsBand } from '@/components/landing/stats-band';`)

```tsx
        <Hero />
        <Cobertura />
        <HowItWorks />
```

(no lugar de `<StatsBand />`)

- [ ] **Step 2: Remover o que a troca aposentou**

```bash
git rm artifacts/signage/src/components/landing/stats-band.tsx
```

Em `landing-content.ts`, remover o bloco `stats` inteiro:

```ts
  stats: {
    plays30d: 'exibições nos últimos 30 dias',
    activeScreens: 'telas ativas',
    clients: 'estabelecimentos parceiros',
    segments: 'ramos atendidos',
  },
```

`usePublicStats` continua: a nova seção usa `activeScreens` e `cities`.

- [ ] **Step 3: Rodar a suíte inteira e o typecheck**

Run: `pnpm --filter @workspace/signage run test`
Expected: PASS, sem referência sobrando a `stats-band` ou a `LANDING.stats`.

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS.

Run: `pnpm run typecheck`
Expected: sem erro (primeira vez que a raiz volta a ficar verde).

- [ ] **Step 4: Conferir a landing no navegador**

Run: `./dev.sh`
Abrir a landing, confirmar: mapa aparece à direita no desktop, lista de cidades abaixo, clique numa cidade troca nome e número, CTA leva ao WhatsApp com o nome da cidade na mensagem. Em viewport estreita, o SVG some e a lista continua funcionando.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/pages/landing.tsx artifacts/signage/src/lib/landing-content.ts
git commit -m "feat(landing): cobertura no lugar da faixa de contadores"
```

---

## Verificação final

- `pnpm run typecheck` — verde.
- `pnpm --filter @workspace/api-server run test` e `pnpm --filter @workspace/signage run test` — verdes.
- `GET /api/public/stats` devolve `cities` só com código IBGE e contagem.
- `artifacts/signage/src/lib/mapa-vale.ts` commitado e não editado à mão.
- Nenhum commit em `main`; tudo em `feat/mapa-cobertura-vale`.
