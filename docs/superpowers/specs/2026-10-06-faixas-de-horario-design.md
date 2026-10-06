# Faixas de horário nas campanhas — design

Data: 2026-10-06
Branch: `feat/faixas-de-horario`

## Objetivo

Deixar a campanha rodar só em horários escolhidos do dia (ex.: café da manhã
07:00–10:00 e happy hour 18:00–22:00). Hoje a agenda só tem período
(`startsAt`/`endsAt`) e dias da semana (`weekdays`); o horário é o padrão de
mercado que falta para vender espaço por período do dia.

É o primeiro de cinco sub-projetos de "programação" (faixas de horário →
frequência/peso → mensagem urgente → conteúdo editorial → zonas na tela).
Cada um tem spec, plano e PR próprios.

## Regras decididas

1. **Mesmas faixas em todos os dias marcados.** As faixas se combinam com
   `weekdays`: a campanha roda nos dias marcados, dentro das faixas. Não há
   faixa diferente por dia da semana.
2. **Faixa não cruza meia-noite.** Sempre `início < fim` no mesmo dia. Quem
   quer 22h–02h cadastra 22:00–24:00 e 00:00–02:00.
3. **Só campanhas de anunciante.** Painéis do lojista e playlist do device não
   ganham horário neste sub-projeto.
4. **Lista vazia = dia todo.** Campanha antiga não muda de comportamento, como
   foi feito com `weekdays`.
5. **Até 4 faixas, passo de 15 minutos.**
6. **Intervalo semiaberto `[início, fim)`.** 07:00–10:00 roda às 07:00 e não
   roda às 10:00.
