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
  Hex fora do padrão → 400 pela validação zod gerada.
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
   absoluta, ocupando a metade direita inteira (`x` de 860 a 1920), atrás de tudo.
   Fundo claro `#F1F1F3` atrás da foto caso ela não cubra.
2. SVG de fundo 1920×1080: polígono na cor escolhida com vértices
   `(0,0) (1120,0) (960,1080) (0,1080)` — ~58% no topo, ~50% na base.
   Enfeites no canto superior esquerdo do painel: onda, traço, círculo cheio,
   círculo vazado, dois "+", zigue-zague. Cor dos enfeites = cor do texto do
   painel com opacidade ~0,85.
3. Conteúdo em flex, dentro da área do painel (largura útil ~880px, padding 80px).

Sem foto: polígono vira retângulo cheio (1920×1080), sem rodapé de aviso,
conteúdo continua à esquerda com largura útil maior (até 1400px).

### Cores derivadas

Função pura `promoPalette(accentColor)` → `{ panel, text, price, ornament }`:

- `text`: branco `#FFFFFF` ou quase-preto `#1F1B2E`, o que tiver maior contraste
  WCAG contra `panel`.
- `price`: se `text` é branco e a cor é clara o bastante, tom da própria cor
  escurecido (~55% de luminância a menos, como o roxo da referência) — desde
  que mantenha contraste ≥ 3:1 com o painel; senão usa `text`.
- `ornament`: `text` com opacidade 0,85.

### Conteúdo — estilo `price`

De cima para baixo, alinhado à esquerda:

1. Selo: `headline ?? "PROMOÇÃO"` em maiúsculas, Fredoka Bold ~96px, dentro de
   cápsula com borda pontilhada (desenhada no SVG, largura calculada pelo
   comprimento do texto com teto de 820px; texto truncado em `MAX_HEADLINE`).
2. Nome do produto: Fredoka Bold ~52px, maiúsculas, `text`.
3. `DE 14,99 POR` — Bold ~36px/~52px, só se houver `oldPriceCents`.
4. `R$ 8,99` — `R$` ~52px, valor ~170px, cor `price`.
5. `body` — Fredoka Bold ~40px, até 2 linhas, cor `price`.

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

`artifacts/api-server/assets/fonts/Fredoka-Regular.ttf` e `Fredoka-Bold.ttf`,
carregadas em `assets.ts` junto das Inter (família `"Fredoka"`). Licença OFL
copiada para `assets/fonts/OFL-Fredoka.txt`.

## 3. Código

### Servidor

- `src/lib/panels/promo-palette.ts` (novo): `promoPalette`, `discountPercent`,
  `resolvePromoStyle(style, item)`. Funções puras.
- `src/lib/panels/promo-background.ts` (novo): `promoBackgroundSvg({ color,
  ornament, hasImage, badgeWidth })` → string SVG. Pura.
- `templates.ts`: `promoNode` reescrito usando os dois módulos acima.
  `menuNode` e `noticeNode` intocados.

### Portal (`artifacts/signage`)

- `panel-preview.tsx`: `PromoPreview` reescrito com o mesmo layout em `cqw`.
  Paleta, porcentagem e SVG de fundo são funções puras sem dependência de
  Node — copiadas para `src/lib/promo-visual.ts` (a prévia já espelha cores do
  servidor por cópia; manter o padrão). Fredoka carregada via Google Fonts
  só para a prévia.
- `portal-panel-editor.tsx` (quando `kind === "promo"`):
  - Cor: `<input type="color">` + campo texto hex sincronizados.
  - Estilo: seletor segmentado "Preço" / "Porcentagem".
  - Aviso inline quando "Porcentagem" está escolhida e o item não tem preço
    antigo maior que o atual: "Sem preço antigo maior, o slide mostra o preço normal."

## 4. Testes

- `promo-palette.test.ts`: contraste escolhe branco em cor escura e escuro em
  cor clara; `discountPercent` (1499→899 = 40); `resolvePromoStyle` cai para
  `price` sem preço antigo, com preço antigo ≤ atual e com 0%.
- `promo-background.test.ts`: SVG contém a cor; sem foto gera retângulo cheio.
- `render.test.ts`: renderiza promo `price` e `percent`, com e sem foto, sem
  lançar e com PNG 1920×1080.
- Rota: `PATCH` aceita `accentColor` válido, recusa `#abc`/`red` com 400,
  aceita `promoStyle` e recusa valor fora do enum.
- `panel-preview.test.tsx`: mostra `40%` no estilo percent e `DE`/`POR` no price.
- `portal-panel-editor.test.tsx`: mudar cor/estilo envia os campos; aviso aparece
  sem preço antigo.

## Fora do escopo

- Temas pré-definidos ou cores para menu/aviso.
- Promoção de porcentagem sem produto (ex.: "loja toda 30% OFF").
- Logo do lojista no slide.
