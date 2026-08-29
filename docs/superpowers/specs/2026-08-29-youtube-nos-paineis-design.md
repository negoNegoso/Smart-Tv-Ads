# Vídeos e playlists do YouTube nos painéis — Design

## Objetivo

Permitir intercalar **vídeos** e **playlists** do YouTube na exibição dos
painéis, quando o cliente quiser, em dois modos que compartilham o mesmo núcleo
de reprodução:

1. **Modo anunciante (campanha):** a peça de YouTube entra em campanhas e na
   rotação junto com as imagens, atribuída a um anunciante.
2. **Modo dispositivo/cliente (playlist do dispositivo):** a peça de YouTube é
   adicionada à playlist de um dispositivo, intercalada com as demais peças.

Como os dois modos já reusam a tabela `announcements` (tanto
`campaign_announcements` quanto `device_playlist` apontam para a mesma peça),
tornar uma peça "de YouTube" faz os dois modos funcionarem automaticamente.

## Decisões de produto (definidas no brainstorming)

- **Onde entra:** ambos os modos (anunciante e dispositivo).
- **Duração do vídeo:** configurável por peça — `natural` (toca até o fim) ou
  `capped` (limite de N segundos, reusando o campo `duration`).
- **Playlist:** intercala **1 vídeo por ciclo**, avançando para o próximo na
  volta seguinte (cursor em memória no cliente).
- **Dispositivos:** mistos (modernos e antigos) com **fallback automático**
  quando o dispositivo não conseguir tocar YouTube embutido.
