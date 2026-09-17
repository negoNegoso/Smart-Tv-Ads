# Visual novo do slide de promoção — design

Data: 2026-09-17
Branch: `feat/promo-visual`

## Objetivo

Trocar o visual do slide de promoção (hoje fundo azul-escuro, texto amarelo,
foto quadrada 640px) por um layout de varejo: painel colorido à esquerda com
corte diagonal, foto do produto ocupando o lado direito, selo "PROMOÇÃO" com
borda pontilhada e enfeites geométricos, preço em destaque. O lojista escolhe
a cor do painel e se a promoção é mostrada como preço (DE/POR) ou porcentagem.

Menu (tabela de preços) e aviso não mudam.

## Decisões

| Tema | Decisão |
|------|---------|
| Cor | Livre, escolhida pelo lojista (color picker). Padrão `#D63A6A`. |
| Estilo | Lojista escolhe `price` ou `percent`. Padrão `price`. |
| Porcentagem | Calculada de `oldPriceCents` e `priceCents`; nada novo a digitar. |
| Fonte | Fredoka (OFL), Regular + Bold, só no slide de promoção. |
| Técnica | Fundo (diagonal + enfeites + selo) desenhado como SVG gerado em código e embutido como `data:` URI. |

Alternativas descartadas: `clip-path` do satori (suporte frágil, e `border-style: dotted`
não existe no satori — enfeites precisariam de SVG de qualquer jeito); `skew`/`rotate`
de div (bordas serrilhadas, overflow difícil de calcular).

## 1. Dados

### Banco (`lib/db/src/schema/panels.ts`)

Duas colunas novas, ambas anuláveis:

- `accent_color text` — hex `#RRGGBB`. `null` → `#D63A6A`.
- `promo_style text` — `"price" | "percent"`. `null` → `"price"`.

Constante exportada `PROMO_STYLES = ["price", "percent"] as const`, no mesmo
padrão de `PANEL_KINDS`. Migração gerada pelo drizzle-kit (`0009_*`).

Os campos são guardados para qualquer `kind`, mas só o template de promoção os lê.

### API

- `lib/api-spec/openapi.yaml`: `Panel` e `UpdatePanelRequest` ganham
  `accentColor` (string, `pattern: ^#[0-9A-Fa-f]{6}$`, nullable) e
  `promoStyle` (enum `price | percent`, nullable).
- Regenera `lib/api-zod`.
- `artifacts/api-server/src/routes/panels.ts` lê/grava os dois campos.
  Hex fora do padrão → 400 pelo `patchBody` (zod) da rota.
- `RenderPanel` (`templates.ts`) ganha `accentColor: string | null` e
  `promoStyle: "price" | "percent" | null`; `publish.ts` repassa.

### Regra da porcentagem

`percent = Math.round((oldPriceCents - priceCents) / oldPriceCents * 100)`.

Estilo `percent` só vale com `oldPriceCents > priceCents > 0`. Sem isso, o
template cai para o estilo `price` sem lançar (mesma filosofia de "sem foto"
em `promo-image.ts`: publicação segue). O editor avisa antes de publicar.

Arredondamento para 0% (desconto < 0,5%) também cai para `price`.

## 2. Layout (1920×1080)

### Camadas

1. Foto (`item.imageUrl` já resolvida para `data:` URI) em `objectFit: cover`,
   absoluta, ocupando a área à direita da diagonal (`x` de 730 a 1920), atrás de tudo.
   Fundo claro `#F1F1F3` atrás da foto caso ela não cubra.
2. SVG de fundo 1920×1080: polígono na cor escolhida com vértices
   `(0,0) (980,0) (830,1080) (0,1080)` — ~51% no topo, ~43% na base (painel mais
   estreito que a primeira versão, para dar mais espaço à foto do produto).
   Enfeites no canto superior esquerdo do painel: onda, traço, círculo cheio,
   círculo vazado, dois "+", zigue-zague — o "+" e o zigue-zague próximos da
   borda direita (originalmente perto de x=880-960) foram deslocados 140px para
   a esquerda (x=740-820) para manter a mesma folga em relação à diagonal mais
   estreita. Cor dos enfeites = cor do texto do painel com opacidade ~0,85.
3. Conteúdo em flex, a partir de `y = 310` (abaixo dos enfeites), `x = 80`,
   largura útil 670px (até a diagonal na base, menos 80px de cada lado).

