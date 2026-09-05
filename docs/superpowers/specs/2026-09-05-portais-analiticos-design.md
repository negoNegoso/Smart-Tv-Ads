# Portais analíticos para clientes e anunciantes

Data: 2026-09-05

## Problema

`pages/portal-advertiser.tsx` e `pages/portal-client.tsx` são o que o cliente
pagante vê depois de logar. Cada uma é uma tabela crua de totais acumulados
desde sempre. Três consequências:

1. **Sem evolução no tempo.** Um número que só cresce não responde "a campanha
   melhorou ou piorou?".
2. **Sem apresentação.** Quem paga por veiculação recebe uma planilha sem
   gráfico, sem marca e sem período.
3. **Sem comprovante.** Não há o que levar para uma reunião ou anexar a um
   contrato.

O drill-down (quebra por anúncio, por TV, por horário) ficou de fora por
decisão explícita. Esta arquitetura não fecha a porta para ele.

## Escopo

Reescrita das duas páginas do portal sobre blocos compartilhados, mais dois
endpoints de agregado com série temporal, mais impressão em PDF.

Fora de escopo: a página `/analytics` do admin, drill-down por campanha,
intervalo de datas customizado.

## Arquitetura

Um período selecionado governa a página inteira. Escolher "30 dias" muda os
cards, o gráfico e a tabela juntos. Misturar um gráfico de 30 dias com uma
tabela acumulada desde sempre produz dois números diferentes para a mesma
pergunta na mesma tela.

### Backend — `artifacts/api-server/`

| Arquivo | Papel |
|---|---|
| `src/lib/portal/period.ts` (novo) | Valida `days`, calcula `from`/`to` no fuso do negócio |
| `src/lib/portal/overview.ts` (novo) | Queries de agregado + série diária |
| `src/lib/portal/queries.ts` | Continua dono das listas; ganha filtro de janela |
| `src/routes/portal.ts` | Duas rotas novas; as duas existentes aceitam `?days` |

`overview.ts` fica separado de `queries.ts` porque as duas consultas têm
formatos e custos diferentes: lista é O(campanhas), série é O(dias). Separadas,
cada uma carrega e falha sozinha.

### Migration — `lib/db/drizzle/`

Índices compostos `plays(campaign_id, created_at)` e `plays(device_id,
created_at)`. `plays` só tem índice em `created_at` hoje; sem os compostos,
cada troca de período é sequential scan na maior tabela do banco.

### Frontend — `artifacts/signage/src/`

Novo diretório `components/portal/`:

| Componente | Contrato |
|---|---|
| `period-filter.tsx` | Emite `7 \| 30 \| 90`. Não sabe o que está filtrando |
| `kpi-card.tsx` | Recebe rótulo, valor formatado, delta e ícone |
| `trend-chart.tsx` | Recebe `{ date, ...séries }[]` e a config das séries |
| `print-header.tsx` | Cabeçalho só-impressão |

O período fica em um `useState` dentro de cada página e entra nas query keys
do TanStack Query. Um hook dedicado para um único `useState` seria indireção
sem ganho.

`pages/portal-advertiser.tsx` e `pages/portal-client.tsx` passam a ser
composição desses blocos. Nenhum deles sabe se está servindo anunciante ou
cliente, então cada um é testável sozinho.

`components/portal-shell.tsx` ganha as regras de impressão.

Recharts (`^2.15.2`) e `components/ui/chart.tsx` já estão instalados. Nenhuma
dependência nova em nenhuma camada.

## Contrato de API

As rotas do portal não passam pelo `openapi.yaml` — usam `fetch` manual com
tipos declarados na própria página. Este design segue o precedente; levar o
portal para o spec gerado é uma decisão separada.

Autorização inalterada: `requireAdvertiser` / `requireClient`, escopo por
`advertiserIds` / `clientIds`. `contractValue` continua fora do portal — a
regra vale em `overview.ts` igual vale em `queries.ts`.

### Validação de `days`

`days` aceita apenas `7`, `30` ou `90`. Qualquer outro valor responde **400**.
Enum fechado em vez de número livre mantém a varredura limitada e o cache
previsível. Ausente, `days` assume `30` nas rotas de overview e mantém o
comportamento acumulado atual nas rotas de lista.

### `GET /api/portal/advertiser/overview?days=30`

