# Relatórios do portal: campanha do anunciante e TV do cliente — design

Data: 2026-10-03

Sub-projeto 3 de 3 da melhoria de métricas e navegação:

1. Navegação — PR #51 (v1.18.0)
2. Visão geral do admin — PR #52 (v1.19.0)
3. **Relatórios do portal** (este documento)

## Problema

O portal mostra totais do período, mas nada abre: o anunciante vê a linha
"Natal · 9.120 exibições" e não consegue saber **onde** e **quando** a
campanha passou nem **qual peça** funcionou; o cliente vê "Balcão · 6.011
exibições" e não sabe se a TV ficou no ar todos os dias nem **o que** passou
nela. Sem isso não há o que levar para uma renovação de contrato.

## Decisões

- **Anunciante e cliente** entram neste sub-projeto.
- **Anunciante entra por campanha**; o relatório cobre **o contrato inteiro**
  (do início ao fim, ou até hoje se ainda está no ar), sem o filtro 7/30/90.
  É o período que o comprovante precisa provar.
- **Ordem de importância no anunciante:** primeiro a prova de veiculação
  ("paguei e passou"), depois o resultado ("funcionou?").
- **O anunciante vê loja e local de cada TV** onde a campanha passou — é o
  que ele paga para ter e a prova mais forte.
- **O cliente vê o nome do anunciante e da campanha** que passaram nas TVs
  dele — as peças já aparecem na tela da loja.
- **Cliente entra por TV**, com o período 7/30/90 do resto do portal: a TV
  não tem começo e fim de contrato.
- **Um endpoint por página.** A página é pequena e o comprovante impresso
  sai de um retrato só, consistente; um bloco que falhasse deixaria buraco no
  papel.

## Telas

### Anunciante — `/portal/anunciante/campanhas/:id`

Na tabela "Campanhas no período" (`pages/portal-advertiser.tsx`), o nome da
campanha vira link para cá.

- **Topo:** `PageHeader` "Desempenho › {campanha}"; período do contrato
  ("01/09/2026 a 30/09/2026", ou "desde 01/09/2026 · no ar"); status;
  botão "Imprimir / PDF". Impresso, sai com `PrintHeader` (campanha, período,
  data de emissão).
- **Prova de veiculação:**
  - cards: Exibições no contrato, Tempo de exibição, TVs que exibiram
    ("9 de 12 no alvo"), Lojas;
  - exibições por dia em todo o contrato (`TrendChart`, só exibições);
  - tabela **"Onde passou"**: loja · TV · local · exibições · primeira e
    última exibição — todas as TVs que exibiram, ordenadas por exibições.
- **Resultado:**
  - cards: Scans, Visitantes únicos, Taxa de resposta;
  - tabela de peças: exibições, scans, taxa — todas as peças da campanha,
    inclusive as com zero exibição;
  - exibições por horário (`HourlyChart`);
  - nota "Scan mede resposta, não alcance…". Scan não carrega a TV de
    origem, então a resposta não é quebrada por loja.
- **Campanha agendada** (ainda não começou): "A campanha começa em
  dd/mm/aaaa." no lugar dos blocos.

### Cliente — `/portal/tvs/:id`

Em "Minhas TVs" (`pages/portal-client.tsx`), o nome da TV vira link para cá.

- **Topo:** `PageHeader` "Minhas TVs › {TV}"; local; selo online/offline
  agora; `PeriodFilter` 7/30/90; botão "Imprimir / PDF" com `PrintHeader`.
- **Cards:** Exibições (com variação contra o período anterior), Dias em que
  funcionou ("28 de 30"), Tempo de exibição.
- **Exibições por dia** (`TrendChart`).
- **Dias no ar** (`OnlineDaysStrip`): um quadrado por dia — funcionou,
  parada, sem dados; o dia de hoje marcado como em andamento.
- **Exibições por horário** (`HourlyChart`).
- **"O que passou"**: campanha · anunciante · exibições; o que não tem
  campanha (playlist e encartes da loja) numa linha "Conteúdo da loja".

### Rotas

No `PortalRoutes` (`App.tsx`), cada uma só para o papel certo:

| Rota | Papel | Página |
|---|---|---|
| `/portal/anunciante/campanhas/:id` | anunciante | `pages/portal-campaign-report.tsx` |
| `/portal/tvs/:id` | cliente | `pages/portal-device-report.tsx` |

`/portal/tvs/:id` é registrada antes de `/portal/tvs`. `:id` que não é inteiro
positivo redireciona para a lista (`/portal/anunciante` ou `/portal/tvs`),
como já acontece com `/portal/paineis/:id`.

