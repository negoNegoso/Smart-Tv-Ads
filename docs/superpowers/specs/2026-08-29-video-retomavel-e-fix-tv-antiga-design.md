# Vídeo retomável (capped) + correção de travamento no tv.html

Data: 2026-08-29

## Problema

Peças de vídeo longas prendem a tela. Hoje o player tem dois modos por peça:

- **`natural`**: o vídeo toca até o fim — vídeos longos monopolizam a tela e
  reduzem o tempo de tela dos outros anúncios.
- **`capped`**: um cronômetro corta a peça em `duration` segundos e avança; mas,
  ao voltar, o vídeo **reinicia do zero** (o player do YouTube é recriado a cada
  troca de slide), então o vídeo longo nunca é assistido por inteiro.

Além disso, nas TVs antigas (`tv.html`) o vídeo **não toca e o slide trava**: não
aparece o fallback de imagem, não há erro e não há tela preta — a rotação
congela.

## Objetivo

1. Transformar o modo `capped` em um comportamento **retomável**: corta em
   `duration` segundos, cede a tela para os próximos anúncios e, ao voltar,
   **retoma o vídeo de onde parou**, até o vídeo completar ao longo de várias
   rodadas.
2. Corrigir o travamento de vídeo nas TVs antigas (`tv.html`), garantindo que a
   rotação nunca congele por causa da API do YouTube.

## Decisões de design

| Tema | Decisão |
| --- | --- |
| Contagem de play | 1 play quando o vídeo **completa por inteiro** (somando os pedaços). Cortes intermediários não contam. |
| Tempo de corte | Por peça, reutilizando o campo `duration` já existente. |
| Como expor | **Modificar** o modo `capped` atual (não criar um 3º modo). |
| Playlists | Retomar o vídeo atual de onde parou; só avançar o cursor da playlist quando o vídeo atual completa. |
| Escopo de mídia | Vale para vídeos do YouTube (`youtube_video` e `youtube_playlist`). Imagens e fallback seguem como hoje. |

## Arquitetura

A lógica existe em **dois players** independentes que precisam do mesmo
comportamento:

- `artifacts/signage/src/pages/display.tsx` + `components/youtube-slide.tsx` —
  player React (rota `/display/:deviceKey`).
- `artifacts/signage/public/tv.html` — player Smart TV em JS puro (ES5).

Sem mudança de schema nem de API. Tudo acontece no player. O campo `duration` já
existe e passa a significar "tempo de corte por rodada".

### Estado novo: mapa de posições

Um mapa em memória `posição[chave] → segundos`, com
`chave = announcementId + '-' + videoId`. No React vive num `useRef`; no
`tv.html` vive num objeto global (`videoPositions`).

## Parte 1 — Modo `capped` retomável (vídeo YouTube)

Ao entrar na peça de vídeo em modo `capped`:

1. Cria o player. Se há posição salva para esse vídeo, faz `seekTo(posiçãoSalva)`
   quando o player fica pronto.
2. Roda o cronômetro de corte de `duration` segundos.

O "pedaço" termina de dois jeitos:

- **Corte atingido (cronômetro):** salva `getCurrentTime()` em `posição[chave]`,
  avança para o próximo slide. **Não** conta play, **não** avança o cursor da
  playlist, **não** zera a posição.
- **Vídeo termina de verdade (`ENDED`, mesmo em `capped`):** conta **1 play**,
  zera `posição[chave]`, avança o cursor da playlist (se for playlist) e passa
  para o próximo slide.

Casos de borda:

- Vídeo termina exatamente no corte: quem disparar primeiro trata; `ENDED`
  garante a contagem de completude.
- Vídeo mais longo que uma volta inteira da playlist de slides: apenas retoma ao
  longo de várias voltas até completar. É o comportamento desejado.

## Parte 2 — Contagem de exibição (play)

A regra "1 play só quando completa" vale **apenas para vídeos** em `capped`:

- **Vídeo capped:** conta play só no `ENDED`. Cortes intermediários não contam.
- **Imagem capped:** inalterado — 1 play a cada exibição, ao atingir `duration`.
- **Fallback** (vídeo que não carrega e vira thumbnail): tratado como imagem —
  1 play ao atingir o corte.
