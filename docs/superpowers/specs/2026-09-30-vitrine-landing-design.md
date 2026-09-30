# TV da landing espelha a TV vitrine da Smart Vale — design

Data: 2026-09-30
Branch: `feat/vitrine-landing`

## Objetivo

Hoje a TV do hero da landing (e do slide "Solução" da `/apresentacao`, que usa
o mesmo `TvMockup`) é uma imitação em CSS: mostra só a imagem das peças no ar
(vídeo vira miniatura), troca a cada 5 s e o QR é um ícone. O objetivo é que
ela seja o **player de verdade**, rodando todos os anúncios no ar da rede, para
o futuro cliente ver exatamente o que a TV mostra.

A fonte é uma TV real da própria empresa: a Smart Vale TV é cadastrada como
cliente, com duas TVs "vitrine" (horizontal e vertical). A landing espelha o
feed delas, e elas aparecem no admin como qualquer TV, com números.

Sucesso = visitante vê na landing o mesmo rodízio da TV (imagens, vídeos do
YouTube, legenda, QR escaneável, tempos de cada peça); cada exibição conta no
relatório do anunciante; o admin vê as vitrines como TVs.

## Decisões

| Tema | Decisão |
|---|---|
| Fonte | Device real marcado como vitrine, da empresa Smart Vale TV |
| Orientação | Duas vitrines: uma horizontal, uma vertical. O botão da landing troca qual é espelhada |
| Campanhas | Todas no ar: ignora alvo (TVs/segmentos) e regra de concorrência. Respeita período e dias da semana |
| Outras fontes | Só a playlist da própria vitrine. Painéis/encartes de lojista ficam de fora |
| Números | Exibição na landing conta como play normal, inclusive no relatório do anunciante |
| Apresentação | `/apresentacao` usa o mesmo componente e também conta play |
| Som | Sempre mudo na landing (navegador bloqueia autoplay com som) |
| QR | Real e escaneável, conta scan como na TV |

Abordagem escolhida: player compartilhado + rota pública da vitrine. Descartadas:
iframe de `/display/<key>` (expõe a `deviceKey` no HTML, qualquer um posta play
com ela) e manter o mockup CSS trocando só a fonte (continua sem vídeo).

## 1. Dados e admin

**Migration `0015`:** `devices.showcase boolean not null default false`.

**Uma vitrine por orientação de tela.** `landscape` é horizontal;
`portrait_right` e `portrait_left` são a mesma vertical. Como a unicidade é por
grupo de valores, a checagem fica na rota (`PATCH /devices/:id`), não em índice:
ligar `showcase` num device quando já existe outra vitrine na mesma orientação
de tela responde `409 { error: "Já existe uma vitrine vertical: <nome>" }`.
Mudar a orientação de uma vitrine passa pela mesma checagem.

**Admin, página do device (`/devices/:id`):** switch "Vitrine da landing" com
texto: recebe todas as campanhas no ar, ignora alvo e concorrência, e cada visita
na landing conta como exibição. Badge "Vitrine" na lista de TVs do cliente.

**Cadastro:** manual pelo admin, sem seed no código. Empresa Smart Vale TV →
cliente → "Vitrine horizontal" (`landscape`) e "Vitrine vertical"
(`portrait_right`). Não precisa TV física: `lastSeenAt` sobe com as visitas da
landing, então a vitrine aparece online enquanto há visitantes.

**Relatórios:** sem mudança. A vitrine aparece pelo nome no relatório do
anunciante.

## 2. API

### Feed em modo vitrine

`loadDeviceSlides(device, log, now, { showcase })` em `lib/device-feed.ts`.
Com `showcase: true`:

- Campanhas: todas ativas dentro do período e que rodam hoje
  (`campaignRunsOnDay`). Não passa por `campaignReachesDevice` nem pela regra de
  concorrência de `filterEligibleSlides`.
- Painéis do lojista (`panelSlidesForClient`): não carregados.
- Playlist do device: mantida.
- Dedupe, filtro de orientação, legenda, QR e `videoIds` de playlist do YouTube:
  os mesmos da TV comum.

`/display/:deviceKey` de um device vitrine usa o mesmo modo: uma TV física
pareada com a key da vitrine mostra o mesmo que a landing.

### `GET /api/public/vitrine/:orientation/feed`

- `orientation`: `landscape | portrait`; outro valor → `400`.
- Acha o device `showcase` daquela orientação de tela. Sem vitrine →
  `404 { error: "Showcase not found" }`.
- Resposta no formato de `GetDisplayFeedResponse` (`screen` + `slides`).
- Atualiza `lastSeenAt`.
- `Cache-Control: public, s-maxage=60, stale-while-revalidate=120`. Segura carga
  na função e na API do YouTube; em troca `lastSeenAt` sobe no máximo ~1×/min
  por região, suficiente para o status online.

### `POST /api/public/vitrine/plays`

