# Clima e hora na volta da TV — design

Data: 2026-10-07
Branch: `feat/clima-e-hora`

## Objetivo

Dar às TVs um conteúdo editorial que prende o olhar de quem espera: um slide
com o clima da cidade da loja e a data/hora, intercalado na volta como
qualquer item do lojista. Conteúdo que a pessoa olha de propósito aumenta a
chance de ver o anúncio que vem depois.

Quarto de cinco sub-projetos de programação (faixas de horário ✓ →
frequência por volta ✓ → aviso urgente ✓ → conteúdo editorial → zonas na
tela). Notícias e futebol ficam para sub-projetos seguintes.

## Regras decididas

1. **Só clima e hora** neste sub-projeto.
2. **Admin liga por TV**, desligado por padrão. Nada muda nas TVs até alguém
   ligar.
3. **Imagem gerada na hora pelo servidor** (satori), com a hora do minuto;
   a TV não muda.
4. **Fonte do clima: Open-Meteo** (grátis, sem chave), pelas coordenadas da
   empresa dona da TV.
5. **Peso 1 na volta**, como um item da playlist, depois da playlist.
6. **Não conta exibição**: é conteúdo de sistema, como o aviso urgente.
7. **Falha no clima nunca tira o slide**: sai só data e hora com "Previsão
   indisponível".
8. **Aviso urgente continua tomando a TV inteira** (o clima some junto).
9. **Vitrine não mostra clima.**

## Dados

- `devices.show_weather boolean NOT NULL DEFAULT false`
  (`lib/db/src/schema/devices.ts`). Default falso mantém tudo igual e o
  servidor da versão anterior funcionando no deploy.
- **Peça de sistema única** "Clima e hora": linha em `announcements` com
  `source = 'editorial'`, `media_kind = 'image'`, `orientation = 'landscape'`,
  `is_active = true`, `duration = 10`, `image_url` nulo. Criada por um
  `INSERT … WHERE NOT EXISTS (SELECT 1 FROM announcements WHERE source =
  'editorial')` acrescentado ao fim do SQL da migração gerada (o snapshot do
  drizzle não muda: é dado, não schema). Existe só para a TV ter um
  `announcementId` ao registrar a exibição.

Migração gerada com `pnpm --filter @workspace/db run generate`. Esperado: o
`ADD COLUMN "show_weather"` e, acrescentado à mão, o `INSERT` acima.

## Fontes de sistema (`artifacts/api-server/src/lib/system-sources.ts`)

```ts
/** Peças geradas pelo sistema: não são anúncio, não contam exibição, não se escolhem nem se editam. */
export const SYSTEM_SOURCES = ["alert", "editorial"] as const;
export function isSystemSource(source: string | null | undefined): boolean;
```

Todo lugar que hoje trata `"alert"` à parte passa a usar isso, sem mudar o
comportamento do aviso:

- telemetria (`/telemetry/plays` e `/telemetry/play`): descarta exibição de
  fonte de sistema;
- `buildAnnouncementsListQuery` e a contagem de `/announcements/stats`:
  `notInArray(source, SYSTEM_SOURCES)`;
- campanha (`dropPanelAnnouncementIds`), playlist (`/devices/:id/playlist/add`)
  e `PATCH`/toggle/`DELETE` de peça: bloqueiam fonte de sistema. Mensagens:
  as de aviso continuam iguais para `alert`; `editorial` usa "Peça de sistema
  não pode ser …".

## Clima (`artifacts/api-server/src/lib/editorial/`)

- `weather-codes.ts`: `weatherLabel(code: number): string` — códigos WMO do
  Open-Meteo para português (0 "Céu limpo", 1 "Predomínio de sol", 2
  "Parcialmente nublado", 3 "Nublado", 45/48 "Neblina", 51/53/55 "Garoa",
  61/63/65 "Chuva fraca"/"Chuva"/"Chuva forte", 66/67 "Chuva congelante",
  71/73/75/77 "Neve", 80/81/82 "Pancadas de chuva"/"Pancadas fortes"/"Temporal",
  95/96/99 "Trovoadas"); desconhecido → "Tempo instável".
- `forecast.ts`:
  - `type Forecast = { current: { temperature: number; code: number }; today: { max: number; min: number; code: number }; nextDays: Array<{ date: string; max: number; min: number; code: number }> }` (3 dias seguintes);
  - `parseForecast(json: unknown): Forecast | null` — lê `current.temperature_2m`,
    `current.weather_code`, `daily.time/weather_code/temperature_2m_max/
    temperature_2m_min`; qualquer campo faltando → `null`;
  - `fetchForecast(lat, lng, now = new Date()): Promise<Forecast | null>` —
    GET `https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America%2FSao_Paulo&forecast_days=4`,
    timeout 3s (`AbortSignal.timeout`), cache em memória por coordenada
    arredondada a 2 casas por 30 min; erro, timeout, status ≠ 200 ou resposta
    incompleta → `null` (nunca lança; erro não é guardado no cache).
- `clock.ts`: `formatClock(now: Date): string` → `"quarta, 7 de outubro · 15:42"`
  no fuso `America/Sao_Paulo` (`Intl`, `pt-BR`).