## API

Segue o precedente do portal: `fetch` manual com tipos declarados na página,
fora do `openapi.yaml`. Rotas em `artifacts/api-server/src/routes/portal.ts`,
consultas em `artifacts/api-server/src/lib/portal/reports.ts` (novo).

Regras comuns:

- `requireAdvertiser` / `requireClient`; escopo por `advertiserScope(req)` /
  `clientScope(req)`, como as rotas vizinhas.
- `:id` que não é inteiro positivo → **400** `{ "error": "Campanha inválida." }`
  / `{ "error": "TV inválida." }`.
- Campanha de outro anunciante, TV de outra loja, ou inexistente → **404**
  `{ "error": "Campaign not found" }` / `{ "error": "Device not found" }`,
  sem distinguir os casos — não confirma que existe. Escopo vazio (admin do
  env) → 404.
- `contractValue` nunca aparece.
- Scan com `is_bot = true` fica fora. `scanRate` = scans / exibições, `0` sem
  exibição (`lib/scan-rate`).
- Dias e horas no fuso `BUSINESS_TIME_ZONE`.

### `GET /portal/advertiser/campaigns/:id/report`

```jsonc
{
  "campaign": { "id": 4, "name": "Natal", "startsAt": "2026-09-01T03:00:00.000Z", "endsAt": "2026-10-01T02:59:59.000Z", "isActive": true, "status": "no_ar" },
  "period": { "from": "2026-09-01", "to": "2026-09-30" },
  "totals": {
    "plays": 9120, "durationSeconds": 91200, "devicesPlayed": 9, "devicesTargeted": 12, "stores": 6,
    "scans": 81, "uniqueVisitors": 60, "scanRate": 0.0089
  },
  "series": [{ "date": "2026-09-01", "plays": 300, "scans": 2 }],
  "hours": [{ "hour": 0, "plays": 0 }],
  "devices": [{
    "deviceId": 2, "storeName": "Padaria Central", "deviceName": "Balcão", "location": "Entrada",
    "plays": 1240, "firstPlayedAt": "2026-09-01T11:02:00.000Z", "lastPlayedAt": "2026-09-30T21:40:00.000Z"
  }],
  "announcements": [{ "announcementId": 9, "title": "Pão de mel", "plays": 3001, "scans": 41, "scanRate": 0.0137 }]
}
```

- **Janela do contrato** (`campaignWindow`, função pura): começa em
  `startsAt`; termina em `min(endsAt, agora)`. `period.from`/`period.to` são
  os dias locais dessas duas pontas; `series` tem um ponto por dia entre eles,
  zeros inclusos.
- **`status`**: `agendada` quando `agora < startsAt`; `encerrada` quando
  `agora >= endsAt`; senão `no_ar`. Campanha agendada responde com totais
  zerados, `series`, `hours` (24 zeros), `devices` e `announcements` vazios —
  sem consultar exibições.
- **`devicesTargeted`**: `countReachedDevices` sobre a rede atual, a mesma
  conta da coluna "TVs no alvo" de `advertiserCampaigns`.
- **`devicesPlayed`**: TVs distintas com exibição da campanha na janela.
  **`stores`**: clientes distintos dessas TVs.
- **`devices`**: todas as TVs que exibiram, por exibições decrescente,
  desempate por `deviceId`. `storeName` é `companies.name` do cliente da TV.
- **`announcements`**: todas as peças ligadas à campanha
  (`campaign_announcements`), com zero quando não exibiram, por exibições
  decrescente e desempate por `announcementId`. Scans por peça contam
  `scans.campaign_id = campanha` e `scans.announcement_id = peça`.
- `uniqueVisitors` = `fingerprint` distinto dos scans da campanha na janela.

### `GET /portal/client/devices/:id/report?days=30`

```jsonc
{
  "device": { "id": 2, "name": "Balcão", "location": "Entrada", "isOnline": true },
  "period": { "days": 30, "from": "2026-09-04", "to": "2026-10-03" },
  "totals": {
    "plays": 6011, "durationSeconds": 60110, "daysOnline": 28, "daysWithHistory": 30,
    "previous": { "plays": 5800 }
  },
  "series": [{ "date": "2026-09-04", "plays": 200, "online": true }],
  "hours": [{ "hour": 0, "plays": 0 }],
  "campaigns": [
    { "campaignId": 4, "campaignName": "Natal", "advertiserName": "Padaria Central", "plays": 900 },
    { "campaignId": null, "campaignName": null, "advertiserName": null, "plays": 300 }
  ]
}
```