7. **A TV vitrine respeita a faixa.** Hoje ela só olha o dia ("só a agenda
   vale"); horário é agenda.

## Dados

Coluna nova em `campaigns` (`lib/db/src/schema/campaigns.ts`):

```ts
// Faixas do dia em que a campanha vai ao ar, em minutos desde 00:00 no fuso
// do negócio: [{ start: 420, end: 600 }] = 07:00–10:00. Fim exclusivo; 1440 =
// 24:00. Lista vazia é "dia todo": mantém as campanhas antigas como estavam.
timeWindows: jsonb("time_windows").$type<TimeWindow[]>().notNull().default([]),
```

`TimeWindow = { start: number; end: number }`.

Por que `jsonb` com minutos, e não tabela própria ou arrays paralelos: o feed
roda a cada 60s por TV e já lê a linha da campanha — uma coluna a mais não
custa join; arrays paralelos de início/fim dessincronizam fácil; minutos
inteiros comparam direto, sem parse de texto no caminho quente. A integridade
fica na validação da API (abaixo), que é a única porta de escrita.

Migração versionada gerada com `pnpm --filter @workspace/db run generate` e
commitada (o build da Vercel aplica `lib/db/drizzle/`).

## Regra no servidor (`artifacts/api-server/src/lib/ad-eligibility.ts`)

- `type TimeWindow = { start: number; end: number }` e
  `CampaignSchedule = { weekdays: number[]; timeWindows: TimeWindow[] }`.
- `normalizeTimeWindows(windows)`: ordena por início, junta faixas que se
  sobrepõem ou se encostam (07–10 + 09–12 → 07–12; 07–10 + 10–12 → 07–12) e
  devolve `[]` se o resultado cobre 0–1440. Mesmo papel do
  `normalizeWeekdays`: duas formas de dizer "dia todo" viram o mesmo dado.
- `campaignRunsAtTime(windows, now, timeZone = BUSINESS_TIME_ZONE)`: lista
  vazia → `true`. Senão, hora e minuto locais saem de `Intl.DateTimeFormat`
  (`hourCycle: "h23"`) no fuso do negócio — nunca `getHours()`, pelo mesmo
  motivo do `campaignRunsOnDay` (servidor em UTC). Roda se
  `start <= minutoAtual < end` para alguma faixa.
- `filterEligibleSlides` passa a exigir também
  `campaignRunsAtTime(slide.timeWindows, now)`.
- `device-feed.ts`:
  - `buildCampaignSlidesQuery` seleciona `timeWindows: campaignsTable.timeWindows`;
  - a query da playlist devolve `timeWindows: sql\`'[]'::jsonb\``;
  - o filtro da vitrine vira
    `campaignRunsOnDay(...) && campaignRunsAtTime(slide.timeWindows, now)`;
  - `timeWindows` é removido do slide antes da resposta, junto com `weekdays`.
- `panels/device-slides.ts`: `timeWindows?: TimeWindow[]` em
  `CampaignOnlyFields`.

Atraso aceito: a TV busca o feed a cada 60s, então a campanha entra/sai em até
~1 min + a duração do slide em exibição. O intervalo de busca não muda.

Alcance (`previewReach`) e regra do concorrente não mudam: horário decide
*quando* a campanha toca, não *em quais* TVs.

## API (`artifacts/api-server/src/routes/advertisers.ts`)

Schema zod de criar/editar campanha ganha:

```ts
timeWindows: z
  .array(
    z.object({
      start: z.coerce.number().int().min(0).max(1425).multipleOf(15),
      end: z.coerce.number().int().min(15).max(1440).multipleOf(15),
    }).refine((w) => w.start < w.end, "Fim da faixa precisa ser depois do início"),
  )
  .max(4)
  .default([]),
```

Grava `normalizeTimeWindows(input.timeWindows)` no POST e no PATCH. Entrada
inválida → 400 com a mensagem do zod, como os outros campos. O GET da
campanha devolve `timeWindows` junto de `weekdays`.

O limite de 4 vale para a entrada, antes de juntar; depois de normalizar a
lista só diminui.

`PATCH /campaigns/:id` regrava o corpo inteiro (campo ausente cai no
`default`), igual ao que já acontece com `weekdays`: um painel antigo em cache
que salve a campanha sem mandar `timeWindows` volta ela para "dia todo". Risco
aceito — é o mesmo de hoje e some no primeiro reload do painel. Por isso o
formulário sempre envia `timeWindows`, mesmo vazio.

## Interface (`artifacts/signage`)

- **`src/lib/time-windows.ts`** (novo):
  - `minutesToHHMM(420) → "07:00"`, `minutesToHHMM(1440) → "24:00"`;
  - `hhmmToMinutes("07:00") → 420`;
  - `timeWindowsLabel([]) → "Dia todo"`,
    `timeWindowsLabel([{start:420,end:600},{start:1080,end:1320}]) →
    "07:00–10:00, 18:00–22:00"`;
  - `isValidWindow(w)` (`start < end`).
- **`use-campaign-form.ts`**: estado `timeWindows` com `addWindow`
  (nova faixa padrão 08:00–12:00), `updateWindow(index, patch)` e
  `removeWindow(index)`. Carrega de `campaign.timeWindows ?? []` ao editar e
  vai no corpo do envio. O envio fica bloqueado se alguma faixa for inválida.
- **`CampaignTimeWindowsPicker`** em `campaign-form-dialog.tsx`, logo abaixo
  do `CampaignWeekdayPicker`, exportado para a página da campanha:
  - rótulo "Horários";
  - cada faixa numa linha: `<select>` de início (00:00–23:45) e de fim
    (00:15–24:00), de 15 em 15 minutos, e botão ✕ (`aria-label="Remover faixa"`);
  - botão "+ faixa" (some com 4 faixas);
  - ajuda: `timeWindowsLabel(...)` + "Sem faixa, roda o dia inteiro nos dias
    marcados.";
  - faixa com fim ≤ início mostra "Fim precisa ser depois do início" em
    vermelho na linha.
  - `select` em vez de `<input type="time">`: o passo de 15 minutos fica
    garantido, sem depender do navegador respeitar `step`.
- **`campaign-detail.tsx`**: o picker na edição inline, ao lado do de dias; na
  leitura, bloco "Horários" com `timeWindowsLabel(data.timeWindows)`.
- **`campaign-row.tsx`**: depois do resumo de dias, acrescenta
  ` · 07:00–10:00, 18:00–22:00` só quando há faixa (dia todo não polui a
  linha). O portal não usa `CampaignRow` (a tabela de campanhas da TV mostra só nome, anunciante e exibições), então não muda.

## Testes (TDD)

API:

- `ad-eligibility.test.ts`:
  - `normalizeTimeWindows`: ordena; junta sobreposta; junta encostada;
    `[{0,1440}]` → `[]`; faixas que juntas cobrem o dia → `[]`;
  - `campaignRunsAtTime`: vazia roda sempre; roda no minuto de início; não
    roda no minuto de fim; 22:30 em Brasília (01:30 UTC do dia seguinte) cai
    na faixa 22:00–24:00;
  - `filterEligibleSlides` corta campanha fora da faixa e mantém dentro.
- Rota de campanhas: POST/PATCH normalizam e devolvem `timeWindows`; 400 para
  fim ≤ início, minuto fora do passo de 15 e 5 faixas.
- `device-feed`: vitrine não recebe campanha fora da faixa; slide da resposta
  não carrega `timeWindows`.

Web:

- `time-windows.test.ts`: conversões ida e volta, 1440 ↔ "24:00", rótulos.
- `campaign-form-dialog.test.tsx`: adiciona e remove faixa; "+ faixa" some na
  quarta; faixa inválida bloqueia o salvar; corpo do envio leva `timeWindows`.
- `campaign-row`: mostra a faixa quando há, não mostra quando é dia todo.

## Fora do escopo

- Horário em painéis do lojista e na playlist do device.
- Faixa por dia da semana e faixa que cruza meia-noite.
- Relatório de exibições por faixa e preço por faixa.
- Avaliar o horário na própria TV (vem com o sub-projeto "tocar sem
  internet", quando a TV precisar decidir sozinha).

## PR

Título: `feat(api): faixas de horário nas campanhas` (minor).