```jsonc
{
  "period": { "days": 30, "from": "2026-08-06", "to": "2026-09-05" },
  "totals": {
    "plays": 48210, "scans": 391, "uniqueVisitors": 274,
    "scanRate": 0.0081, "activeCampaigns": 3, "reachedDevices": 12,
    "previous": { "plays": 43044, "scans": 376, "uniqueVisitors": 280, "scanRate": 0.0087 }
  },
  "series": [ { "date": "2026-08-06", "plays": 1610, "scans": 12, "uniqueVisitors": 9 } ]
}
```

### `GET /api/portal/client/overview?days=30`

```jsonc
{
  "period": { "days": 30, "from": "2026-08-06", "to": "2026-09-05" },
  "totals": {
    "plays": 61044, "devices": 4, "devicesOnline": 4,
    "previous": { "plays": 58120 }
  },
  "series": [ { "date": "2026-08-06", "plays": 2035 } ]
}
```

### Regras das duas queries

- **`previous`** cobre a janela imediatamente anterior (`from − days` … `from`),
  com os mesmos filtros. É o que transforma um número solto em "melhorou 12%".
- **`series` traz um ponto por dia do período, zeros inclusos.** Um dia sem
  exibição é informação — a TV ficou muda. Omitir o ponto faz o gráfico
  interpolar por cima do buraco e esconder a falha.

  O preenchimento acontece em JavaScript, sobre as chaves de dia calculadas em
  `period.ts`, e não com `generate_series` no SQL. O motivo é testabilidade:
  nenhum teste deste repositório abre conexão com banco, então uma regra que
  vive dentro da query não é verificável — e esta é exatamente uma regra que
  erra em silêncio.
- **Agrupamento por dia em `America/Sao_Paulo`**, via
  `(created_at AT TIME ZONE 'America/Sao_Paulo')::date`, reusando
  `BUSINESS_TIME_ZONE` de `lib/ad-eligibility.ts`. Em UTC, a segunda-feira do
  cliente começaria às 21h de domingo.
- **`scans.is_bot = true` fica fora** de `scans` e de `uniqueVisitors`.
  Anunciante não paga para ver crawler.
- **`scanRate`** é `scans / plays` na janela, com `0` quando `plays` é zero.
  Nunca `null`, para o card não ter que tratar dois vazios diferentes.
- **`devicesOnline`** conta dispositivos com `last_seen_at` nos últimos 5
  minutos, medido no instante da requisição — é "agora", não uma métrica da
  janela, e o rótulo do card diz isso.
- **`uniqueVisitors`** conta `fingerprint` distinto, como em `queries.ts`. O
  distinto é por dia dentro de `series` e por período dentro de `totals`, então
  a soma da série é maior ou igual ao total — esperado, não bug.

### Rotas de lista

`/advertiser/campaigns` e `/client/devices` passam a aceitar o mesmo `?days`,
filtrando os joins de `plays` e `scans` pela janela. Sem o parâmetro, o
comportamento atual (acumulado) é preservado.

## UI

Mesmo esqueleto nos dois portais:

```
┌────────────────────────────────────────────────────────────┐
│ Minhas campanhas          [7d][30d][90d]   [🖨 Imprimir/PDF]│
├────────────────────────────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                │
│ │Exibi-  │ │Scans   │ │Visitan-│ │Taxa de │   ← KPI cards  │
│ │ções    │ │        │ │tes únic│ │resposta│                │
│ │ 48.210 │ │   391  │ │   274  │ │  0,81% │                │
│ │ ▲ +12% │ │ ▲ +4%  │ │ ▼ −2%  │ │ ▲ +0,1p│   ← vs período │
│ └────────┘ └────────┘ └────────┘ └────────┘      anterior   │
├────────────────────────────────────────────────────────────┤
│  Exibições e scans por dia                                 │
│   ╱╲    ╱╲╱╲      ╱╲                    exibições (esq.)   │
│  ╱  ╲╱╲╱     ╲╱╲╱   ╲╱╲                 scans (dir.)       │
├────────────────────────────────────────────────────────────┤
│  Campanha    Período        Status  TVs  Exib.  Scans  Únic│
└────────────────────────────────────────────────────────────┘
```

**Gráfico com dois eixos Y.** Exibições na casa dos milhares e scans na das
centenas no mesmo eixo achatam a linha de scans contra o zero. Exibições no
eixo esquerdo, scans no direito.