- `days` com as regras do portal (`parseDays`: 7, 30, 90; ausente = 30; outro
  valor → 400). Janela atual e anterior por `portalPeriod` /
  `previousPortalPeriod`.
- **`online` por dia**: `dailyAvailability` com só esta TV —
  `activeDevices` 1 → `true`, 0 → `false`; `null` (antes do começo do
  histórico) ou `totalDevices` 0 (antes do cadastro da TV) → `null`.
- **`daysOnline`** = dias `true`; **`daysWithHistory`** = dias não `null`.
- **`isOnline`**: `isOnlineAt(lastSeenAt, agora)`.
- **`campaigns`**: exibições da TV na janela agrupadas por campanha, por
  exibições decrescente; a linha `campaignId: null` junta o que não tem
  campanha. `advertiserName` é `companies.name` do anunciante.

### Começo do histórico compartilhado

O cálculo "dia seguinte ao dia local da sessão mais antiga" sai de
`lib/admin-overview/queries.ts` para `historyStartKey()` em
`lib/admin-overview/history.ts`, usado pela Visão geral e pelo relatório da
TV. Os dois lados nunca divergem.

## Front

Reaproveitados como estão: `PageHeader`, `PrintHeader`, `PeriodFilter`,
`KpiCard`, `TrendChart`, `formatDelta`, `HourlyChart` e `BlockError`
(`components/analytics/`).

Novos, em `artifacts/signage/src/components/portal/`, nenhum sabe de onde vêm
os dados:

| Arquivo | Contrato |
|---|---|
| `where-played-table.tsx` | "Onde passou": loja · TV · local · exibições · primeira/última exibição (data e hora pt-BR). Rolagem horizontal no celular; linha não quebra entre páginas impressas |
| `campaign-pieces-table.tsx` | Peças: exibições, scans, taxa; nota "Scan mede resposta, não alcance…" |
| `online-days-strip.tsx` | Um quadrado por dia: funcionou (verde), parada (vermelho), sem dados (cinza); o último dia com borda tracejada e rótulo "hoje (em andamento)". CSS, não Recharts — com uma TV só, barra de 0 ou 1 é desperdício, e quadrado imprime bem. Cada quadrado com `aria-label` ("12/09: funcionou"). Legenda visível |
| `device-campaigns-table.tsx` | "O que passou": campanha · anunciante · exibições; linha sem campanha como "Conteúdo da loja" |

Páginas novas `pages/portal-campaign-report.tsx` e
`pages/portal-device-report.tsx`: composição dos blocos com `useQuery` e
`fetch` manual (mesmo `getJson` das páginas do portal). Erro de rede: "Não
foi possível carregar" + "Tentar de novo". Resposta 404: "Campanha não
encontrada" / "TV não encontrada" com link de volta à lista.

## Testes

API (Vitest + supertest, fake das consultas como em `portal-overview.test.ts`):

- `:id` inválido → 400 nas duas rotas.
- Campanha de outro anunciante e TV de outra loja → 404, sem chamar a
  consulta do relatório; escopo vazio → 404.
- 200 repassa o id e o escopo da sessão; `days` inválido → 400 na rota da TV.
- `campaignWindow`: agendada, no ar (termina agora), encerrada (termina em
  `endsAt`); dias locais certos.
- Dias da TV a partir de `dailyAvailability`: `true`/`false`/`null`, TV
  cadastrada no meio do período, contagens `daysOnline` e `daysWithHistory`.

Front (Vitest + Testing Library):

- Relatório da campanha com dados: cards, "Onde passou" com as lojas,
  peças, botão de impressão.
- Campanha agendada mostra "A campanha começa em …".
- 404 mostra "Campanha não encontrada"; erro de rede mostra "Tentar de novo".
- Relatório da TV: cards ("28 de 30"), faixa de dias com "sem dados",
  "Conteúdo da loja", troca de período refaz a consulta com o novo `days`.
- Links: nome da campanha em `portal-advertiser` e da TV em `portal-client`
  apontam para o detalhe.
- Rotas: `/portal/tvs/abc` volta para `/portal/tvs`; anunciante em
  `/portal/tvs/2` cai no redirect do papel.

## Fora do escopo

- Filtro de datas customizado no relatório da campanha.
- Quebra da resposta (scans) por loja — scan não carrega a TV.
- Relatório por campanha do lado do cliente.
- PDF gerado no servidor (a impressão do navegador continua sendo o PDF).

## Versão

PR `feat(portal): relatório da campanha para o anunciante e da TV para o cliente`
→ minor.