Sem foto: polígono vira retângulo cheio (1920×1080), sem rodapé de aviso,
conteúdo continua à esquerda com largura útil maior (até 1400px).

### Cores derivadas

Função pura `promoPalette(accentColor)` → `{ panel, text, price, ornament }`:

- `text`: branco `#FFFFFF` ou quase-preto `#1F1B2E`, o que tiver maior contraste
  WCAG contra `panel`.
- `price`: a cor misturada 85% com `#1F1B2E` (tom escuro da própria cor, como
  o roxo da referência) — desde que mantenha contraste ≥ 3:1 com o painel;
  senão usa `text`.
- `ornament`: `text` com opacidade 0,85.

### Conteúdo — estilo `price`

De cima para baixo, alinhado à esquerda:

1. Selo: `headline ?? "PROMOÇÃO"` em maiúsculas, cortado em 40 caracteres
   (`MAX_HEADLINE`), Fredoka Bold, dentro de cápsula com borda pontilhada.
   A cápsula é um SVG próprio (`promoBadgeSvg`) do tamanho do selo — o satori
   não mede texto nem desenha borda pontilhada, então a largura é estimada
   por `caracteres × 0,7 × fonte + 112`, com teto de 670px (a largura da coluna
   de conteúdo com foto).
   Como a altura do selo é fixa (`fonte × 1,9`), uma estimativa maior que o
   teto faria o satori quebrar o texto em duas linhas e a segunda sairia por
   cima da borda. Por isso os degraus de fonte descem o bastante para a
   estimativa caber em 670px até os 40 caracteres: 79px até 10 caracteres,
   53px até 15, 37px até 21, 28px até 28, 19px acima disso.
2. Nome do produto: Fredoka Bold ~52px, maiúsculas, cortado em 20 caracteres
   (`MAX_PROMO_NAME`), `text`.
3. `DE 14,99 POR` — Bold ~36px/~52px, só se `oldPriceCents` for **maior** que
   o preço atual (preço antigo ausente, zerado ou ≤ atual não vira DE/POR).
4. `R$ 8,99` — `R$` ~52px, valor ~150px (100px acima de 6 dígitos e 75px acima
   de 9, para `1.000.000,00` não invadir a foto), cor `price`.
5. `body` — Fredoka Bold ~38px, cortado em 160 caracteres (`MAX_BODY`), até 2
   linhas, cor `price`.

### Conteúdo — estilo `percent`

1. Selo (igual).
2. Nome do produto.
3. `40%` ~200px + `OFF` ~72px, cor `price`.
4. `DE R$ 14,99 POR R$ 8,99` ~40px, `text`.
5. `body`.

### Rodapé

`*imagens meramente ilustrativas` — Fredoka Bold ~32px, canto inferior direito
sobre a foto, cor `#3A2A4A`. Só quando há foto.

### Fonte

`artifacts/api-server/assets/fonts/Fredoka-Regular.woff` e `Fredoka-Bold.woff`
(estáticos do `@fontsource/fredoka`, subset latin — o Google Fonts só publica
Fredoka como fonte variável, que o satori não instancia por peso), carregadas
em `assets.ts` junto das Inter (família `"Fredoka"`). `build.mjs` ganha loader
`.woff: binary`. Licença OFL copiada para `assets/fonts/OFL-Fredoka.txt`.

## 3. Código

### Servidor

- `src/lib/panels/promo-palette.ts` (novo): `promoPalette`, `discountPercent`,
  `resolvePromoStyle(style, item)`. Funções puras.
- `src/lib/panels/promo-background.ts` (novo): `promoBackgroundSvg({ color,
  ornament, hasImage })` e `promoBadgeSvg({ width, height, stroke })` → string
  SVG. Puras.
- `templates.ts`: `promoNode` reescrito usando os dois módulos acima.
  `menuNode` e `noticeNode` intocados.

### Portal (`artifacts/signage`)

- `panel-preview.tsx`: `PromoPreview` reescrito com o mesmo layout em `cqw`.
  Paleta, porcentagem e SVG de fundo são funções puras sem dependência de
  Node — copiadas para `src/lib/promo-visual.ts` (a prévia já espelha cores do
  servidor por cópia; manter o padrão). Fredoka carregada via Google Fonts
  só para a prévia. Os cortes de texto do servidor (`MAX_HEADLINE` 40,
  `MAX_PROMO_NAME` 20, `MAX_BODY` 160) são exportados de `promo-visual.ts` e
  aplicados também na prévia — só o `truncate`/`line-clamp` do CSS esconderia
  na prévia um corte que o PNG mostra com reticências.