- **Modo `natural`:** inalterado — 1 play no `ENDED`.

## Parte 3 — Playlists do YouTube

- Enquanto o vídeo atual não termina, cada corte **retoma o mesmo vídeo** de onde
  parou.
- O cursor da playlist (`playlistCursor`) só avança quando o vídeo atual completa
  (`ENDED`).
- Resultado: a playlist toca vídeo a vídeo, cada um por inteiro, fatiado em
  várias rodadas, cedendo a tela aos outros anúncios entre os pedaços.

## Parte 4 — Detalhes técnicos por player

### `youtube-slide.tsx`

- Novo prop `initialPosition` (segundos): faz `seekTo(initialPosition)` no
  `onReady` quando `> 0`.
- Dispara `onEnded` também no modo `capped` (hoje só dispara em `natural`). O pai
  decide o que fazer com base no modo.
- Reporta a posição atual periodicamente (poll ~250ms via `getCurrentTime()`)
  para um `ref` do pai, para o corte saber onde salvar. Necessário porque, após
  `destroy()`, não dá para ler a posição.

### `display.tsx`

- `useRef` com o mapa de posições.
- No efeito de auto-advance (modo `capped`), ao atingir o corte: lê a posição
  reportada, salva no mapa e avança **sem** contar play nem avançar cursor.
- No `onEnded` (vindo do componente em `capped`): conta play, zera a posição,
  avança cursor de playlist e avança o slide.
- Passa `initialPosition` para `YouTubeSlide` a partir do mapa.

### `tv.html`

- Objeto global `videoPositions`.
- No `onReady`, se há posição salva, `seekTo`.
- No corte (`runTimer` ao atingir `durationMs`): se for vídeo tocando, lê
  `ytPlayer.getCurrentTime()`, salva em `videoPositions` e avança **sem** contar
  play; se for imagem/fallback, mantém o comportamento atual (conta play no
  corte).
- No `ENDED` (passa a tratar `capped` também): conta play, zera a posição,
  avança o cursor da playlist e avança o slide.

## Parte 5 — Correção do travamento de vídeo no `tv.html`

Causa: `loadYtApi(cb)` só chama `cb` quando o script
`https://www.youtube.com/iframe_api` carrega (via `onYouTubeIframeAPIReady`). O
timeout de 5s que aciona o fallback fica **dentro** de `cb`, ou seja, só é armado
depois que a API carrega. Nas TVs antigas, se esse script não carrega/executa,
`cb` nunca roda, o timeout nunca é armado, nada dá erro e o slide **fica preso
para sempre** sem fallback. O ramo "já está carregando" (`ytApiLoading`) faz
`setInterval` de polling **sem timeout** — trava do mesmo jeito.

Correção:

1. Armar um timeout **no próprio `loadYtApi`** (5–8s). Se a API não ficar pronta
   nesse tempo, chamar um callback de falha → cair no fallback de imagem e
   **manter a rotação girando**.
2. Guardar o ramo de polling (`ytApiLoading`) com o mesmo limite de tempo.
3. Marcar a API como indisponível após falhar uma vez, para os próximos vídeos
   irem direto ao fallback sem esperar o timeout de novo.

Efeito: em TV que não suporta o player do YouTube, os anúncios de vídeo viram
thumbnail e a playlist **continua rodando** em vez de congelar. Onde o player
funciona, nada muda.

## Fora de escopo (YAGNI)

- Persistir posição no servidor ou sincronizar entre TVs.
- Retomar após recarregar a página (a posição vive em memória; o refresh de
  slides a cada 60s preserva o estado, mas um reload do navegador zera —
  aceitável).
- Novo campo de configuração ou mudança de schema/API.

## Validação

- `pnpm --filter @workspace/signage run typecheck`
- `pnpm --filter @workspace/signage run build`
- Verificação manual: peça de vídeo longo em `capped` cede a tela no corte e
  retoma de onde parou na volta; conta 1 play só ao completar.
- Verificação manual em TV antiga / navegador sem a API do YouTube: o slide de
  vídeo cai no fallback de imagem e a rotação não congela.
