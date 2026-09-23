# Peças verticais e TVs em modo retrato — design

Data: 2026-09-22
Branch: `feat/pecas-verticais`

## Objetivo

Subir peças verticais (imagens e YouTube Shorts) para TVs instaladas em pé, e
ver um preview da peça, no formato certo, já no momento de criá-la na
biblioteca de mídia.

## Premissas

- A TV retrato é uma TV comum (paisagem) girada 90° na parede. A TV box e o app
  Android continuam entregando imagem deitada; quem gira o conteúdo é o player
  (`tv.html` / `display.tsx`). O app Android não muda (a trava `landscape` do
  manifest fica).
- O sentido do giro depende de como o instalador pendurou a TV, então é
  configurado por TV: girada para a direita ou para a esquerda.
- A TV só toca peças da orientação dela. Peça horizontal nunca aparece em TV
  retrato e vice-versa (sem barras pretas, sem fallback).

## Fora do escopo

- Versão vertical dos painéis do lojista (cardápio, promoção, aviso). Eles
  continuam 16:9 e, pelo filtro, não aparecem em TVs retrato.
- Varredura retroativa de peças antigas: todas ficam horizontais; se alguma for
  vertical, corrige-se na edição.
- Mudanças no app Android.

## 1. Dados

Migration drizzle (`pnpm --filter @workspace/db generate` + `migrate.mjs`):

| Tabela | Coluna | Valores | Default |
|---|---|---|---|
| `announcements` | `orientation text not null` | `landscape` \| `portrait` | `landscape` |
| `devices` | `orientation text not null` | `landscape` \| `portrait_right` \| `portrait_left` | `landscape` |

O default mantém o servidor da versão anterior funcionando durante o deploy e
deixa todo o conteúdo e todas as TVs atuais como estão.

Constantes em `lib/db`, no padrão de `PANEL_KINDS`:
`ANNOUNCEMENT_ORIENTATIONS`, `DEVICE_ORIENTATIONS`. Helper
`screenOrientationOf(deviceOrientation)`: `portrait_*` → `portrait`, resto →
`landscape`. É o valor comparado com a orientação da peça.

Peças geradas por painel nascem `landscape` pelo default, sem mudar o código de
painéis.

## 2. Detecção da orientação da peça

Acontece no formulário do admin, antes de salvar, porque o preview precisa dela.

- **Imagem:** o arquivo escolhido é carregado num `Image` local;
  `naturalHeight > naturalWidth` → `portrait`. Quadrada → `landscape`.
- **YouTube:** rota nova `GET /api/youtube/meta?url=` (autenticação de admin)
  devolve `{ kind, id, orientation }`.
  - Link `/shorts/` → `portrait`, sem consulta externa.
  - Link comum → consulta o oEmbed do YouTube no servidor e compara largura ×
    altura.
  - Playlist, erro ou timeout (3s) → `landscape`.
  - **Primeiro passo da implementação:** verificar se o oEmbed devolve
    proporção vertical para Shorts acessados por `watch?v=`. Se não devolver,
    a rota fica só com a regra do link e o seletor manual corrige o resto.
- O formulário sempre envia `orientation` explícito no POST/PATCH. O servidor
  valida contra o enum (400 se inválido) e usa `landscape` quando o campo vem
  ausente (cliente antigo).

O operador pode sempre sobrescrever o valor detectado no seletor
Horizontal/Vertical.

## 3. API e feed da TV

### Filtro

`artifacts/api-server/src/lib/device-feed.ts`:

- `FeedDevice` ganha `orientation`.
- As queries de playlist e de campanha selecionam `announcementsTable.orientation`;
  a de painéis também (sempre `landscape`).
- Depois de `composeDeviceSlides`, a função pura
  `filterByOrientation(slides, screenOrientationOf(device.orientation))` remove
  o que não bate.
- `orientation` é removida do slide antes da resposta (o player não precisa
  dela: com o filtro, toda peça tem a orientação da tela).

Como `loadDeviceSlides` é a fonte única da TV e da prévia do admin
(`/devices/:id/preview`), as duas continuam iguais.

### Endpoint novo `GET /api/display/:deviceKey/feed`

```json
{
  "screen": { "orientation": "portrait_right" },
  "slides": [ /* DeviceSlide[], já filtrados */ ]
}
```

- Mesmo efeito colateral do `/slides` (`lastSeenAt`); a busca do device e a
  atualização saem para uma função compartilhada pelas duas rotas.
- `GET /api/display/:deviceKey/slides` continua existindo e devolvendo o array,
  agora filtrado. Uma TV com `tv.html` antigo em cache para de receber peça
  errada; só não gira até recarregar.

### Admin

- `PATCH /devices/:id` aceita `orientation` (enum, 400 se inválido). O schema
  `Device` da resposta ganha o campo.
- `POST /announcements` e `PATCH /announcements/:id` aceitam `orientation`.
  O schema `Announcement` ganha o campo.
- `POST /devices/:id/playlist/add` responde **400** quando a peça tem
  orientação diferente da TV: "Peça vertical não toca em TV horizontal" (e o
  inverso).
- Campanhas não bloqueiam: vão para várias TVs e cada TV toca o que servir.

### Contrato

