# Identidade visual preto e teal — design

Data: 2026-09-25
Branch: `feat/identidade-visual`

## Objetivo

Trocar toda a identidade visual da plataforma Smart Vale TV para a paleta e o
logotipo novos (arquivo original: `logo.png`, 1536×1024, fundo preto): preto,
branco e teal. O nome continua **Smart Vale TV**. Sucesso = nenhuma superfície
da plataforma mostra mais a marca antiga (ícone genérico `MonitorPlay`, laranja
`#FF3C00`, ultramarine/índigo, logo antigo em "V"), e o logo novo aparece em
todo lugar onde a marca aparece.

## Decisões tomadas

- Logo redesenhado em SVG fiel ao PNG (não há vetor original). O SVG é
  aprovado visualmente pelo dono antes de ser espalhado.
- Tema único **escuro** em landing, login e portal (sem modo claro).
- Escopo: web, páginas da TV (`tv.html`, `apk.html`), app Android e peças de
  divulgação.
- Abordagem: fonte única da marca (`brand/`) + tokens de tema + componente
  `<Logo>`; derivados gerados a partir do SVG mestre.

## Fora do escopo

- Cores de conteúdo de clientes: encartes, flyer, promo, identidade da loja
  (`brandColor`, `DEFAULT_BAND` etc.).
- `applicationId`, `versionName`/`versionCode` e assinatura do APK.

## 1. Paleta e tipografia

| Token | Valor | Uso |
|---|---|---|
| `--background` | `#000000` | fundo de página |
| `--card`, `--popover`, `--sidebar` | `#0E0F10` | cartões, diálogos |
| `--border`, `--input`, `--card-border`, `--popover-border` | `#24272A` | bordas |
| `--secondary`, `--accent`, `--muted` | tons entre `#16181A` e `#24272A` | superfícies secundárias, hover |
| `--foreground` e `*-foreground` neutros | `#FFFFFF` | texto |
| `--muted-foreground` | `#9AA3A8` | texto secundário |
| `--primary`, `--ring`, `--sidebar-primary` | teal da marca (valor-base `#2ED8B6`) | botões, links, foco, destaques |
| `--primary-foreground` | `#000000` | texto sobre teal |
| `--destructive` | inalterado | erros |
| `--chart-1..5` | teal + 4 tons legíveis sobre preto | gráficos de Análises |

- O teal exato sai da amostragem do PNG na vetorização e é confirmado junto
  com o SVG; o valor escolhido vira a única fonte (`brand/README.md` e
  `index.css`).
- Os tokens continuam no formato HSL sem `hsl()` usado hoje em
  `artifacts/signage/src/index.css`.
- O bloco `:root` passa a ter os valores escuros; o bloco `.dark` duplicado é
  removido. `sonner.tsx` (usa `next-themes`, hoje não montado no `App.tsx`)
  recebe tema `dark` fixo para não destoar se voltar a ser usado.
- **Impressão** (relatórios do portal anunciante/cliente viram PDF): o papel
  continua claro. Dentro do `@media print` de `index.css` os tokens são
  redefinidos para uma paleta clara — fundo e cartões brancos, texto
  `#111`, bordas cinza-claras, `--primary` em teal escuro (~`#0F8F78`,
  contraste ≥ 4,5:1 no branco). Sem isso cartões e tabelas iriam pretos
  para o PDF.
- Contraste mínimo WCAG AA (4,5:1 texto normal) em todo par
  texto/fundo definido pelos tokens.
- Fonte: **Outfit** (já carregada), peso 800 no logotipo. Nenhuma fonte nova.

## 2. Logo e web

### Arquivos mestres (`brand/`, raiz do repo)

- `logo.svg` — horizontal completo: "smart" branco; "vale" teal + "tv"
  branco; ícone TV com play em teal. Texto convertido em paths (não depende
  de fonte instalada).
- `logo-mark.svg` — só o ícone TV com play.
- `README.md` — paleta com hex, respiro mínimo, tamanho mínimo, quando usar
  cada versão.

### Componente

`artifacts/signage/src/components/brand/logo.tsx`:

- `<Logo variant="full" | "mark" className? />`, SVG inline, `role="img"`,
  `aria-label="Smart Vale TV"`.
- As partes brancas do logo ("smart", "tv") usam `currentColor` e as teal
  usam `hsl(var(--primary))`. Assim o mesmo componente sai branco+teal na
  tela e preto+teal escuro no papel, sem uma segunda variante.
