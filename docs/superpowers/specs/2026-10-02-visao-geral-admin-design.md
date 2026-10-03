# Visão geral do admin com gráficos — design

Data: 2026-10-02

Sub-projeto 2 de 3 da melhoria de métricas e navegação:

1. Navegação — `2026-10-02-navegacao-admin-portal-design.md` (PR #51)
2. **Visão geral do admin** (este documento)
3. Portal que vende — detalhe por campanha e comprovante para o anunciante

Depende do sub-projeto 1: a Visão geral é a raiz do admin (`/`) e mora no
shell novo. A branch `feat/visao-geral` parte de `feat/navegacao` e é
rebaseada na `main` quando o PR #51 entrar.

## Problema

`pages/analytics.tsx` (a Visão geral) mostra totais acumulados desde sempre e
uma tabela de anúncios. Não há período nem gráfico, então a página não
responde às perguntas que o admin faz ao abri-la:

- A rede está saudável? Alguma TV passou o dia apagada?
- As exibições estão subindo ou caindo?
- Em que horário a rede mais exibe?
- Quem ocupa a rede (campanhas), onde ela mais roda (TVs) e qual arte
  funciona (peças)?

## Decisões

- **Um período governa a página inteira** (7, 30 ou 90 dias; padrão 30), como
  no portal. Card, gráfico e ranking respondem à mesma pergunta. Totais de
  cadastro (TVs, clientes, TVs online) continuam como "agora".
- **Cards do período com delta** em relação ao período anterior.
- **Disponibilidade = TVs que funcionaram no dia** (se conectaram ao menos
  uma vez) sobre as TVs cadastradas até aquele dia. Não é "% de horas no
  ar": as TVs desligam fora do horário da loja, e uma rede saudável
  apareceria com 50%.
- **Os blocos se complementam.** Três rankings respondem perguntas
  diferentes (campanhas, TVs, peças), e a tooltip de disponibilidade traz as
  exibições do dia, para a queda de exibições aparecer junto da causa (TVs
  paradas) ou da falta dela (TVs no ar, sem campanha).
- **Três endpoints por assunto**, cada bloco da tela carrega e falha sozinho.
  Um endpoint só deixaria a query mais cara (ranking) segurar a página, e
  qualquer falha a derrubaria inteira.

## Tela (`pages/analytics.tsx`)

De cima para baixo; no celular tudo empilha em uma coluna.

1. **Título "Visão geral" e filtro de período** (`PeriodFilter`).
2. **Cards** (`KpiCard`):
   - do período, com delta: Exibições, Tempo de exibição, Scans (dica:
     visitantes únicos), Taxa de scan;
   - de agora, sem delta: TVs online agora ("12 de 14"), Clientes.
3. **Exibições e scans por dia** — `TrendChart` com eixo duplo, igual ao
   portal.
4. **TVs que funcionaram por dia** — barras "X de Y TVs". Dia sem histórico
   (`activeDevices: null`) vira barra cinza com rótulo "sem dados". Tooltip:
   "X de Y TVs · N exibições".
5. **Exibições por horário** — barras de 0h a 23h, horário de São Paulo.
6. **Rankings**, lado a lado no desktop:
   - Campanhas — top 10 por exibições, barras horizontais, link para
     `/campaigns/:id`;
   - TVs — top 10 por exibições, barras horizontais, link para
     `/devices/:id`;
   - Peças — tabela (exibições, scans, taxa de scan, tempo de exibição) com a
     nota "Scan mede resposta, não alcance…" que existe hoje. Tabela, e não
     barra, porque comparar taxa entre peças é leitura de número.

## API

Os três endpoints entram no `lib/api-spec/openapi.yaml`, com client e zod
gerados, como o resto do admin (`useGetAnalyticsSummary` hoje). Ficam em
`artifacts/api-server/src/routes/analytics.ts`, atrás do mesmo middleware de
admin das rotas vizinhas.

Regras comuns:

- `days` aceita só `7`, `30` ou `90`; ausente vale `30`; qualquer outro valor
  responde **400**. Reaproveita `parseDays` de `lib/portal/period.ts`.
- Janela atual e anterior por `portalPeriod` e `previousPortalPeriod` (a
  anterior cobre o mesmo tempo decorrido, para não acusar queda falsa de
  manhã).
- Dias e horas no fuso `BUSINESS_TIME_ZONE` (`America/Sao_Paulo`).
- Scan com `is_bot = true` fica fora de tudo.
- `scanRate` = scans / exibições, `0` quando não há exibição (`lib/scan-rate`).

### `GET /analytics/overview?days=30`

```jsonc
{
  "period": { "days": 30, "from": "2026-09-03", "to": "2026-10-02" },
  "totals": {
    "plays": 48210, "durationSeconds": 482100, "scans": 391, "uniqueVisitors": 274, "scanRate": 0.0081,
    "previous": { "plays": 43044, "durationSeconds": 430440, "scans": 376, "uniqueVisitors": 280, "scanRate": 0.0087 }
  },
  "now": { "devices": 14, "devicesOnline": 12, "clients": 6 },
  "series": [
    { "date": "2026-09-03", "plays": 1610, "scans": 12, "activeDevices": null, "totalDevices": 13 },
    { "date": "2026-09-24", "plays": 1702, "scans": 15, "activeDevices": 12, "totalDevices": 14 }
  ]
}
```

- `series` tem um ponto por dia do período, zeros inclusos (`fillSeries`).
- `uniqueVisitors` conta `fingerprint` distinto no período.
- `now.devicesOnline` usa `isOnlineAt` (janela de presença de 5 minutos), no
  instante da requisição.
- **`activeDevices`**: TVs com ao menos uma sessão de `device_sessions` que
  toca o dia — `started_at` antes do fim do dia e `last_seen_at` a partir do
  começo dele. Sessão que atravessa a meia-noite conta nos dois dias.
- **`activeDevices: null`** quando o dia é anterior ao começo do histórico:
  o dia seguinte ao dia local da sessão mais antiga da tabela — o primeiro
  dia é parcial (a gravação começou no meio dele). Sem nenhuma sessão, todos os
  dias são `null`. A tela mostra "sem dados", nunca zero — zero diria que a
  rede inteira caiu.
- **`totalDevices`**: TVs com `created_at` antes do fim do dia. TV instalada
  no dia 20 não vira falha nos dias 1 a 19.

### `GET /analytics/hourly?days=30`

```jsonc
{ "period": { … }, "hours": [ { "hour": 0, "plays": 12 }, …, { "hour": 23, "plays": 40 } ] }
```

Sempre 24 pontos, `hour` de 0 a 23 no fuso do negócio, zeros preenchidos.

### `GET /analytics/rankings?days=30`

```jsonc
{
  "period": { … },
  "campaigns": [ { "campaignId": 4, "name": "Natal", "advertiserName": "Padaria Central", "plays": 9120 } ],
  "devices": [ { "deviceId": 2, "name": "TV do balcão", "clientName": "Padaria Central", "plays": 6011 } ],
  "announcements": [ { "announcementId": 9, "title": "Pão de mel", "plays": 3001, "scans": 41, "scanRate": 0.0137, "durationSeconds": 30010 } ]
}
```

- Top 10 de cada lista, por exibições no período, decrescente; empate
  desempata por id crescente para a ordem ser estável.
- Exibição com `campaign_id` nulo (conteúdo fixo da playlist) não entra no
  ranking de campanhas; entra nos de TVs e peças.
- `advertiserName` e `clientName` são `companies.name`, o mesmo nome que
  aparece na página da empresa.

### Sai

`GET /analytics/summary` (rota, `openapi.yaml` e client gerado). O único
consumidor é a página que este design reescreve.

## Regras em funções puras

Os testes do repositório não abrem banco. As regras que erram em silêncio
ficam em funções puras em `artifacts/api-server/src/lib/admin-overview/`, e
o SQL só busca as linhas:

| Função | Regra |
|---|---|
| `dailyAvailability(keys, sessions, devices, historyStartKey, timeZone)` | `activeDevices`/`totalDevices` por dia: sessão que atravessa a meia-noite, TV cadastrada no meio do período, dia antes do histórico vira `null` |
| `fillHours(rows)` | 24 pontos, zeros onde o banco não devolveu linha |

`sessions` são `{ deviceId, startedAt, lastSeenAt }` das sessões que tocam a
janela (`started_at < to` e `last_seen_at >= from`); `devices` são
`{ id, createdAt }`.

## Retenção do histórico de conexão

Hoje `SESSION_HISTORY_DAYS = 30` (`lib/device-presence.ts`) governa a limpeza
e a linha do tempo da página da TV. Com o período de 90 dias, o gráfico de
disponibilidade ficaria vazio em dois terços.

- `SESSION_HISTORY_DAYS` passa a **90** e governa só a limpeza
  (`buildPruneSessionsQuery`).
- Nasce `SESSION_TIMELINE_DAYS = 30` com `sessionTimelineSince(now)`, usado
  por `buildListSessionsQuery`. A linha do tempo da TV continua mostrando 30
  dias.

O histórico de 90 dias se completa sozinho com o tempo; até lá, os dias sem
histórico aparecem como "sem dados".

## Índices

Os índices de `plays` (`created_at`, `campaign_id + created_at`,
`device_id + created_at`) cobrem as consultas por janela. `scans` tem
índices por `campaign_id + created_at` e `announcement_id + created_at`, mas
nenhum começa por `created_at`: as consultas de total e de série de scans
fazem varredura sequencial em `scans`, aceitável enquanto a tabela é pequena.
`device_sessions` tem uma linha por queda de conexão; o índice
`(device_id, last_seen_at)` basta. Nenhuma migration.

## Front

Reaproveitados como estão, de `components/portal/`: `PeriodFilter`,
`KpiCard`, `TrendChart`, `delta`. Mover para uma pasta comum só mexeria em
import.

Novos, em `artifacts/signage/src/components/analytics/`, nenhum sabe de onde
vêm os dados:

| Arquivo | Contrato |
|---|---|
| `availability-chart.tsx` | Recebe a série do overview. Barras `activeDevices` de `totalDevices`; `null` vira barra cinza "sem dados"; tooltip com exibições do dia |
| `hourly-chart.tsx` | Recebe os 24 pontos. Barras 0h–23h |
| `ranking-list.tsx` | Recebe `{ key, label, sublabel, value, href }[]`. Barras horizontais em CSS (largura proporcional ao maior valor), cada linha um link de verdade — Recharts não faz link acessível. Serve campanhas e TVs |
| `announcements-table.tsx` | Tabela de peças com a nota sobre scan |

`pages/analytics.tsx` vira composição desses blocos. O período fica num
`useState` e entra nas query keys das três consultas.

Gráficos com `isAnimationActive={false}`, como o `TrendChart`, para a
impressão não sair pela metade.

### Erros e vazio

- Cada bloco tem skeleton e erro próprios ("Não foi possível carregar" +
  "Tentar de novo" chamando o `refetch` daquela consulta). Ranking fora do ar
  não apaga os gráficos.
- Período sem exibição: gráficos com zeros e aviso "Nenhuma exibição no
  período"; rankings vazios com "Nenhuma exibição no período". Nunca página em
  branco.

## Testes

API (Vitest, fake de banco no molde dos testes de rota existentes):

- `days=15` e `days=abc` → 400; sem `days` → período de 30 nos três.
- Formato de cada endpoint com linhas falsas do banco.
- `dailyAvailability`: sessão atravessando a meia-noite conta nos dois dias;
  TV criada no meio do período só entra no total a partir do dia dela; dia
  antes do histórico → `null`; sem sessões → tudo `null`; TV com duas sessões
  no mesmo dia conta uma vez.
- `fillHours`: 24 pontos, zeros, ordem 0–23.
- Retenção: a limpeza usa 90 dias; a listagem da linha do tempo, 30
  (`.toSQL()` como nos testes atuais de `device-sessions`).

Front (Vitest + Testing Library):

- Página com os três endpoints respondendo: cards com delta, os quatro
  blocos visíveis.
- Dia `null` mostra "sem dados".
- Links do ranking apontam para `/campaigns/:id` e `/devices/:id`.
- Erro em `/analytics/rankings` mostra erro só no bloco de ranking; gráficos
  continuam.
- Trocar o período refaz as três consultas com o novo `days`.

## Fora do escopo

- Clicar num dia e filtrar os rankings por ele.
- Intervalo de datas customizado.
- Métricas novas do portal, comprovante (sub-projeto 3).
- Alertas e notificações de TV caída.

## Versão

PR `feat(admin): Visão geral com gráficos de exibição, disponibilidade e rankings`
→ minor.
