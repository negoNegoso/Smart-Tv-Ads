# Faixa de recados na TV — design

Data: 2026-10-08
Branch: `feat/faixa-de-recados`

## Objetivo

Dar a cada TV uma faixa de texto correndo no rodapé com recados curtos da
loja ("Pão quentinho às 17h", "Siga @padaria"), sem precisar montar arte.
A faixa fica sempre na tela, enquanto os anúncios giram acima dela.

Quinto e último sub-projeto de programação (faixas de horário ✓ →
frequência por volta ✓ → aviso urgente ✓ → clima e hora ✓ → zonas na tela).

## Regras decididas

1. **Só faixa de texto correndo** (sem relógio, sem outras zonas).
2. **Só o admin escreve**, por TV, na página da TV.
3. **Até 5 recados, até 80 caracteres cada**; juntados com " · " e rolando em
   loop.
4. **A faixa reserva espaço**: a área da arte encolhe para cima da faixa;
   nenhum anúncio pago fica coberto. Legenda, QR e barra de progresso sobem
   junto.
5. **Sem faixa** quando a TV não tem recados, quando é a vitrine, ou quando há
   **aviso urgente** no ar (o aviso toma a tela inteira).
6. **A TV não precisa de atualização de app**: `tv.html` antigo ignora o campo
   novo do feed e passa a mostrar a faixa no recarregamento diário (4h) do app
   Android.

## Dados e API

- `devices.ticker_messages text[] NOT NULL DEFAULT '{}'`
  (`lib/db/src/schema/devices.ts`). Migração gerada com
  `pnpm --filter @workspace/db run generate`; esperado só o `ADD COLUMN`.
- `artifacts/api-server/src/lib/ticker.ts` (puro):
  - `export const MAX_TICKER_MESSAGES = 5`, `export const MAX_TICKER_LENGTH = 80`;
  - `normalizeTickerMessages(input: unknown): { ok: true; messages: string[] } | { ok: false; error: string }`
    — exige array de strings; tira espaços das pontas; descarta vazios;
    mais de 5 → erro "Até 5 recados."; recado com mais de 80 caracteres →
    erro "Cada recado tem até 80 caracteres.";
  - `tickerText(messages: string[]): string | null` — junta com `" · "`;
    lista vazia → `null`.
- `PATCH /devices/:id` (`routes/devices.ts`): aceita `tickerMessages`; quando
  presente, passa por `normalizeTickerMessages` (erro → 400 com a mensagem) e
  grava a lista normalizada. `GET /devices/:id` (e a resposta do PATCH)
  devolve `tickerMessages`.
- `lib/api-spec/openapi.yaml`:
  - `Device.tickerMessages: string[]` (opcional);
  - `DeviceUpdate.tickerMessages: string[]` (`maxItems: 5`, itens
    `maxLength: 80`; a validação de verdade é a do servidor);
  - `DisplayFeed.ticker: { text: string } | null` (opcional, como `music`).
  Regenerar com `pnpm --filter @workspace/api-spec run codegen`.

## Feed (`artifacts/api-server/src/routes/display.ts`)

- `loadForTv` passa a selecionar `tickerMessages` do device.
- Em `/display/:key/feed`, `ticker`:
  - `null` se `device.showcase`;
  - `null` se a lista de slides é o aviso urgente (primeiro slide com
    `source === "alert"` — decidido antes de tirar o `source` dos slides);
  - senão `tickerText(messages)` em `{ text }`, ou `null` sem recados.
- `/display/:key/slides` (endpoint antigo) não muda.

## TV (`artifacts/signage/public/tv.html`, ES5)

- Elemento novo dentro de `#stage`, depois do `#qr-box`:
  `<div id="ticker"><div id="ticker-text"></div></div>`.