- **Áudio:** configurável por peça — `muted` (padrão) ou `sound` ("tenta com
  som; se o autoplay com som for bloqueado, segue mudo").
- **Recursos mantidos nas peças de vídeo:** exibições (plays), QR code
  (scanCode → `/r/CODE`) e legenda (`displayText`) sobrepostos ao vídeo.
- **Criar peça de vídeo:** basta colar o link. O poster/fallback é derivado
  automaticamente da thumbnail do YouTube; imagem de fallback custom é opcional.

## Abordagem de núcleo

**IFrame Player API do YouTube nos dois players + resolução de playlist no
servidor.** O servidor resolve a URL da playlist numa lista ordenada de
`videoId`s (com cache), e o cliente intercala 1 por ciclo. Requer
`YOUTUBE_API_KEY` **apenas** para playlists; vídeo único não precisa de key.

Alternativas descartadas: resolver a playlist no cliente (interleave frágil, sem
IDs para pré-carregar/fallback) e rehospedar o vídeo (fora de escopo e contra os
Termos do YouTube).

## Seção 1 — Modelo de dados

Novas colunas em `announcements` (`lib/db/src/schema/announcements.ts`):

| Coluna | Tipo | Default | Uso |
| --- | --- | --- | --- |
| `mediaKind` | text | `'image'` | `'image'` \| `'youtube_video'` \| `'youtube_playlist'` |
| `youtubeId` | text (nulo) | `null` | ID do vídeo ou da playlist |
| `playbackMode` | text | `'capped'` | `'natural'` \| `'capped'` (só vídeo) |
| `audioMode` | text | `'muted'` | `'muted'` \| `'sound'` (só vídeo) |

- `imageUrl` passa a ser **opcional** (nullable). Para peças de YouTube funciona
  como poster/fallback custom **opcional**; quando ausente, o poster é derivado
  de `https://img.youtube.com/vi/<youtubeId>/hqdefault.jpg`.
- Peças existentes permanecem `mediaKind='image'` com `imageUrl` preenchido —
  nada muda para elas.

Não mudam: `campaign_announcements` (scanCode/destinationUrl/QR), `plays`,
`device_playlist`, `campaign_devices`, `scans`.

## Seção 2 — API e resolução de playlist

**Endpoint de slides** (`artifacts/api-server/src/routes/display.ts`,
`GET /display/:key/slides`): a resposta de cada slide ganha `mediaKind`,
`youtubeId`, `playbackMode`, `audioMode`. Para `youtube_playlist`, inclui também
`videoIds: string[]` já resolvidos. O dedupe por `announcementId` e a ordenação
atuais são preservados; só há enriquecimento dos campos de vídeo.

**Serviço de resolução de playlist** (novo,
`artifacts/api-server/src/lib/youtube/`):

- Recebe o ID da playlist → YouTube Data API (`playlistItems`) → `videoId[]`.
- **Cache** em memória com TTL (~30 min) para não estourar cota nem atrasar o
  display.
- `YOUTUBE_API_KEY` é uma env **opcional**. Sem ela: vídeo único funciona
  normalmente; playlist degrada (usa a thumbnail/fallback da peça ou pula) e o
  admin avisa que a key é necessária para playlists.

**Parser de link** (compartilhado, `lib/youtube/`): aceita `youtube.com/watch?v=`,
`youtu.be/`, `youtube.com/playlist?list=`, `&list=`; extrai `videoId` /
`playlistId`. Usado na validação do admin ao salvar a peça.

## Seção 3 — Player React (`/display`, dispositivos modernos)

`artifacts/signage/src/pages/display.tsx` + novo componente `YouTubeSlide`:

- Carrega a IFrame Player API sob demanda (script injetado uma vez); usa
  `YT.Player`.
- Parâmetros: `autoplay=1`, `mute=1`, `controls=0`, `playsinline=1`,
  `modestbranding`, `rel=0`. Se `audioMode='sound'`: após o play tenta
  `unMute()`; se bloqueado, segue mudo.
- **Duração:** `natural` → avança no evento `onStateChange === ENDED`; `capped`
  → timer atual (`duration` seg) + `stopVideo()`.
- **Playlist (1 por ciclo):** cursor em memória por `announcementId`; toca
  `videoIds[cursor]` e incrementa (volta ao 0 no fim).
- **Capacidade/fallback:** timeout de init (~4s) + `onError` → renderiza o
  poster/thumbnail como slide de imagem normal (com QR/legenda) e conta
  exibição.
- **QR + legenda:** sobrepostos ao iframe com os componentes/estilos atuais
  (`SlideCaption`, box do QR).
- **Telemetria:** registra `play` ao terminar (natural) ou ao atingir o limite
  (capped), reusando `POST /api/telemetry/play`.

## Seção 4 — Player `tv.html` (Smart TVs, ES5)

`artifacts/signage/public/tv.html`, mantendo o estilo ES5/compatível:

- Em slide `mediaKind !== 'image'`, cria um `<iframe>`
  (`youtube.com/embed/<id>?enablejsapi=1&autoplay=1&mute=1&controls=0&playsinline=1`)
  num slot dedicado sobre os slots de imagem. Carrega a IFrame API uma vez e usa
  `YT.Player` com os mesmos eventos (`ENDED`, `onError`).
- **Detecção de capacidade (essencial p/ TVs antigas):** timeout de init (~5s)
  sem `onReady`/`PLAYING`, ou `onError` → **fallback**: destrói o iframe, mostra
  a thumbnail nos slots de imagem existentes e segue o timer normal. A TV antiga
  nunca fica presa em tela preta.
- **Playlist:** mesmo cursor em memória (variável ES5) avançando 1 por ciclo.
- QR/legenda/`progress`/telemetria reusam o código atual (`recordImpression` já
  existe).
- `audioMode='sound'`: tenta `unMute()` após o play; em TV que bloqueia, segue
  mudo.
- `tv.html` é espelho manual do React — manter o pareamento/comentário já
  existente no arquivo.

## Seção 5 — Admin (UI)

Formulário de peça (`artifacts/signage/src/pages/admin.tsx`, dialog de
upload/edição):

- Seletor de **tipo de mídia**: `Imagem` (atual) | `Vídeo do YouTube` |
  `Playlist do YouTube`.
- Ao escolher YouTube: some o upload de arquivo obrigatório; aparece **Link do
  YouTube** (obrigatório, validado pelo parser da Seção 2), **duração**
  (`natural`/`capado`), **áudio** (`mudo`/`com som`) e **imagem de fallback**
  opcional.
- `displayText`/`showText` (legenda) e o toggle `isActive` continuam iguais.
- Card da peça: badge de tipo (ex.: "▶ YouTube") usando a thumbnail como
  preview.
- Envio: para YouTube, JSON/URL (não `FormData` de arquivo); o endpoint de
  criação/edição aceita os dois modos.
- Telas de **campanha** (combobox inline) e **playlist do dispositivo**: a peça
  de YouTube aparece como qualquer outra — reuso total, nada novo.
- Contrato OpenAPI (`lib/api-spec`) + zod (`lib/api-zod`) + cliente React gerado
  atualizados com os novos campos.

## Seção 6 — Testes, validação e riscos

**Testes** (`pnpm --filter @workspace/api-server run test`):

- Parser de URL (watch, youtu.be, playlist, `&list=`, inválidos).
- Resolução de playlist: cache hit/miss, TTL, ausência de `YOUTUBE_API_KEY`
  (degrada sem quebrar).
- Endpoint de slides: enriquecimento dos campos de vídeo + dedupe/ordem
  preservados.

**Validação:** `pnpm run typecheck` e `pnpm run build` (inclui codegen do
contrato). Se o schema mudar: `cd lib/db && npx tsc --build && npx drizzle-kit
push`.

**Migração:** colunas novas com defaults (`mediaKind='image'`) → peças
existentes intactas.

**Riscos/decisões:**

- Autoplay exige `mute=1`; som é "tenta, senão mudo".
- Vídeos com embed desabilitado pelo dono → `onError` → fallback/thumbnail.
- TVs antigas → detecção por timeout + fallback (Seção 4).
- Cota da YouTube Data API → mitigada por cache.

**Fora de escopo (YAGNI):** rehospedar vídeo, analytics de "quanto do vídeo foi
assistido", suporte a Vimeo/outros provedores.

## Nova variável de ambiente

| Variável | Uso |
| --- | --- |
| `YOUTUBE_API_KEY` | Opcional. Necessária apenas para resolver **playlists** do YouTube (YouTube Data API). Sem ela, vídeos únicos funcionam e playlists degradam para o fallback. |