Corpo: `{ orientation, plays: [{ playId, announcementId, campaignId, durationSeconds }] }`.

- Acha a vitrine como no feed; sem vitrine → `404` com o mesmo corpo.
- Mais de 10 plays no lote → `400`.
- User-agent de robô (`lib/bot-detect.ts`) → `202` sem gravar nada.
- Play só entra se a peça está no ar na vitrine agora: `campaignId` de campanha
  ativa hoje que contém a peça, ou `campaignId` nulo e peça na playlist ativa da
  vitrine. O resto conta em `discarded`.
- Gravação reusa `buildPlayRows` e o `ON CONFLICT (device_id, client_play_id) DO
  NOTHING` de `/telemetry/plays`. Resposta igual à dele
  (`accepted` / `duplicates` / `discarded`).
- Rate limit por IP no Vercel Firewall para esse path (ex.: 30 req/min):
  configuração da plataforma, documentada no PR, não é código.

As duas rotas entram na spec OpenAPI; `api-zod` e `api-client-react` são
regerados como as demais. `/api/public/pieces` fica como está.

**Risco aceito:** rota pública que grava play pode ser abusada por script. As
defesas (peça precisa estar no ar, dedupe por `playId`, lote pequeno, robô
ignorado, rate limit por IP, play só com a TV visível) tornam o abuso caro, não
impossível.

## 3. Player e landing

### `PlayerStage` (`components/player-stage.tsx`)

Miolo extraído de `pages/display.tsx`, sem mudar regra: rodízio por duração,
vídeo natural avançando no fim, vídeo com corte guardando posição, cursor de
playlist, fallback do YouTube para o pôster, legenda, QR "SAIBA +", barra de
progresso.

Props: `slides`, `orientation` (`landscape | portrait`, orientação do palco,
sem giro), `muted?`, `paused?`, `onPlay(slide)`.

Medidas passam de `vh` para `cqmin`, com `container-type: size` no palco. Na TV
em tela cheia o palco é a tela (ou a tela girada), então `cqmin` é o lado curto,
o mesmo tamanho de hoje; na landing escala com a moldura.

`pages/display.tsx` vira casca: busca o feed pela key, tela cheia, cursor
escondido, giro com `stageStyle`, `onPlay` → `/telemetry/play` como hoje.
`public/tv.html` (ES5 das TVs Android) não muda.

### `TvMockup`

- O botão Horizontal/Vertical escolhe a vitrine: `useVitrineFeed(orientation)`
  (react-query, refetch a cada 60 s).
- A moldura CSS atual continua; dentro dela, o `PlayerStage` com `muted`.
- Badge de tipo acompanha o slide atual: Imagem ou Vídeo ("Encarte" sai: o feed
  não traz a origem e painéis ficaram de fora).
- `paused` quando a aba está escondida (`visibilitychange`) ou a TV está fora da
  tela (IntersectionObserver): não avança nem conta play.
- YouTube só monta depois que a TV entra na tela pela primeira vez.
- Plays vão para uma fila; envio em lote para `/api/public/vitrine/plays` a cada
  ~15 s e no `pagehide` (`navigator.sendBeacon`). `playId` =
  `crypto.randomUUID()`. Falha de envio mantém a fila para o próximo ciclo.
- Feed com erro, 404 ou lista vazia → mockup CSS atual com o slide de exemplo.

## 4. Testes

TDD com vitest, nos padrões existentes.

- **API lib:** modo vitrine ignora alvo `devices`/`segments` e concorrência,
  respeita período e dia da semana, pula painéis, mantém playlist.
- **API rotas:** feed (200, 404 sem vitrine, 400 orientação inválida, header de
  cache, `lastSeenAt`); plays (aceita peça no ar, descarta fora do ar e
  `campaignId` trocado, dedupe por `playId`, lote > 10 → 400, robô → 202 sem
  gravar); `PATCH /devices/:id` com `showcase` (liga, 409 com segunda vitrine na
  mesma orientação de tela, desliga, mudar orientação para uma já ocupada → 409).
- **Web:** `PlayerStage` (avança por duração, `onPlay` uma vez por exibição,
  `paused` segura rodízio e play, `muted` força mudo); testes atuais de
  `display.tsx` e `tv-html.test.ts` seguem verdes; `TvMockup` (feed → player,
  404 → exemplo, troca de orientação troca a vitrine, fila envia em lote).

## 5. Entrega

Branch `feat/vitrine-landing`, um PR
`feat(landing): TV da landing espelha a TV vitrine da Smart Vale` (minor).
Ordem: migration + flag + admin; feed vitrine + rotas públicas; extração do
`PlayerStage` com testes verdes; landing e apresentação no player.

Depois do merge, manual: cadastrar Smart Vale TV e as duas TVs, ligar "Vitrine"
em cada, criar a regra de rate limit no Vercel Firewall. Até lá a landing mostra
o mockup de exemplo; o deploy não quebra nada.