**Deltas.** Percentual sobre `previous` para contagens; diferença em pontos
percentuais para `scanRate` (`+0,1p`). Quando `previous` é zero, o card mostra
`—` em vez de `+∞%`.

**Portal do cliente:** mesma casca, três cards (Exibições no período, TVs, TVs
online agora), gráfico de uma escala só, tabela de TVs com indicador de status.

**Estados:** `Skeleton` no carregando, `components/ui/empty.tsx` no vazio.

**Correção de passagem.** Hoje as duas páginas fazem `if (!res.ok) return []`,
então API fora do ar vira "Nenhuma campanha encontrada" — o anunciante lê isso
como "minha campanha sumiu". O fetch passa a lançar erro, e a página mostra
estado de falha com botão de tentar de novo.

**Rodapé sobre scans.** A ressalva já escrita em `pages/analytics.tsx` (scan
mede resposta, não alcance; não é atribuível a uma exibição; múltiplos scans da
mesma pessoa contam no bruto) se repete no portal do anunciante.

## Impressão / PDF

`window.print()`. Sem dependência nova, sem rota de servidor, sem renderizar
PDF em função serverless.

- `PrintHeader` (`hidden print:block`): nome do painel, nome do anunciante ou
  cliente, período por extenso ("6 de agosto a 5 de setembro de 2026") e data
  de emissão. Só existe no papel.
- `@media print` esconde o header do shell, o filtro de período e o próprio
  botão de imprimir.
- `print-color-adjust: exact` no gráfico e nas badges. Sem isso o navegador
  descarta os preenchimentos e sai um relatório cinza.
- `break-inside: avoid` nos cards e nas linhas da tabela.
- `ResponsiveContainer` do Recharts mede largura 0 em vários motores de
  impressão e some do papel. Mitigação: largura fixa no wrapper dentro de
  `@media print` e `isAnimationActive={false}`.

## Testes

Vitest nos dois lados, seguindo os padrões que já existem no repositório.

**Backend** — `src/routes/__tests__/`, no molde de `portal-scope.test.ts`
(supertest, `vi.mock` no módulo de queries, sessão via `createSession`):

- `days` fora de `{7,30,90}` responde 400; ausente cai em 30.
- Overview do anunciante recebe só os `advertiserIds` da sessão; do cliente, só
  os `clientIds`. Admin sem vínculo recebe vazio, como hoje.
- Nenhuma resposta do portal contém `contractValue`.

**Backend, regras puras** — `src/lib/portal/__tests__/`:

- `parseDays` aceita os três presets, cai no padrão quando ausente e recusa o
  resto.
- Um instante às 23h de São Paulo pertence ao dia local, não ao dia UTC
  seguinte.
- `dayKeysEndingAt` devolve exatamente `days` chaves, atravessando viradas de
  mês.
- `previousPortalPeriod` termina exatamente onde o período atual começa.
- `fillSeries` devolve um ponto por chave, com zeros nos dias sem linha.
- `onlineSince` olha 5 minutos para trás.

O que é SQL — o agrupamento por dia no fuso do negócio e o filtro
`is_bot = false` — não tem teste automatizado: verificá-lo exigiria um banco,
e nenhum teste deste repositório abre conexão. Fica coberto por revisão de
código e pela conferência manual descrita na ordem de implementação.

**Frontend** — testes de componente nos blocos isolados:

- `PeriodFilter` emite o valor escolhido e marca o ativo.
- `KpiCard` formata delta positivo, negativo, zero e `previous` ausente (`—`).
- As páginas mostram estado de erro quando o fetch falha, e não a lista vazia.

`TrendChart` não tem teste de renderização: o `ResponsiveContainer` do Recharts
mede zero em jsdom e só renderiza com a medição de largura mockada, o que
tornaria o teste uma verificação do mock. O comportamento dele é conferido na
verificação manual da impressão.

O `artifacts/signage` não tem test runner hoje; a primeira task do frontend
adiciona Vitest, Testing Library e jsdom.

## Ordem de implementação

1. Migration dos índices compostos.
2. `period.ts` e testes de validação de `days`.
3. `overview.ts` e testes das queries.
4. Rotas do portal (overview + `?days` nas listas) e testes de escopo.
5. Blocos de `components/portal/` e seus testes.
6. Reescrita das duas páginas, incluindo a correção do tratamento de erro.
7. Regras de impressão e `PrintHeader`.