- `portal-panel-editor.tsx` (quando `kind === "promo"`):
  - Cor: `<input type="color">` + campo texto hex sincronizados.
  - Estilo: seletor segmentado "Preço" / "Porcentagem".
  - Aviso inline quando "Porcentagem" está escolhida e `resolvePromoStyle` cai
    para `price` (sem preço antigo, preço antigo ≤ atual, preço atual zerado ou
    desconto que arredonda para 0%): "Sem desconto válido, o slide mostra o
    preço normal."

## 4. Testes

- `promo-palette.test.ts`: contraste escolhe branco em cor escura e escuro em
  cor clara; `discountPercent` (1499→899 = 40); `resolvePromoStyle` cai para
  `price` sem preço antigo, com preço antigo ≤ atual e com 0%.
- `promo-background.test.ts`: SVG contém a cor; sem foto gera retângulo cheio;
  de 1 a 40 caracteres a largura estimada do texto cabe dentro do selo.
- `render.test.ts`: renderiza promo `price` e `percent`, com e sem foto, sem
  lançar e com PNG 1920×1080.
- Rota: `PATCH` aceita `accentColor` válido, recusa `#abc`/`red` com 400,
  aceita `promoStyle` e recusa valor fora do enum.
- `panel-preview.test.tsx`: mostra `40%` no estilo percent e `DE`/`POR` no price;
  corta manchete, nome e corpo nos mesmos limites do servidor; preço de sete
  dígitos usa a fonte de 100px.
- `promo-visual.test.ts` (signage): repete os valores do servidor (paleta,
  medidas do selo, limites de texto) para acusar deriva entre as duas cópias.
- `portal-panel-editor.test.tsx`: mudar cor/estilo envia os campos; aviso aparece
  sem preço antigo.

## Fora do escopo

- Temas pré-definidos ou cores para menu/aviso.
- Promoção de porcentagem sem produto (ex.: "loja toda 30% OFF").
- Logo do lojista no slide.

## Anexo (2026-09-17): enquadramento vertical da foto

O lojista arrasta a foto na prévia para escolher que parte dela aparece no
slide. Só na promoção; só na vertical (a área da foto é quase quadrada, a
sobra é quase toda vertical).

### Dados

- `panels.photo_offset integer` — 0 a 100, nulo vale 50 (centro, o que o
  slide faz hoje). Migração `0010`.
- OpenAPI: `photoOffset` (integer, minimum 0, maximum 100, nullable) em
  `Panel` e `UpdatePanelRequest`; regenera o cliente. Rota valida o
  intervalo; fora dele é 400.
- `RenderPanel` ganha `photoOffset?: number | null`; `publish.ts` repassa.

### Renderizador

A foto usa `objectPosition: "50% <offset>%"` (satori 0.33.4 suporta).
0 mostra o topo da imagem, 100 o rodapé. Valor nulo ou fora do intervalo
vira 50 — a normalização fica numa função pura junto das outras
(`promo-palette.ts` ou módulo próprio), copiada para o portal como o resto.

### Editor

- Arrastar direto na prévia: mousedown/pointerdown sobre a foto, mover na
  vertical, soltar. O deslocamento em pixels vira porcentagem pela altura
  da prévia, preso entre 0 e 100. Cursor `grab`/`grabbing`,
  `touch-action: none` para o celular.
- Botão "Centralizar" volta para 50.
- Campo numérico acessível por teclado (pode ser um `<input type="range">`
  rotulado "Enquadramento vertical da foto"), porque arrastar sozinho não
  é alcançável por teclado.
- O valor entra no mesmo PATCH do nome, cor e estilo.

### Testes

- Normalização: nulo, fora do intervalo e não inteiro viram 50; valores
  válidos passam.
- Render: offsets 0, 50 e 100 geram PNGs diferentes entre si.
- Rota: aceita 0 e 100, recusa -1, 101 e "meio" com 400.
- Prévia: `objectPosition` reflete o valor.
- Editor: arrastar muda o valor, o botão centraliza, o PATCH leva
  `photoOffset`.