- `weather-template.ts`: `weatherNode(input, orientation)` com
  `input = { city: string; clock: string; forecast: Forecast | null }`;
  mostra cidade, temperatura atual arredondada com "°", condição, "máx X° ·
  mín Y°", os 3 próximos dias (dia da semana curto + máx/mín) e o relógio.
  Sem previsão: cidade, relógio e "Previsão indisponível". Tamanho igual ao
  aviso (1920×1080 / 1080×1920); `wordBreak: "break-word"` nos textos.
- `render.ts`: `renderWeather(input, orientation): Promise<Buffer>` via
  `rasterize` de `lib/panels/render.ts`.

## Rota da imagem (`artifacts/api-server/src/routes/editorial.ts`, pública)

Registrada em `routes/index.ts` junto das rotas públicas (antes de
`loadSession`), como o feed.

`GET /editorial/weather.png?company=<id>&o=<landscape|portrait>&m=<minuto>`:

- `company` inteiro positivo, `o` ∈ {landscape, portrait} (ausente → landscape);
  `m` é ignorado pelo servidor (só muda a URL para a CDN e o navegador da TV).
- busca `name`, `city`, `lat`, `lng` da empresa; inexistente ou sem
  coordenadas → 404.
- `fetchForecast(lat, lng)`, `formatClock(new Date())`, `renderWeather(...)`.
- 200 `image/png`, `Cache-Control: public, s-maxage=60, max-age=60`.
- Falha no render → 500 (a TV pula a imagem como faz com qualquer arte que
  não carrega).

## Feed (`artifacts/api-server/src/lib/device-feed.ts`)

- `FeedDevice` ganha `showWeather?: boolean` e `companyHasCoordinates?: boolean`
  (preenchidos onde o device é carregado: `routes/display.ts`, a prévia do
  admin em `routes/devices.ts`, a prévia do portal em `routes/portal.ts`; a
  vitrine não precisa).
- Se `showWeather && companyHasCoordinates && !showcase`, e a peça editorial
  existe (id buscado uma vez e guardado em memória; ausente → sem slide e log),
  `composeDeviceLoop` recebe um quarto grupo com um bloco de peso 1:
  ```ts
  { announcementId: <id editorial>, campaignId: null, title: "Clima e hora",
    imageUrl: `/api/editorial/weather.png?company=${companyId}&o=${screen}&m=${Math.floor(now.getTime() / 60000)}`,
    duration: 10, mediaKind: "image", source: "editorial", … }
  ```
  depois da playlist. `composeDeviceLoop` ganha o quarto parâmetro opcional
  `extras` (blocos de peso 1 no fim), sem mudar o resultado para quem não
  passa.
- `DeviceSlideSource` ganha `"editorial"`. O aviso urgente continua
  devolvendo só a arte dele antes de tudo isso.

## Contrato e admin

- `lib/api-spec/openapi.yaml`: `DevicePreviewSlide.source` ganha `editorial`;
  o schema do device (resposta de `GET /devices/:id` e corpo do `PATCH`)
  ganha `showWeather: boolean` e a resposta ganha `companyHasCoordinates:
  boolean`. Regenerar com `pnpm --filter @workspace/api-spec run codegen`.
- `routes/devices.ts`: `PATCH /devices/:id` aceita `showWeather`; `GET`
  devolve `showWeather` e `companyHasCoordinates`.
- `pages/device-detail.tsx`: chave (Switch) "Mostrar clima e hora na volta";
  sem coordenadas, a chave fica desabilitada com "Cadastre o CEP da empresa
  para ativar." e link para a empresa.
- `components/device-preview.tsx`: `SOURCE_LABEL.editorial = "Clima"`.

## Testes (TDD)

API:

- `system-sources.test.ts`: `alert` e `editorial` são de sistema; `admin`,
  `panel`, nulo não.
- `weather-codes.test.ts`: códigos conhecidos e desconhecido.
- `forecast.test.ts`: `parseForecast` com resposta completa e com campo
  faltando; `fetchForecast` (fetch mockado) monta a URL certa, usa o cache em
  30 min, busca de novo depois, e devolve `null` em erro/timeout/status ≠ 200
  sem guardar no cache.
- `clock.test.ts`: formato e fuso, inclusive 02:30 UTC (= 23:30 do dia
  anterior em São Paulo).
- `weather-template.test.ts`: textos com e sem previsão; `weather-render`
  gera PNG nas duas orientações.
- `editorial-route.test.ts`: 200 PNG com cabeçalho de cache; 404 sem
  coordenadas e empresa inexistente; Open-Meteo falhando ainda dá 200.
- Feed (`display-slides.test.ts`): TV com `showWeather` ganha o slide no fim
  com a URL e a peça editorial; sem a chave, sem coordenadas e vitrine não
  ganham; aviso ativo ainda toma tudo.
- Telemetria e biblioteca: os testes de `alert` existentes ganham o caso
  `editorial`.

Web:

- `device-detail`: a chave envia `showWeather`; sem coordenadas fica
  desabilitada com o aviso.
- `device-preview`: rótulo "Clima".

## Fora do escopo

- Notícias, futebol, outras cidades, ícones de tempo, slide só de hora.
- Lojista ligar pelo portal; frequência do clima na volta (fica peso 1).

## PR

Título: `feat(api): clima e hora na volta da TV` (minor).