- Os paths são os mesmos de `brand/*.svg` (copiados; o README diz para
  atualizar os dois juntos).

Substitui o `MonitorPlay` + texto em:

- `components/landing/site-header.tsx` e `site-footer.tsx`;
- `components/layout.tsx` (admin) e `components/portal-shell.tsx`
  (anunciante/cliente) — "Painel de Anúncios" vira subtítulo pequeno ao
  lado do logo;
- `pages/login.tsx`;
- `components/portal/print-header.tsx` (cabeçalho só do papel);
- `pages/not-found.tsx` (hoje sem marca; ganha logo e troca `gray-*` por
  tokens).

### Landing

- ~75 classes fixas (`zinc-*`, `slate-*`, `gray-*`, `bg-white`) em
  `components/landing/*`, `pages/landing.tsx`, `pages/not-found.tsx`,
  `pages/display.tsx` e `components/device-preview.tsx` viram classes de
  token (`bg-background`, `text-foreground`, `text-muted-foreground`,
  `border-border`, `bg-card`…). Onde a cor fixa representa a moldura física
  de uma TV (mockup, preview), fica preta/cinza escura de propósito.
- `tv-mockup.tsx`: gradiente `from-primary via-indigo-600 to-indigo-900` vira
  preto com brilho teal.

### Metadados (`artifacts/signage`)

- `public/favicon.svg`: mark teal sobre quadrado preto arredondado.
- `public/apple-touch-icon.png` 180×180 (novo) + `<link>` no `index.html`.
- `public/og.png` 1200×630: fundo preto, logo ao centro, frase atual
  ("Anúncios nas telas do comércio da região" / subtítulo), faixa teal no
  rodapé. Mesmo nome de arquivo.
- `<meta name="theme-color" content="#000000">`.

## 3. TV, Android, divulgação

### `public/tv.html` (ES5, TVs antigas)

- Tela de pareamento: fundo `#0b0f19` → `#000`, logo full em SVG inline no
  topo, textos branco e `#9AA3A8`.
- Barra de progresso `#4f46e5` → teal.
- Slides e conteúdo dos anunciantes intocados.

### `public/apk.html`

- Fundo preto, logo no topo, botão "Baixar agora" teal com texto preto,
  cinzas da paleta no lugar de `#b9b9d4`, `#d5d5ea`, `#15152a`.

### App Android (`artifacts/android-tv`)

- `res/drawable/ic_launcher.xml`: mark teal sobre fundo preto (vector
  drawable convertido do SVG mestre; funciona no `minSdk 21`).
- `res/drawable/banner.xml` 320×180 (banner da launcher Android TV): logo
  full sobre preto.
- `res/values/strings.xml`: `app_name` `Signage TV` → `Smart Vale TV`.
- Nada mais no Gradle ou manifest muda; o auto-update por `update.json`
  continua entregando a nova versão às TVs instaladas.

### Peças de divulgação

- `marketing/estilo.css` passa para preto/teal/branco e usa o logo SVG no
  lugar do ícone + texto.
- `marketing/gerar.mjs` roda de novo e regera os 8 PNGs de
  `artifacts/signage/public/divulgacao/` (mesmos nomes). O dono vê as peças
  antes do commit.

## Testes e verificação

- Teste de unidade do `<Logo>`: renderiza cada variante com `role="img"` e
  `aria-label`.
- Testes existentes que dependem do ícone/texto antigo nos headers são
  ajustados; `tv-html.test.ts` continua passando.
- Varredura: nenhuma ocorrência de `#FF3C00`, `#3d00ff`, `#4f46e5`,
  `indigo-`, `248 100%` e `MonitorPlay` (em header/marca) fora de conteúdo
  de cliente.
- `pnpm` typecheck + testes + build do web; `assembleDebug` do APK.
- Conferência visual no navegador (landing, login, portal admin, portal
  anunciante/cliente, `tv.html` na tela de pareamento, `apk.html`) com
  screenshots.
- Prévia de impressão dos portais anunciante e cliente: página branca, texto
  escuro, logo legível.
- Contraste dos pares de token conferido por script.

## Entrega

- Commits na branch `feat/identidade-visual`.
- PR `feat(portal): nova identidade visual preto e teal` → release minor.
- Aviso no PR: WhatsApp/Facebook cacheiam `og.png` por URL; links já
  compartilhados só mostram o card novo após rescrape.