- CSS:
  - `#ticker`: `position:absolute; left:0; right:0; bottom:0; height:8vh;
    background:#111; color:#fff; overflow:hidden; white-space:nowrap;
    display:none; z-index:4;` texto 4.5vh, `line-height: 8vh`.
  - `#stage.com-faixa #ticker { display:block; }`
  - `#stage.com-faixa #slot-a, #stage.com-faixa #slot-b, #stage.com-faixa #yt-slot { bottom: 8vh; }`
  - `#stage.com-faixa #overlay, #stage.com-faixa #qr-box { bottom: 11vh; }`
  - `#stage.com-faixa #progress-track { bottom: 8vh; }`
  - `#ticker-text`: `display:inline-block; padding-left:100%;` com
    `@keyframes ticker-correr { from { transform: translateX(0) } to { transform: translateX(-100%) } }`
    (e `@-webkit-keyframes` + `-webkit-transform`), `animation: ticker-correr
    linear infinite`, duração definida por JS.
  - Sem suporte a animação (TV muito antiga): o texto fica parado,
    `text-overflow: ellipsis`.
- JS:
  - `aplicarFaixa(ticker)` chamado em cada resposta do feed (primeira carga e
    refresh), ao lado de onde a música é aplicada.
  - `ticker` com `text` não vazio: põe `com-faixa` no `#stage`; se o texto
    mudou, troca o `textContent` e define a duração da animação
    `max(12, ceil(text.length * 0.25))` segundos (velocidade ~constante), e
    reinicia a animação; se o texto é o mesmo, não mexe.
  - `ticker` `null`/ausente: tira `com-faixa` e limpa o texto.
  - Feed sem o campo (servidor antigo): mesmo que `null`.

## Player web (`artifacts/signage/src/pages/display.tsx` + componentes)

- Componente `TickerBar` (`components/ticker-bar.tsx`) com a mesma faixa
  (8% de altura, fundo `#111`, texto branco rolando por CSS com a mesma
  regra de duração).
- `display.tsx` lê `feed.ticker` e, com texto, renderiza `TickerBar` e passa
  ao `PlayerStage` um recuo inferior de 8% para a arte, legenda e QR
  (prop `bottomInset`, `"8vh"`), espelhando o `com-faixa` do `tv.html`.

## Admin (`artifacts/signage/src/pages/device-detail.tsx`)

- Componente `DeviceTickerField` (`components/device-ticker-field.tsx`),
  logo abaixo do campo de música:
  - título "Faixa de recados"; até 5 `Input` (maxLength 80, contador
    `n/80`), botão "+ recado" (some com 5) e "Remover recado" por linha;
  - ajuda: "Os recados correm no rodapé da TV, juntos, em loop. O anúncio
    encolhe um pouco para não ficar coberto.";
  - "Salvar" manda `PATCH { tickerMessages }` (lista sem vazios); sucesso →
    toast "Faixa salva." e invalida a TV e a prévia; erro → toast com a
    mensagem do servidor, mantendo o digitado.

## Testes (TDD)

API:

- `ticker.test.ts`: `tickerText` junta com " · " e dá `null` sem recados;
  `normalizeTickerMessages` tira espaços, descarta vazios, recusa 6 recados,
  recado de 81 caracteres e entrada que não é array de strings.
- `device-update.test.ts`: PATCH grava a lista normalizada e devolve
  `tickerMessages`; 400 com a mensagem para 6 recados e para recado longo.
- `display-slides.test.ts`: feed traz `ticker.text` com recados; `null` sem
  recados, na vitrine e com aviso urgente ativo.

Web:

- `tv-html.test.ts`: com `ticker`, `#ticker-text` tem o texto e `#stage` tem
  `com-faixa`; sem `ticker`, nem um nem outro; refresh com o mesmo texto não
  reinicia (a duração/elemento não é reescrito); texto novo troca; `ticker`
  `null` no refresh tira a faixa; feed sem o campo não quebra.
- `ticker-bar.test.tsx` / `display.test.tsx`: faixa aparece com o texto e o
  palco recebe o recuo.
- `device-ticker-field.test.tsx`: adiciona e remove recado; "+ recado" some
  no quinto; salvar manda a lista sem vazios; erro do servidor vira toast e
  mantém o texto.

## Fora do escopo

- Lojista editar pelo portal; recados da rede inteira; relógio na faixa;
  agendar recado por horário; cor/velocidade configuráveis.

## PR

Título: `feat(tv): faixa de recados no rodapé da TV` (minor).
