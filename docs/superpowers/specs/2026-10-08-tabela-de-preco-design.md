# Tabela de preço e cálculo de orçamento — design

Data: 2026-10-08
Branch: `feat/tabela-de-preco`

## Objetivo

Dar ao sistema um preço de verdade, configurável pelo admin, e uma conta única
que transforma "estas TVs, tantas inserções, por tanto tempo" em valor. Hoje
o preço só existe escrito à mão na landing (R$ 150/mês a rede toda, R$ 135
trimestral, R$ 120 anual) e o admin calcula de cabeça ao vender.

Primeiro de três sub-projetos do item 14 da lista de lacunas ("orçamento pelo
próprio anunciante"):

| # | Sub-projeto | Depende de |
|---|---|---|
| A | **Tabela de preço e cálculo** (este) | — |
| B | Pedido de proposta na landing: visitante escolhe telas, inserções e período e envia; o pedido chega ao admin com o valor calculado; o site abre o WhatsApp do cliente numa conversa com a empresa e a mensagem pronta ("Acabei de pedir a proposta #123…") | A |
| C | Pedido de proposta no portal do anunciante (mesma regra; vira campanha pendente quando o admin aprova) | A |

## Regras decididas

1. **Preço por TV × inserções.** Preço de 1 TV por mês com 1 inserção por
   volta; cada inserção a mais multiplica.
2. **Valor mínimo por mês**, configurável (0 = sem mínimo), para venda de
   poucas TVs não sair barata demais.
3. **Desconto por período**: trimestral e anual, em porcentagem, sobre o
   valor mensal.
4. **Dias da semana e faixas de horário não mudam o preço.**
5. **TVs que contam**: as que o alvo alcança, sem as de concorrente e sem a
   vitrine — a mesma conta da prévia de alcance de hoje (`previewReach`).
6. **Sem preço configurado, não há orçamento** (a calculadora some onde for
   mostrada).
7. **Só o admin vê preço.** O cliente (visitante da landing ou anunciante no
   portal) nunca vê o valor: ele pede a proposta, o pedido chega ao admin já
   com o valor calculado e o admin entra em contato para fechar (B e C).
   Neste sub-projeto só o admin edita o preço e calcula orçamento.

## Dados

Tabela nova `pricing` (`lib/db/src/schema/pricing.ts`), com no máximo uma
linha (`id = 1`, garantido pela rota e por `CHECK (id = 1)`):

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | integer PK | sempre 1 |
| `price_per_tv_cents` | integer NOT NULL | ≥ 0 |
| `min_monthly_cents` | integer NOT NULL DEFAULT 0 | ≥ 0 |
| `quarterly_discount_pct` | integer NOT NULL DEFAULT 0 | 0–90 |
| `annual_discount_pct` | integer NOT NULL DEFAULT 0 | 0–90 |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | |

Migração gerada com `pnpm --filter @workspace/db run generate`; esperado só o
`CREATE TABLE` (o `CHECK` acrescentado à mão ao SQL gerado, se o drizzle-kit
não gerar). A tabela nasce vazia.

## Conta (`artifacts/api-server/src/lib/pricing/quote.ts`, pura)

```ts
export type Pricing = {
  pricePerTvCents: number;
  minMonthlyCents: number;
  quarterlyDiscountPct: number;
  annualDiscountPct: number;
};
export type QuotePeriod = "monthly" | "quarterly" | "annual";
export const PERIOD_MONTHS: Record<QuotePeriod, number> = { monthly: 1, quarterly: 3, annual: 12 };

export type Quote = {
  tvs: number;
  loopInsertions: number;
  period: QuotePeriod;
  months: number;
  monthlyListCents: number;   // mensal antes do desconto (já com o mínimo)
  discountPct: number;
  monthlyCents: number;       // mensal com desconto
  totalCents: number;         // monthlyCents × months
  savingsCents: number;       // (monthlyListCents − monthlyCents) × months
  minimumApplied: boolean;
};

export function quote(pricing: Pricing, input: { tvs: number; loopInsertions: number; period: QuotePeriod }): Quote;
```

- `bruto = pricePerTvCents × tvs × loopInsertions`.
- `tvs = 0` → tudo 0, `minimumApplied = false` (alvo vazio não cobra mínimo).
- `monthlyListCents = max(minMonthlyCents, bruto)`; `minimumApplied =
  bruto < minMonthlyCents`.
- `discountPct` = 0 / trimestral / anual conforme o período.
- `monthlyCents = round(monthlyListCents × (100 − discountPct) / 100)`
  (arredondamento ao centavo, `Math.round`).
- `totalCents = monthlyCents × months`; `savingsCents =
  (monthlyListCents − monthlyCents) × months`.

## API (`artifacts/api-server/src/routes/pricing.ts`, só admin)

Registrada em `routes/index.ts` depois de `requireAdmin`.

- `GET /pricing` → a linha (`{ pricePerTvCents, minMonthlyCents,
  quarterlyDiscountPct, annualDiscountPct, updatedAt }`) ou `null`.
- `PUT /pricing` → upsert da linha 1. zod: inteiros; preço e mínimo ≥ 0 e
  ≤ 100.000.000 (R$ 1 milhão); descontos 0–90. 400 com a mensagem; 200 com a
  linha.
- `POST /quotes/preview` → corpo `{ targetMode: "all"|"devices"|"segments",
  deviceIds?, segmentIds?, advertiserId?, loopInsertions (1–5, padrão 1),
  period (padrão "monthly") }`.
  - Alcance: `previewReach` sobre `loadNetwork()`, com a identidade do
    anunciante quando `advertiserId` vier (concorrência), senão sem
    concorrência (`advertiserSegmentId/CompanyId = null`). `tvs` = TVs
    alcançadas que podem exibir (o mesmo número que a prévia de alcance
    mostra como alcançadas), sem a vitrine.
  - Sem linha em `pricing` → `{ available: false }`.
  - Com linha → `{ available: true, reach: { tvs, blockedByCompetitor },
    quote: Quote }`.
  - `advertiserId` inexistente → 404 "Anunciante não encontrado.".
- Fora do `openapi.yaml`, como `/campaigns/reach-preview` e os avisos
  urgentes: o painel usa um cliente escrito à mão (`lib/pricing-api.ts`).

`loadNetwork` inclui a vitrine; esta rota usa uma consulta própria
(`loadQuoteNetwork`, sem `devices.showcase`), sem mudar a prévia de alcance
existente.

## Admin (`artifacts/signage`)

- Página nova **"Preços"** (`/precos`, `pages/pricing.tsx`), item no grupo
  "Comercial" de `components/nav-config.ts` (ícone `BadgeDollarSign` do
  lucide).
  - Campos em reais (convertidos para centavos): "Preço por TV por mês",
    "Valor mínimo por mês", "Desconto trimestral (%)", "Desconto anual (%)".
  - Sem preço salvo: formulário vazio e a dica "Hoje a landing anuncia R$ 150
    por mês para a rede toda."
  - Exemplo ao vivo, calculado no navegador com a mesma fórmula (espelho de
    `quote`, em `lib/pricing.ts`, testado contra os mesmos casos): "10 TVs ×
    2 inserções, anual: R$ X por mês (R$ Y no ano)".
  - Salvar → `PUT /pricing`; sucesso → toast "Preços salvos."; erro → toast
    com a mensagem do servidor (whitelist em `lib/api-error.ts`).
- **Formulário de campanha** (`components/campaign-form-dialog.tsx`), junto da
  prévia de alcance: "Valor de tabela: R$ X/mês" (período mensal, com as
  inserções do formulário), via `/quotes/preview` com o mesmo alvo e o
  anunciante da campanha. Some quando `available: false`. Mostra "mínimo
  aplicado" quando for o caso.
- Formatação em `lib/money.ts`: `formatCents(n)` → "R$ 1.234,56".

## Testes (TDD)

API:

- `quote.test.ts`: bruto simples; inserções multiplicam; mínimo aplicado e
  não aplicado; `tvs = 0` sem mínimo; trimestral e anual com desconto;
  arredondamento (ex.: 3333 × 85% = 2833); `savingsCents`.
- `pricing.test.ts` (rotas): `GET` null sem linha; `PUT` grava; 400 para
  negativo, desconto 91, não inteiro (o bloqueio de não-admin é o
  `requireAdmin` de `routes/index.ts`, como nas outras rotas de gestão).
- `quotes-preview.test.ts`: `available: false` sem preço; com preço, `tvs`
  igual à prévia de alcance para o mesmo alvo; concorrente fora quando
  `advertiserId` vem; vitrine fora; 404 anunciante inexistente; 400 para
  inserções 0/6 e período inválido.

Web:

- `lib/__tests__/pricing.test.ts`: espelho de `quote` com os mesmos casos.
- `lib/__tests__/money.test.ts`: `formatCents`.
- `pages/__tests__/pricing.test.tsx`: formulário vazio com a dica; salva em
  centavos; erro do servidor vira toast; exemplo ao vivo muda com os campos.
- `campaign-form-dialog` (teste existente): valor de tabela aparece com
  `available: true` e some com `available: false`.
- `nav-config`: grupo Comercial tem "Preços" → `/precos`.

## Fora do escopo

- Pedido de proposta na landing e no portal, lista de propostas do admin,
  abertura do WhatsApp e campanha pendente (B e C). O preço nunca é exposto
  em rota pública.
- O que fazer com o preço fixo escrito na landing (decidir no B).
- Preço por segmento/TV, faixa nobre, CPM, cupom, cobrança.

## PR

Título: `feat(api): tabela de preço e cálculo de orçamento` (minor).