`lib/api-spec/openapi.yaml`: campo `orientation` em `Announcement` e `Device`,
schema `DisplayFeed`, operação `getDisplayFeed`, operação `getYouTubeMeta`.
Regenerar `api-zod` e `api-client-react` com orval.

## 4. Renderizadores (`public/tv.html` em ES5 e `pages/display.tsx`)

### Palco girado

Todo o conteúdo — slide, player do YouTube, legenda, QR, barra de progresso,
estado vazio — fica dentro de um `#stage`.

- `landscape`: `#stage` ocupa a tela, como hoje.
- `portrait_right`:

  ```css
  position: absolute; top: 50%; left: 50%;
  width: 100vh; height: 100vw;
  -webkit-transform: translate(-50%, -50%) rotate(90deg);
  transform: translate(-50%, -50%) rotate(90deg);
  ```

- `portrait_left`: igual, com `rotate(-90deg)`.

A classe `.is-portrait` no `#stage` troca as medidas internas que usam `vh`
(legenda, QR, rótulo "SAIBA +") para `vw`, que dentro do palco girado
correspondem à altura visível. Sem duplicar estilo por sentido de giro.

O iframe do YouTube gira junto; um Short 9:16 num palco 9:16 ocupa a tela.

### Encaixe

Continua `cover`. A peça sempre tem a orientação da tela; uma arte 4:5 numa
tela 9:16 perde um pouco das laterais, mesmo comportamento que o horizontal já
tem.

### Troca de orientação

A cada refresh (60s), se `screen.orientation` mudou, o player aplica a classe
nova e recomeça do primeiro slide.

### Fallback

`tv.html` chama `/feed`; se receber 404 (servidor antigo durante o deploy), cai
para `/slides` e fica sem rotação. `display.tsx` troca `useGetDeviceSlides`
pelo hook gerado de `getDisplayFeed`.

## 5. Telas do admin

### Componente `components/piece-preview.tsx`

Moldura de TV na proporção da orientação (16:9 deitada ou 9:16 em pé) com a
mídia em `cover` e a legenda por cima quando "mostrar texto" está ligado.
Reusado no formulário e na lista da biblioteca.

### Formulário de criar/editar peça (`pages/admin.tsx`)

- Dialog maior que os atuais `sm:max-w-[425px]`: preview ao lado do formulário
  no desktop, empilhado no mobile.
- Imagem: preview aparece ao escolher o arquivo (`URL.createObjectURL`,
  revogado ao trocar de arquivo ou fechar o dialog).
- YouTube: ao colar link válido (debounce ~500ms) chama `/youtube/meta`,
  mostra "detectando formato…", depois a thumbnail; clique toca o embed mudo.
- Seletor Horizontal/Vertical abaixo do preview, com o valor detectado
  marcado; trocar muda a moldura na hora.
- Edição usa o mesmo formulário, com a orientação salva pré-marcada.

### Lista da biblioteca

Badge "Vertical" nas peças retrato; thumbnail na proporção certa.

### Página da TV (`pages/device-detail.tsx`)

- Campo **Orientação**: Horizontal / Retrato, girada para a direita / Retrato,
  girada para a esquerda, com ícone indicando o sentido. Salva via `PATCH`.
- `device-preview` usa moldura em pé quando a TV é retrato. Vale também para
  a prévia do portal do cliente (`/client/devices/:id/preview`), que passa a
  receber `orientation` do device.
- O picker de adicionar à playlist lista só peças compatíveis.

## 6. Testes

Vitest, nos `__tests__` existentes.

- `filterByOrientation`: cada combinação de orientação de peça × TV.
- `screenOrientationOf`.
- Rota `/display/:key/feed`: formato, filtro, `lastSeenAt`, 404 de device.
- Rota `/display/:key/slides`: continua array, agora filtrado.
- `/youtube/meta`: `/shorts/` sem rede, oEmbed mockado vertical/horizontal,
  timeout → `landscape`.
- `playlist/add`: 400 em orientação diferente.
- Validação do enum em `PATCH /devices/:id` e `POST/PATCH /announcements`.
- `tv-html.test.ts` (jsdom): `portrait_right`/`portrait_left` aplicam classe e
  transform; troca de orientação no refresh; fallback 404 → `/slides`.
- `display.tsx`: classe de palco conforme o feed.
- `piece-preview` e formulário (RTL): moldura por orientação, toggle, detecção
  de imagem, estado "detectando formato…".

**Validação manual antes do merge:** abrir `tv.html` numa TV box real com a
TV em `portrait_right` e `portrait_left` (imagem vertical, Short, legenda, QR).
jsdom não renderiza transform, e WebView antigo é o maior risco da entrega.

## Riscos

- **oEmbed não distinguir Shorts:** mitigado pela regra do link e pelo seletor
  manual.
- **WebView antigo com `transform` + iframe:** validação manual obrigatória;
  prefixo `-webkit-` incluído.
- **TV retrato sem conteúdo:** se ninguém subir peça vertical, a TV fica no
  estado vazio. É esperado; a prévia do admin mostra isso antes.

## Versão

Título do PR: `feat(tv): peças verticais para TVs em modo retrato` → minor.
Nada quebra compatibilidade: `/slides` continua, colunas têm default.
