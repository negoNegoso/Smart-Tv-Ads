# Identidade visual preto e teal — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a identidade visual inteira da Smart Vale TV (web, páginas da TV, app Android, peças de divulgação) para o logo novo e a paleta preto/branco/teal.

**Architecture:** O logo vira SVG mestre em `brand/` (texto convertido em path). Um módulo TS com os mesmos paths alimenta o componente `<Logo>` do web; `tv.html`, `apk.html` e os vector drawables do Android recebem cópias dos paths, e um teste garante que as cópias não se desencontram do mestre. O tema do web passa a ser um só, escuro, definido em tokens no `:root` de `index.css`, com paleta clara só para impressão.

**Tech Stack:** React + Vite + Tailwind 4 (tokens HSL em `index.css`), Vitest + Testing Library (jsdom), HTML ES5 (`tv.html`, `apk.html`), Android vector drawables (minSdk 21), Chrome headless + ImageMagick (`marketing/gerar.mjs`), opentype.js só no script descartável de vetorização.

**Spec:** `docs/superpowers/specs/2026-09-25-identidade-visual-design.md`

## Global Constraints

- Nome da marca: **Smart Vale TV** (inalterado).
- Teal da marca: `#28D8B3` = HSL `167 69% 50%` (amostrado do PNG original; substitui o valor-base `#2ED8B6` da spec, que pedia a amostragem).
- Preto `#000000`, branco `#FFFFFF`, cartões `#0E0F10`, bordas `#24272A`, texto secundário `#9AA3A8`.
- Texto sobre teal é preto (`--primary-foreground: 0 0% 0%`), nunca branco.
- Impressão: papel branco; teal escuro `#0B7A66` = HSL `169 83% 26%`.
- Contraste WCAG AA ≥ 4,5:1 em todo par texto/fundo dos tokens (exceto `--destructive`, que a spec mantém inalterado).
- Fonte do web: Outfit (já carregada). Logo em Outfit 800, convertido em path.
- Tema único escuro; o bloco `.dark` sai.
- Fora do escopo: cores de encarte/flyer/promo/identidade de loja de clientes (`brandColor`, `DEFAULT_BAND`, `promo-visual.ts`).
- Android: **não** mexer em `applicationId`, `versionName`, `versionCode`, assinatura nem manifest.
- Código e comentários em português explicando o porquê; acentos em UTF-8 real, nunca `\uXXXX`.
- Commits no formato `tipo(escopo): descrição` com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tudo na branch `feat/identidade-visual`; PR `feat(portal): nova identidade visual preto e teal`, merge commit.

## Review Focus

1. **Relatório impresso do portal (PDF)** — com o tema escuro, cartões/tabelas precisam sair brancos com texto escuro no papel. Coberto por teste de contraste da paleta de impressão (Task 3) e prévia de impressão (Task 9).
2. **Botão teal com texto branco** — a landing hoje usa `bg-primary text-white` (contraste ~1,8:1 com teal). Coberto pela varredura de classes proibidas na landing (Task 5).
3. **TV antiga (WebView Android 5) na tela de pareamento** — SVG inline não pode depender de `var(...)`/`currentColor`. Coberto em `tv-html.test.ts` (Task 7).
4. **Cópias do logo desencontradas** — `logo-paths.ts`, `tv.html`, `apk.html` e drawables do Android copiam paths do mestre; mudar um e esquecer outro. Coberto pelo teste de sincronia (Tasks 2, 7, 8).
5. **Mapa de cobertura na landing** — cinza claro e azul fixos (`rgb(228 228 231)`, `rgb(191 219 254)`) e contorno branco ficam gritantes no preto. Coberto pela varredura de cores fixas na landing (Task 5).

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `brand/logo.svg` | criar | logo horizontal mestre (fundo transparente, para fundo escuro) |
| `brand/logo-mark.svg` | criar | só o ícone TV + play |
| `brand/README.md` | criar | paleta, uso, onde os paths estão copiados |
| `artifacts/signage/src/components/brand/logo-paths.ts` | criar | paths e viewBox do logo (cópia do mestre) |
| `artifacts/signage/src/components/brand/logo.tsx` | criar | componente `<Logo>` |
| `artifacts/signage/src/components/brand/__tests__/logo.test.tsx` | criar | teste do componente + sincronia com o mestre |
| `artifacts/signage/src/index.css` | modificar | tokens escuros, paleta de impressão |
| `artifacts/signage/src/__tests__/tema-contraste.test.ts` | criar | contraste dos tokens (tela e impressão) |
| `artifacts/signage/src/components/ui/sonner.tsx` | modificar | tema escuro fixo |
| `artifacts/signage/src/components/landing/*.tsx`, `src/pages/landing.tsx`, `src/pages/not-found.tsx` | modificar | tokens no lugar de cores fixas; logo |
| `artifacts/signage/src/components/layout.tsx`, `portal-shell.tsx`, `portal/print-header.tsx`, `src/pages/login.tsx` | modificar | logo no lugar de `MonitorPlay` |
| `artifacts/signage/src/components/__tests__/marca-cabecalhos.test.tsx` | criar | logo presente nos cabeçalhos |
| `artifacts/signage/src/__tests__/landing-cores.test.ts` | criar | varredura de cores fixas na landing |
| `artifacts/signage/public/favicon.svg`, `apple-touch-icon.png`, `og.png` | modificar/criar | ícones e card social |
| `artifacts/signage/index.html` | modificar | `theme-color`, `apple-touch-icon` |
| `marketing/gerar.mjs`, `marketing/estilo.css`, `marketing/og.css` | modificar/criar | peças + og + apple-touch-icon |
| `artifacts/signage/public/tv.html`, `apk.html` | modificar | paleta e logo |
| `artifacts/signage/src/__tests__/tv-html.test.ts` | modificar | logo sem `var()` na tela de pareamento |
| `artifacts/android-tv/app/src/main/res/drawable/ic_launcher.xml`, `banner.xml`, `res/values/strings.xml` | modificar | ícone, banner, nome |
| `artifacts/signage/src/__tests__/identidade-visual.test.ts` | criar | varredura final de cores antigas + sincronia Android/HTML |

---

### Task 1: Logo mestre em SVG (com aprovação visual do dono)

**Files:**
- Create: `brand/logo.svg`, `brand/logo-mark.svg`, `brand/README.md`
- Create: `artifacts/signage/src/components/brand/logo-paths.ts`
- Scratch (não commitar): `$SCRATCH/vetorizar/gerar-logo.mjs`, `$SCRATCH/vetorizar/comparar.html`

`$SCRATCH` = `/private/tmp/claude-503/-Users-yvillanova-Downloads-tv-Smart-Tv-Ads/37c8785e-38c1-490f-b04e-4d345488b9f0/scratchpad`. O script de vetorização é descartável: depende de opentype.js e da fonte, que não entram no repo. Os SVGs gerados é que viram a fonte da verdade.

**Interfaces:**
- Produces: `logo-paths.ts` exporta
  `LOGO_VIEWBOX: string`, `MARK_VIEWBOX: string`,
  `PATH_SMART: string`, `PATH_VALE: string`, `PATH_TV: string` (texto, preenchidos),
  `PATH_TELA: string` (contorno da TV, traçado), `TELA_STROKE_WIDTH: number`,
  `PATH_PLAY: string` (triângulo, preenchido e traçado), `PLAY_STROKE_WIDTH: number`,
  `COR_TEAL = '#28D8B3'`.
  Os mesmos `d` aparecem literalmente em `brand/logo.svg`.

Geometria de referência (coordenadas do PNG original 1536×1024 menos o deslocamento `190,280`):
- "smart": baseline y=185, começa em x=10, largura-alvo 695.
- "vale" (teal) + "tv" (branco): baseline y=352, começa em x=15, mesmo tamanho de fonte de "smart".
- Tela (traçado teal, largura 30, cantos redondos): `M780 95 L1130 25 L1130 370 L780 320 Z`.
- Play (teal): `M887 152 L1010 215 L887 280 Z`, preenchido + traço 14 redondo (arredonda as pontas).
- `LOGO_VIEWBOX = "0 0 1170 400"`, `MARK_VIEWBOX = "760 3 390 390"`.

- [ ] **Step 1: Preparar a pasta descartável**

```bash
S=/private/tmp/claude-503/-Users-yvillanova-Downloads-tv-Smart-Tv-Ads/37c8785e-38c1-490f-b04e-4d345488b9f0/scratchpad/vetorizar
mkdir -p "$S" && cd "$S" && npm init -y >/dev/null && npm i opentype.js@1.3.4 @fontsource/outfit@5
ls node_modules/@fontsource/outfit/files/ | grep 'latin-800-normal.woff$'
```
Expected: `outfit-latin-800-normal.woff`

- [ ] **Step 2: Escrever o script de vetorização** — `$S/gerar-logo.mjs`:

```js
// Descartável: vetoriza o logo novo (Outfit 800) e grava os mestres em brand/.
import opentype from 'opentype.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const REPO = '/Users/yvillanova/Downloads/tv/Smart-Tv-Ads';
const buf = readFileSync(new URL('./node_modules/@fontsource/outfit/files/outfit-latin-800-normal.woff', import.meta.url));
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

const TEAL = '#28D8B3';
const OPTS = { kerning: true, letterSpacing: -0.03 };
// Um tamanho só para as duas linhas, calibrado pela largura de "smart" no PNG.
const size = 695 / font.getAdvanceWidth('smart', 1, OPTS);

const d = (txt, x, y) => font.getPath(txt, x, y, size, OPTS).toPathData(1);
const PATH_SMART = d('smart', 10, 185);
const PATH_VALE = d('vale', 15, 352);
const PATH_TV = d('tv', 15 + font.getAdvanceWidth('vale', size, OPTS), 352);
const PATH_TELA = 'M780 95L1130 25L1130 370L780 320Z';
const PATH_PLAY = 'M887 152L1010 215L887 280Z';
const TELA_STROKE_WIDTH = 30;
const PLAY_STROKE_WIDTH = 14;
const LOGO_VIEWBOX = '0 0 1170 400';
const MARK_VIEWBOX = '760 3 390 390';

const tela = `<path d="${PATH_TELA}" fill="none" stroke="${TEAL}" stroke-width="${TELA_STROKE_WIDTH}" stroke-linejoin="round"/>`;
const play = `<path d="${PATH_PLAY}" fill="${TEAL}" stroke="${TEAL}" stroke-width="${PLAY_STROKE_WIDTH}" stroke-linejoin="round"/>`;

mkdirSync(`${REPO}/brand`, { recursive: true });
writeFileSync(`${REPO}/brand/logo.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}">
<title>Smart Vale TV</title>
<path d="${PATH_SMART}" fill="#FFFFFF"/>
<path d="${PATH_VALE}" fill="${TEAL}"/>
<path d="${PATH_TV}" fill="#FFFFFF"/>
${tela}
${play}
</svg>
`);
writeFileSync(`${REPO}/brand/logo-mark.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}">
<title>Smart Vale TV</title>
${tela}
${play}
</svg>
`);
writeFileSync(`${REPO}/artifacts/signage/src/components/brand/logo-paths.ts`, `// Cópia dos paths de brand/logo.svg (mestre). Gerado na vetorização do logo;
// o teste logo.test.tsx falha se este arquivo e o mestre se desencontrarem.
export const COR_TEAL = '${TEAL}';
export const LOGO_VIEWBOX = '${LOGO_VIEWBOX}';
export const MARK_VIEWBOX = '${MARK_VIEWBOX}';
export const PATH_SMART = '${PATH_SMART}';
export const PATH_VALE = '${PATH_VALE}';
export const PATH_TV = '${PATH_TV}';
export const PATH_TELA = '${PATH_TELA}';
export const TELA_STROKE_WIDTH = ${TELA_STROKE_WIDTH};
export const PATH_PLAY = '${PATH_PLAY}';
export const PLAY_STROKE_WIDTH = ${PLAY_STROKE_WIDTH};
`);
console.log('ok, fonte', size.toFixed(1), 'px');
```

- [ ] **Step 3: Rodar**

```bash
mkdir -p /Users/yvillanova/Downloads/tv/Smart-Tv-Ads/artifacts/signage/src/components/brand
cd "$S" && node gerar-logo.mjs
```
Expected: `ok, fonte ...px` e os três arquivos criados.

- [ ] **Step 4: Montar comparação lado a lado** — `$S/comparar.html`:

```html
<!doctype html><meta charset="utf-8">
<style>
  body{margin:0;background:#000;display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:20px;width:2400px}
  img{width:100%;background:#000}
  .claro{background:#fff;padding:20px}
</style>
<img src="file:///Users/yvillanova/Downloads/tv/logo.png">
<img src="file:///Users/yvillanova/Downloads/tv/Smart-Tv-Ads/brand/logo.svg" style="padding:180px 110px">
<img src="file:///Users/yvillanova/Downloads/tv/Smart-Tv-Ads/brand/logo-mark.svg" style="width:64px">
<img src="file:///Users/yvillanova/Downloads/tv/Smart-Tv-Ads/brand/logo-mark.svg" style="width:16px">
```

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --allow-file-access-from-files --window-size=2440,1000 --screenshot="$S/comparar.png" "file://$S/comparar.html"
```
Abra `$S/comparar.png` com a ferramenta Read e compare: proporção das linhas, espessura, posição do ícone, cantos.

- [ ] **Step 5: Ajustar até ficar fiel**

Ajustes típicos em `gerar-logo.mjs`: `letterSpacing` (-0.05 a 0), baseline e x de cada linha, coordenadas de `PATH_TELA`/`PATH_PLAY`, `TELA_STROKE_WIDTH`. Se a Outfit destoar muito das letras (formato do "a", "t"), trocar a fonte por `@fontsource/poppins` 800 e repetir. Rodar Steps 3–4 a cada ajuste.

- [ ] **Step 6: CHECKPOINT — aprovação do dono**

Mostrar `comparar.png` ao usuário e **parar** até ele aprovar. Nada das Tasks seguintes começa sem essa aprovação. Se ele pedir mudanças, voltar ao Step 5.

- [ ] **Step 7: README da marca** — `brand/README.md`:

```markdown
# Marca Smart Vale TV

Mestres do logo. Tudo o que mostra a marca deriva destes arquivos.

| Arquivo | Uso |
|---|---|
| `logo.svg` | logo horizontal; partes brancas pedem fundo escuro |
| `logo-mark.svg` | só o ícone (favicon, ícone do app, espaços pequenos) |

## Paleta

| Cor | Hex | Uso |
|---|---|---|
| Preto | `#000000` | fundo |
| Branco | `#FFFFFF` | texto, "smart" e "tv" do logo |
| Teal | `#28D8B3` | marca, botões, destaques; texto sobre teal é preto |
| Teal escuro | `#0B7A66` | teal sobre papel branco (impressão) |
| Cartão | `#0E0F10` | superfícies |
| Borda | `#24272A` | bordas |
| Texto secundário | `#9AA3A8` | legendas |

## Regras

- Respiro mínimo em volta do logo: a altura da letra "s".
- Tamanho mínimo: logo horizontal com 24 px de altura; abaixo disso, use o ícone.
- Fonte do logo: Outfit 800, já convertida em path (não depende de fonte instalada).

## Cópias dos paths (atualize todas juntas)

- `artifacts/signage/src/components/brand/logo-paths.ts` (componente `<Logo>`)
- `artifacts/signage/public/tv.html` e `public/apk.html` (SVG inline, ES5)
- `artifacts/android-tv/app/src/main/res/drawable/ic_launcher.xml` e `banner.xml`
- `marketing/gerar.mjs` lê `brand/logo.svg` direto

Os testes `logo.test.tsx` e `identidade-visual.test.ts` falham se uma cópia
se desencontrar do mestre.
```

- [ ] **Step 8: Commit**

```bash
cd /Users/yvillanova/Downloads/tv/Smart-Tv-Ads
git add brand artifacts/signage/src/components/brand/logo-paths.ts
git commit -m "feat(portal): logo novo vetorizado em brand/

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Componente `<Logo>`

**Files:**
- Create: `artifacts/signage/src/components/brand/logo.tsx`
- Test: `artifacts/signage/src/components/brand/__tests__/logo.test.tsx`

**Interfaces:**
- Consumes: exports de `logo-paths.ts` (Task 1).
- Produces: `export function Logo(props: { variant?: 'full' | 'mark'; className?: string }): JSX.Element` — `<svg role="img" aria-label="Smart Vale TV">`. Partes brancas com `fill="currentColor"`; partes teal com `hsl(var(--primary))`. Classe padrão: `h-8 w-auto` (full) / `h-8 w-8` (mark); `className` soma via `cn`.

- [ ] **Step 1: Teste que falha** — `logo.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Logo } from '../logo';
import * as P from '../logo-paths';

const MESTRE = readFileSync(resolve(import.meta.dirname, '../../../../../../brand/logo.svg'), 'utf8');

describe('Logo', () => {
  it('versão completa tem nome acessível e as cinco partes', () => {
    render(<Logo />);
    const svg = screen.getByRole('img', { name: 'Smart Vale TV' });
    expect(svg.getAttribute('viewBox')).toBe(P.LOGO_VIEWBOX);
    expect(svg.querySelectorAll('path')).toHaveLength(5);
  });

  it('"smart" e "tv" seguem a cor do texto; "vale" e ícone usam o primary', () => {
    const { container } = render(<Logo />);
    // A tela é só contorno (fill="none"): a cor dela está no stroke.
    const fills = Array.from(container.querySelectorAll('path')).map((p) =>
      p.getAttribute('fill') === 'none' ? p.getAttribute('stroke') : p.getAttribute('fill'),
    );
    // Assim o mesmo componente sai branco na tela e preto no papel.
    expect(fills).toEqual([
      'currentColor',
      'hsl(var(--primary))',
      'currentColor',
      'hsl(var(--primary))',
      'hsl(var(--primary))',
    ]);
  });

  it('versão ícone só desenha tela e play', () => {
    render(<Logo variant="mark" />);
    const svg = screen.getByRole('img', { name: 'Smart Vale TV' });
    expect(svg.getAttribute('viewBox')).toBe(P.MARK_VIEWBOX);
    expect(svg.querySelectorAll('path')).toHaveLength(2);
  });

  it('className soma à classe padrão', () => {
    render(<Logo className="h-12" />);
    expect(screen.getByRole('img').getAttribute('class')).toContain('h-12');
  });

  it('paths iguais aos do mestre brand/logo.svg', () => {
    for (const d of [P.PATH_SMART, P.PATH_VALE, P.PATH_TV, P.PATH_TELA, P.PATH_PLAY]) {
      expect(MESTRE).toContain(`d="${d}"`);
    }
    expect(MESTRE).toContain(`viewBox="${P.LOGO_VIEWBOX}"`);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd artifacts/signage && pnpm vitest run src/components/brand`
Expected: FAIL — `Failed to resolve import "../logo"`.

- [ ] **Step 3: Implementar** — `logo.tsx`:

```tsx
import { cn } from '@/lib/utils';
import {
  LOGO_VIEWBOX,
  MARK_VIEWBOX,
  PATH_PLAY,
  PATH_SMART,
  PATH_TELA,
  PATH_TV,
  PATH_VALE,
  PLAY_STROKE_WIDTH,
  TELA_STROKE_WIDTH,
} from './logo-paths';

const TEAL = 'hsl(var(--primary))';

/**
 * Logo da Smart Vale TV em SVG inline: sem request extra e sem depender de
 * fonte. As partes brancas seguem `currentColor` e as teal seguem o token
 * primary — é isso que deixa o mesmo logo branco+teal na tela escura e
 * preto+teal escuro no relatório impresso, sem uma segunda versão.
 */
export function Logo({ variant = 'full', className }: { variant?: 'full' | 'mark'; className?: string }) {
  const full = variant === 'full';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={full ? LOGO_VIEWBOX : MARK_VIEWBOX}
      role="img"
      aria-label="Smart Vale TV"
      className={cn(full ? 'h-8 w-auto' : 'h-8 w-8', 'shrink-0', className)}
    >
      {full ? (
        <>
          <path d={PATH_SMART} fill="currentColor" />
          <path d={PATH_VALE} fill={TEAL} />
          <path d={PATH_TV} fill="currentColor" />
        </>
      ) : null}
      <path d={PATH_TELA} fill="none" stroke={TEAL} strokeWidth={TELA_STROKE_WIDTH} strokeLinejoin="round" />
      <path d={PATH_PLAY} fill={TEAL} stroke={TEAL} strokeWidth={PLAY_STROKE_WIDTH} strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm vitest run src/components/brand`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/components/brand
git commit -m "feat(portal): componente Logo com os paths do mestre

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tokens escuros + paleta de impressão

**Files:**
- Modify: `artifacts/signage/src/index.css` (blocos `:root` linhas ~85–156, `.dark` ~158–208, `@media print` ~294–313)
- Modify: `artifacts/signage/src/components/ui/sonner.tsx`
- Test: `artifacts/signage/src/__tests__/tema-contraste.test.ts`

**Interfaces:**
- Produces: tokens CSS com os mesmos nomes de hoje (`--background`, `--primary` etc., formato `H S% L%`), agora escuros; bloco `@media print { :root { ... } }` com a paleta clara.

- [ ] **Step 1: Teste que falha** — `tema-contraste.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Lê os tokens de index.css e mede contraste WCAG dos pares texto/fundo. O
 * tema virou escuro e o teal claro: um token errado aqui vira botão ilegível
 * no portal inteiro, então a conta fica num teste e não no olho.
 */
const CSS = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8');

function bloco(inicio: RegExp): Record<string, string> {
  const m = inicio.exec(CSS);
  if (!m) throw new Error(`bloco não encontrado: ${inicio}`);
  const corpo = CSS.slice(m.index + m[0].length, CSS.indexOf('}', m.index + m[0].length));
  const vars: Record<string, string> = {};
  for (const [, nome, valor] of corpo.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[nome] = valor.trim();
  return vars;
}

function luminancia(hsl: string): number {
  const [h, s, l] = hsl.replace(/%/g, '').split(/\s+/).map(Number);
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(0) + 0.7152 * f(8) + 0.0722 * f(4);
}

function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const PARES: Array<[string, string]> = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['primary-foreground', 'primary'],
  ['primary', 'background'],
  ['primary', 'card'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
];

describe('tokens de tema', () => {
  const tela = bloco(/^:root\s*\{/m);

  it('tela é escura com o teal da marca', () => {
    expect(tela.background).toBe('0 0% 0%');
    expect(tela.primary).toBe('167 69% 50%');
    expect(tela['primary-foreground']).toBe('0 0% 0%');
  });

  it.each(PARES)('tela: %s sobre %s ≥ 4,5:1', (texto, fundo) => {
    expect(contraste(tela[texto], tela[fundo])).toBeGreaterThanOrEqual(4.5);
  });

  it('não sobra bloco .dark', () => {
    expect(CSS).not.toMatch(/^\.dark\s*\{/m);
  });

  describe('impressão', () => {
    const papel = { ...tela, ...bloco(/@media print\s*\{[\s\S]*?:root\s*\{/) };

    it('papel é branco', () => {
      expect(papel.background).toBe('0 0% 100%');
      expect(papel.card).toBe('0 0% 100%');
    });

    it.each(PARES)('papel: %s sobre %s ≥ 4,5:1', (texto, fundo) => {
      expect(contraste(papel[texto], papel[fundo])).toBeGreaterThanOrEqual(4.5);
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run src/__tests__/tema-contraste.test.ts`
Expected: FAIL — `background` é `240 20% 98%`, bloco `.dark` existe, bloco de impressão não encontrado.

- [ ] **Step 3: Trocar `:root` e apagar `.dark`**

Substituir do comentário `/* LIGHT MODE */` até o `}` que fecha `.dark` (inclusive) por:

```css
/* Tema único, escuro, na paleta do logo: preto, branco e teal. A landing e o
   portal usam o mesmo tema; não há mais modo claro nem classe .dark. */
:root {
  --button-outline: rgba(255, 255, 255, 0.1);
  --badge-outline: rgba(255, 255, 255, 0.05);

  --opaque-button-border-intensity: 9;

  --elevate-1: rgba(255, 255, 255, 0.04);
  --elevate-2: rgba(255, 255, 255, 0.09);

  --background: 0 0% 0%;
  --foreground: 0 0% 100%;

  --border: 210 8% 15%;

  --card: 210 7% 6%;
  --card-foreground: 0 0% 100%;
  --card-border: 210 8% 15%;

  --sidebar: 210 7% 6%;
  --sidebar-foreground: 0 0% 100%;
  --sidebar-border: 210 8% 15%;
  --sidebar-primary: 167 69% 50%;
  --sidebar-primary-foreground: 0 0% 0%;
  --sidebar-accent: 210 7% 12%;
  --sidebar-accent-foreground: 0 0% 100%;
  --sidebar-ring: 167 69% 50%;

  --popover: 210 7% 6%;
  --popover-foreground: 0 0% 100%;
  --popover-border: 210 8% 15%;

  /* Teal da marca (#28D8B3). Texto sobre ele é preto: branco daria 1,8:1. */
  --primary: 167 69% 50%;
  --primary-foreground: 0 0% 0%;

  --secondary: 210 7% 12%;
  --secondary-foreground: 0 0% 100%;

  --muted: 210 7% 10%;
  --muted-foreground: 201 7% 63%;

  --accent: 210 7% 14%;
  --accent-foreground: 0 0% 100%;

  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;

  --input: 210 8% 15%;
  --ring: 167 69% 50%;

  --chart-1: 167 69% 50%;
  --chart-2: 200 80% 60%;
  --chart-3: 45 90% 60%;
  --chart-4: 280 70% 70%;
  --chart-5: 340 75% 65%;

  --app-font-sans: 'Outfit', sans-serif;
  --app-font-serif: Georgia, serif;
  --app-font-mono: 'Space Mono', monospace;
  --radius: 0.5rem;

  --shadow-2xs: 0px 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-xs: 0px 2px 4px rgba(0, 0, 0, 0.4);
  --shadow-sm: 0px 4px 8px rgba(0, 0, 0, 0.4);
  --shadow: 0px 8px 16px rgba(0, 0, 0, 0.4);
  --shadow-md: 0px 12px 24px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0px 16px 32px rgba(0, 0, 0, 0.4);
  --shadow-xl: 0px 24px 48px rgba(0, 0, 0, 0.4);
  --shadow-2xl: 0px 32px 64px rgba(0, 0, 0, 0.4);

  color-scheme: dark;
}
```

A linha `@custom-variant dark (&:is(.dark *));` no topo fica (componentes shadcn têm variantes `dark:` inertes; tirá-la quebraria o build deles).

- [ ] **Step 4: Paleta de impressão**

No `@media print`, trocar o bloco `body { background: #fff; }` e o comentário acima dele por:

```css
  /* O papel é sempre claro: a tela é preta, mas o relatório impresso vira
     comprovante em PDF e a impressora não pode gastar tinta numa página
     inteira preta. Os tokens voltam a uma paleta clara só aqui; o teal
     escurece porque o da marca some no branco (1,8:1). */
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 7%;
    --border: 0 0% 85%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 7%;
    --card-border: 0 0% 85%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 7%;
    --popover-border: 0 0% 85%;
    --primary: 169 83% 26%;
    --primary-foreground: 0 0% 100%;
    --secondary: 0 0% 94%;
    --secondary-foreground: 0 0% 7%;
    --muted: 0 0% 96%;
    --muted-foreground: 0 0% 35%;
    --accent: 0 0% 94%;
    --accent-foreground: 0 0% 7%;
    --input: 0 0% 85%;
    --ring: 169 83% 26%;
    --chart-1: 169 83% 26%;
    color-scheme: light;
  }

  body {
    background: #fff;
  }
```

- [ ] **Step 5: Sonner com tema fixo** — em `components/ui/sonner.tsx`: apagar a linha `import { useTheme } from 'next-themes';`, apagar `const { theme = 'system' } = useTheme();` e trocar `theme={theme as ToasterProps['theme']}` por:

```tsx
      // Tema único escuro; não há next-themes montado para escolher outro.
      theme="dark"
```

- [ ] **Step 6: Rodar testes e typecheck**

Run: `pnpm vitest run src/__tests__/tema-contraste.test.ts && pnpm typecheck`
Expected: todos passam. Se algum par falhar, ajustar só a luminosidade (`L%`) do token do fundo/texto envolvido, nunca o teal da marca.

- [ ] **Step 7: Commit**

```bash
git add artifacts/signage/src/index.css artifacts/signage/src/components/ui/sonner.tsx artifacts/signage/src/__tests__/tema-contraste.test.ts
git commit -m "feat(portal): tema escuro preto e teal com paleta clara na impressão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Logo nos cabeçalhos

**Files:**
- Modify: `artifacts/signage/src/components/landing/site-header.tsx:1-12`
- Modify: `artifacts/signage/src/components/landing/site-footer.tsx:1-17`
- Modify: `artifacts/signage/src/components/layout.tsx:3,30-33`
- Modify: `artifacts/signage/src/components/portal-shell.tsx:2,18-21`
- Modify: `artifacts/signage/src/components/portal/print-header.tsx:2,29-32`
- Modify: `artifacts/signage/src/pages/login.tsx:8,48-51`
- Modify: `artifacts/signage/src/pages/not-found.tsx`
- Test: `artifacts/signage/src/components/__tests__/marca-cabecalhos.test.tsx`

**Interfaces:**
- Consumes: `Logo` de `@/components/brand/logo` (Task 2).

- [ ] **Step 1: Teste que falha** — `marca-cabecalhos.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { SiteHeader } from '../landing/site-header';
import { SiteFooter } from '../landing/site-footer';
import { Layout } from '../layout';
import { PortalShell } from '../portal-shell';
import { PrintHeader } from '../portal/print-header';
import Login from '@/pages/login';
import NotFound from '@/pages/not-found';

function comQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const CASOS: Array<[string, () => unknown]> = [
  ['cabeçalho da landing', () => render(<SiteHeader />)],
  ['rodapé da landing', () => render(<SiteFooter />)],
  ['painel admin', () => comQuery(<Layout>x</Layout>)],
  ['portal anunciante/cliente', () => comQuery(<PortalShell>x</PortalShell>)],
  ['cabeçalho impresso', () => render(<PrintHeader subject="Loja" period={{ from: '2026-09-01', to: '2026-09-25' }} />)],
  ['login', () => comQuery(<Login />)],
  ['404', () => render(<NotFound />)],
];

describe('logo da marca', () => {
  it.each(CASOS)('%s mostra o logo novo e não o ícone antigo', (_nome, montar) => {
    const { container } = montar() as ReturnType<typeof render>;
    expect(screen.getByRole('img', { name: 'Smart Vale TV' })).toBeInTheDocument();
    expect(container.querySelector('.lucide-monitor-play')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run src/components/__tests__/marca-cabecalhos.test.tsx`
Expected: FAIL nos 7 casos — `Unable to find an accessible element with the role "img" and name "Smart Vale TV"`.

- [ ] **Step 3: `site-header.tsx`** — trocar import de `MonitorPlay` por `import { Logo } from '@/components/brand/logo';`, o import de `BRAND` sai (`import { LANDING } from '@/lib/landing-content';`), e o `<span>` da marca vira:

```tsx
        <Link href="/" className="text-foreground">
          <Logo className="h-9" />
        </Link>
```
e as classes do header/nav/botão: `border-zinc-200 bg-white/90` → `border-border bg-background/90`; `text-zinc-600 … hover:text-zinc-900` → `text-muted-foreground … hover:text-foreground`; botão entrar `border-zinc-300 … text-zinc-700 … hover:border-zinc-400 hover:text-zinc-900` → `border-border … text-foreground … hover:border-primary hover:text-primary`.

- [ ] **Step 4: `site-footer.tsx`** — `BRAND` sai do import; adicionar `import { Logo } from '@/components/brand/logo';`; trocar `<p className="font-semibold text-zinc-900">{BRAND}</p>` por `<Logo className="h-8 text-foreground" />`; `border-zinc-200 bg-zinc-50` → `border-border bg-card`; `text-zinc-600` → `text-muted-foreground`; `hover:text-zinc-900` → `hover:text-foreground`.

- [ ] **Step 5: `layout.tsx` e `portal-shell.tsx`** — tirar `MonitorPlay` do import do lucide, adicionar `import { Logo } from '@/components/brand/logo';` e trocar o bloco da marca por:

```tsx
          <div className="flex items-center gap-3 text-foreground">
            <Logo className="h-8" />
            <span className="hidden border-l border-border pl-3 text-sm font-medium text-muted-foreground sm:inline">
              Painel de Anúncios
            </span>
          </div>
```

- [ ] **Step 6: `print-header.tsx`** — trocar `import { MonitorPlay } from 'lucide-react';` por `import { Logo } from '@/components/brand/logo';` e o bloco da marca por:

```tsx
      <div className="flex items-center gap-3 text-foreground">
        <Logo className="h-7" />
        <span className="text-sm font-medium text-muted-foreground">Painel de Anúncios</span>
      </div>
```

- [ ] **Step 7: `login.tsx`** — trocar import de `MonitorPlay` por `Logo` e o bloco por:

```tsx
        <div className="mb-6 flex flex-col items-center gap-2 text-foreground">
          <Logo className="h-12" />
          <span className="text-sm text-muted-foreground">Painel de Anúncios</span>
        </div>
```

- [ ] **Step 8: `not-found.tsx`** — substituir o arquivo por:

```tsx
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { Logo } from '@/components/brand/logo';

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-8 bg-background px-4">
      <Link href="/" className="text-foreground">
        <Logo className="h-10" />
      </Link>
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="mb-4 flex gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold text-foreground">404 Página não encontrada</h1>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Esqueceu de adicionar a página ao roteador?
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 9: Rodar**

Run: `pnpm vitest run src/components/__tests__/marca-cabecalhos.test.tsx && pnpm typecheck`
Expected: 7 passed; typecheck limpo (sem `BRAND`/`MonitorPlay` importados e não usados).

- [ ] **Step 10: Commit**

```bash
git add -A artifacts/signage/src
git commit -m "feat(portal): logo novo nos cabeçalhos, login, impressão e 404

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Landing nos tokens

**Files:**
- Modify: `artifacts/signage/src/pages/landing.tsx`
- Modify: `artifacts/signage/src/components/landing/{hero,cobertura,how-it-works,differentials,plans,faq,final-cta,tv-mockup}.tsx`
- Test: `artifacts/signage/src/__tests__/landing-cores.test.ts`

- [ ] **Step 1: Teste que falha** — `landing-cores.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A landing passou a usar só tokens de tema. Cor fixa aqui é resquício do
 * tema claro/ultramarine: vira texto cinza-escuro no fundo preto ou botão
 * teal com letra branca ilegível.
 */
const RAIZ = resolve(import.meta.dirname, '..');
const ARQUIVOS = [
  'pages/landing.tsx',
  ...readdirSync(resolve(RAIZ, 'components/landing')).map((f) => `components/landing/${f}`),
].filter((f) => f.endsWith('.tsx'));

const PROIBIDO: Array<[string, RegExp]> = [
  ['neutro fixo', /\b(?:text|bg|border|from|via|to)-(?:zinc|slate|gray)-\d+/],
  ['bg-white', /\bbg-white\b(?!\/)/],
  ['índigo', /indigo-/],
  ['texto branco sobre primary', /bg-primary\b[^'"`]*text-white|text-white[^'"`]*bg-primary\b/],
  ['cor rgb fixa', /rgb\(\d/],
  ['--primary sobrescrito', /'--primary'/],
];

describe('landing sem cores fixas', () => {
  it.each(ARQUIVOS)('%s', (arquivo) => {
    const texto = readFileSync(resolve(RAIZ, arquivo), 'utf8');
    const achados = PROIBIDO.filter(([, re]) => re.test(texto)).map(([nome]) => nome);
    expect(achados).toEqual([]);
  });
});
```

Exceção proposital: a moldura física da TV e a caixa do QR no `tv-mockup.tsx` representam objetos reais, não o tema. A moldura usa `neutral-800` (fora da lista proibida) e a caixa do QR usa `bg-[#fff]` com comentário — assim o teste não precisa de exceção.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run src/__tests__/landing-cores.test.ts`
Expected: FAIL em quase todos os arquivos, listando os achados.

- [ ] **Step 3: `landing.tsx`** — tirar o `style` que trava `--primary` e o comentário dele; wrapper vira `<div className="min-h-[100dvh] bg-background text-foreground">`; atualizar o JSDoc: "Mesmo tema escuro do resto do sistema; não depende de preferência de sistema." Remover `import * as React` se ficar sem uso.

- [ ] **Step 4: Tabela de troca, aplicada em hero, how-it-works, differentials, plans, faq, cobertura**

| De | Para |
|---|---|
| `bg-white` (página, cartões) | `bg-card` (cartões) / `bg-background` (seções) |
| `bg-zinc-50` | `bg-card` |
| `border-zinc-200`, `border-zinc-300` | `border-border` |
| `hover:border-zinc-400` | `hover:border-primary` |
| `text-zinc-900`, `text-zinc-700` | `text-foreground` |
| `text-zinc-600`, `text-zinc-500` | `text-muted-foreground` |
| `hover:text-zinc-900` | `hover:text-foreground` |
| `bg-primary … text-white` | `bg-primary … text-primary-foreground` |

Rodar `grep -nE 'zinc-|bg-white|text-white' src/components/landing/*.tsx` até só sobrarem os casos da Step 6.

- [ ] **Step 5: Mapa em `cobertura.tsx`** (linhas ~108–116):

```tsx
                  fill={
                    municipio.ibge === ativa
                      ? 'hsl(var(--primary))'
                      : temParceiro
                        ? 'hsl(var(--primary) / 0.35)'
                        : 'hsl(var(--muted))'
                  }
                  stroke="hsl(var(--background))"
```

e os chips (linhas ~134–135): ativo `'rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground'`; inativo `'rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-foreground'`.

- [ ] **Step 6: `final-cta.tsx` e `tv-mockup.tsx`**

`final-cta.tsx`: seção `bg-primary text-primary-foreground`; título `text-primary-foreground` (sem `text-white`); subtítulo `text-primary-foreground/80`; botões `bg-background text-primary hover:opacity-90` (preto com letra teal sobre faixa teal).

`tv-mockup.tsx`:
```tsx
      <div className="rounded-xl border-4 border-neutral-800 bg-neutral-800 shadow-lg">
        <div className="relative aspect-video overflow-hidden rounded-md bg-black bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.55),transparent_60%)]">
```
caixa do QR: `bg-[#fff]` com comentário `{/* Branco do QR real da TV, não do tema. */}`; pé: `bg-neutral-800`. (`neutral` não está na lista proibida de propósito: é a moldura física.)

- [ ] **Step 7: Rodar**

Run: `pnpm vitest run src/__tests__/landing-cores.test.ts && pnpm typecheck`
Expected: todos passam.

- [ ] **Step 8: Conferência visual rápida**

Run: `pnpm dev` e abrir `http://localhost:5173/` (porta do log do Vite). Conferir hero, mapa, planos, FAQ, CTA final: nada branco sobrando, botões teal com letra preta.

- [ ] **Step 9: Commit**

```bash
git add -A artifacts/signage/src
git commit -m "feat(portal): landing no tema preto e teal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Favicon, apple-touch-icon, og.png e peças de divulgação

**Files:**
- Modify: `artifacts/signage/public/favicon.svg`
- Create: `artifacts/signage/public/apple-touch-icon.png` (gerado)
- Modify: `artifacts/signage/public/og.png` (gerado), `public/divulgacao/*.png` (gerados)
- Modify: `artifacts/signage/index.html`
- Modify: `marketing/gerar.mjs`, `marketing/estilo.css`
- Create: `marketing/og.css`

**Interfaces:**
- Consumes: `brand/logo.svg`, `brand/logo-mark.svg` (Task 1). `gerar.mjs` embute o SVG lido do disco.

- [ ] **Step 1: `favicon.svg`** — quadrado preto arredondado com o ícone. Copiar os dois `<path>` de `brand/logo-mark.svg` para dentro de:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
<rect width="180" height="180" rx="36" fill="#000"/>
<svg x="18" y="18" width="144" height="144" viewBox="760 3 390 390">
<!-- os dois <path> de brand/logo-mark.svg, idênticos -->
</svg>
</svg>
```

(`viewBox` do `<svg>` interno = `MARK_VIEWBOX`.)

- [ ] **Step 2: `index.html`** — depois de `<link rel="icon" …>`:

```html
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="theme-color" content="#000000" />
```

- [ ] **Step 3: `marketing/estilo.css`** — trocar o comentário da paleta e o `:root`:

```css
 * A paleta acompanha o logo (brand/README.md): preto, branco e teal #28D8B3.
 */

:root {
  --teal: #28d8b3;
  --preto: #000;
  --cartao: #0e0f10;
  --cinza: #9aa3a8;
}
```

e os temas:

```css
/* Peça do anunciante: fundo preto como o logo, teal nos destaques. */
body.tema-marca {
  background: var(--preto);
  color: #fff;
}

/* Peça do ponto: fundo teal, texto preto — a oferta grátis em cor de marca. */
body.tema-claro {
  background: var(--teal);
  color: var(--preto);
}

.marca svg {
  height: 64px;
  width: auto;
}

.tema-marca .itens svg,
.tema-marca .preco strong {
  color: var(--teal);
}

.tema-claro .itens svg {
  color: var(--preto);
}

.tema-marca .cta {
  background: var(--teal);
  color: var(--preto);
}

.tema-claro .cta {
  background: var(--preto);
  color: var(--teal);
}
```

Remover as regras antigas `.marca { … font-size … }`, `.marca svg { width:42px … }`, `.tema-marca .marca`, `.tema-claro .marca`, `.tema-claro .itens svg`, `.tema-marca .cta`, `.tema-claro .cta` que estas substituem. Trocar `font-family` do `body` por `'Outfit', 'Helvetica Neue', Arial, sans-serif` e adicionar no topo do arquivo `@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;700;800&display=swap');`.

- [ ] **Step 4: `marketing/gerar.mjs` — logo no lugar do ícone + texto**

Remover `ICONE_TV`. Adicionar após `const AQUI`:

```js
/**
 * O logo vem do mestre em brand/. Na peça de fundo teal as partes brancas
 * ("smart", "tv") viram pretas e o teal ("vale", ícone) também — teal sobre
 * teal sumiria.
 */
const LOGO = readFileSync(join(AQUI, '..', 'brand', 'logo.svg'), 'utf8').replace(/<title>.*?<\/title>/, '');
const MARCA = readFileSync(join(AQUI, '..', 'brand', 'logo-mark.svg'), 'utf8').replace(/<title>.*?<\/title>/, '');

function logoPara(tema) {
  return tema === 'tema-claro' ? LOGO.replaceAll('#FFFFFF', '#000000').replaceAll('#28D8B3', '#000000') : LOGO;
}
```

No `montarHtml`, trocar `<div class="marca">${ICONE_TV}<span>Smart Vale TV</span></div>` por `<div class="marca">${logoPara(peca.tema)}</div>`.

- [ ] **Step 5: `marketing/gerar.mjs` — og.png e apple-touch-icon**

Criar `marketing/og.css`:

```css
/* Card social 1200×630 (og.png): preto, logo ao centro, frase, faixa teal. */
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { overflow: hidden; }
body {
  width: 1200px; height: 630px; background: #000; color: #fff;
  font-family: 'Outfit', sans-serif;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  border-bottom: 16px solid #28d8b3;
}
.logo svg { height: 190px; width: auto; }
h1 { margin-top: 48px; font-size: 44px; font-weight: 600; }
p { margin-top: 14px; font-size: 28px; color: #9aa3a8; }
body.icone { width: 180px; height: 180px; border: 0; }
body.icone svg { width: 144px; height: 144px; }
```

No fim de `gerar.mjs`, depois do laço das peças, acrescentar:

```js
/**
 * og.png (card do WhatsApp/Facebook) e apple-touch-icon saem do mesmo
 * pipeline das peças para usar o logo mestre, não uma cópia desenhada à mão.
 * WhatsApp e Facebook cacheiam o og.png por URL: link já compartilhado só
 * mostra o card novo depois de um rescrape.
 */
const PUBLICO = join(AQUI, '..', 'artifacts', 'signage', 'public');
const cssOg = readFileSync(join(AQUI, 'og.css'), 'utf8');

const EXTRAS = [
  {
    nome: 'og',
    largura: 1200,
    altura: 630,
    corpo: `<body><div class="logo">${LOGO}</div><h1>Anúncios nas telas do comércio da região</h1><p>Anuncie onde seu público já passa — ou monetize a TV do seu ponto</p></body>`,
  },
  {
    nome: 'apple-touch-icon',
    largura: 180,
    altura: 180,
    corpo: `<body class="icone">${MARCA}</body>`,
  },
];

for (const { nome, largura, altura, corpo } of EXTRAS) {
  const html = join(TEMP, `${nome}.html`);
  const png2x = join(TEMP, `${nome}-2x.png`);
  writeFileSync(html, `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${cssOg}</style></head>${corpo}</html>`);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--force-device-scale-factor=${ESCALA}`, `--window-size=${largura},${altura}`,
    `--screenshot=${png2x}`, `file://${html}`,
  ], { stdio: 'ignore' });
  execFileSync(MAGICK, [png2x, '-filter', 'Lanczos', '-resize', `${largura}x${altura}`, '-strip', join(PUBLICO, `${nome}.png`)], { stdio: 'ignore' });
  console.log(`gerado  ${nome}.png  ${largura}x${altura}`);
}
```

- [ ] **Step 6: Gerar**

Run: `cd /Users/yvillanova/Downloads/tv/Smart-Tv-Ads && node marketing/gerar.mjs`
Expected: 4 linhas `gerado …-feed/story` + `gerado  og.png  1200x630` + `gerado  apple-touch-icon.png  180x180`.

- [ ] **Step 7: Conferir visualmente**

Abrir com Read: `public/og.png`, `public/apple-touch-icon.png`, `public/divulgacao/anunciante-feed.png`, `ponto-feed.png`, `anunciante-story.png`, `ponto-story.png`. Conferir: logo nítido, fonte Outfit carregou (não Arial), nada cortado. Mostrar ao usuário og.png e as 4 peças nominais e **esperar ok** antes do commit (a spec pede que ele veja as peças).

- [ ] **Step 8: Commit**

```bash
git add marketing artifacts/signage/public/favicon.svg artifacts/signage/public/apple-touch-icon.png artifacts/signage/public/og.png artifacts/signage/public/divulgacao artifacts/signage/index.html
git commit -m "feat(portal): favicon, card social e peças de divulgação com o logo novo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `tv.html` e `apk.html`

**Files:**
- Modify: `artifacts/signage/public/tv.html` (CSS ~104–147, markup `#pair-screen` ~217–223)
- Modify: `artifacts/signage/public/apk.html` (CSS 14–66, markup 71–72)
- Test: `artifacts/signage/src/__tests__/tv-html.test.ts` (acrescentar `describe`)

**Interfaces:**
- Consumes: paths de `brand/logo.svg` (copiados literalmente, cores em hex fixo).

- [ ] **Step 1: Teste que falha** — no fim de `tv-html.test.ts`:

```ts
describe('marca na tela de pareamento', () => {
  const MESTRE = readFileSync(resolve(import.meta.dirname, '../../../../brand/logo.svg'), 'utf8');
  const APK = readFileSync(resolve(import.meta.dirname, '../../public/apk.html'), 'utf8');
  const caminhos = Array.from(MESTRE.matchAll(/ d="([^"]+)"/g), (m) => m[1]);

  it('tv.html e apk.html trazem o logo com os paths do mestre', () => {
    expect(caminhos).toHaveLength(5);
    for (const d of caminhos) {
      expect(HTML).toContain(`d="${d}"`);
      expect(APK).toContain(`d="${d}"`);
    }
  });

  it('o logo do tv.html não depende de var() nem currentColor (WebView antigo)', () => {
    const svg = /<div id="pair-logo">([\s\S]*?)<\/div>/.exec(HTML)?.[1] ?? '';
    expect(svg).toContain('<svg');
    expect(svg).not.toMatch(/var\(|currentColor/);
  });

  it('sem as cores antigas', () => {
    for (const cor of ['#4f46e5', '#0b0f19']) expect(HTML.toLowerCase()).not.toContain(cor);
    for (const cor of ['#3d00ff', '#0b0b14', '#15152a', '#2a2a4a', '#b9b9d4', '#d5d5ea']) expect(APK.toLowerCase()).not.toContain(cor);
  });
});
```

(`HTML`, `readFileSync` e `resolve` já existem no topo do arquivo.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run src/__tests__/tv-html.test.ts -t "marca na tela"`
Expected: FAIL — paths ausentes, `#pair-logo` ausente, cores antigas presentes.

- [ ] **Step 3: `tv.html`**

CSS: `#progress-fill { background: #4f46e5; }` → `background: #28d8b3;`. `#pair-screen`: `background: #0b0f19; color: #e5e7eb;` → `background: #000; color: #fff;`. `#pair-url` cor `#9ca3af` → `#9aa3a8`. Acrescentar:

```css
    /* Logo da marca na tela de pareamento. SVG com cores em hex fixo: o
       WebView do Android 5 não resolve var() dentro de SVG. */
    #pair-logo { margin-bottom: 4vh; }
    #pair-logo svg { height: 9vh; width: auto; }
```

Markup: primeira linha dentro de `<div id="pair-screen">`:

```html
    <div id="pair-logo"><!-- conteúdo de brand/logo.svg sem <title>, colado aqui --></div>
```

Cole o `<svg …>…</svg>` inteiro de `brand/logo.svg` (sem a linha `<title>`), mantendo `fill="#FFFFFF"`/`#28D8B3`.

- [ ] **Step 4: `apk.html`**

Trocas no CSS: `background: #0b0b14` → `#000`; `#version` cor `#b9b9d4` → `#9aa3a8`; `#status` `background: #15152a; border: 1px solid #2a2a4a;` → `background: #0e0f10; border: 1px solid #24272a;`; `ol` cor `#d5d5ea` → `#c9d0d3`; `#manual` `background: #3d00ff; color: #fff;` → `background: #28d8b3; color: #000; font-weight: 600;`. Acrescentar:

```css
    #logo { margin-bottom: 32px; }
    #logo svg { height: 56px; width: auto; }
```

Markup: primeira linha dentro de `<div id="wrap">`: `<div id="logo"><!-- mesmo SVG de brand/logo.svg sem <title> --></div>`. Trocar `<title>Baixar o aplicativo</title>` por `<title>Smart Vale TV — baixar o aplicativo</title>`.

- [ ] **Step 5: Rodar toda a suíte do tv.html**

Run: `pnpm vitest run src/__tests__/tv-html.test.ts`
Expected: todos passam (os testes antigos do renderizador continuam verdes).

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/public/tv.html artifacts/signage/public/apk.html artifacts/signage/src/__tests__/tv-html.test.ts
git commit -m "feat(tv): logo e paleta nova na tela de pareamento e no download do app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: App Android — ícone, banner, nome

**Files:**
- Modify: `artifacts/android-tv/app/src/main/res/drawable/ic_launcher.xml`
- Modify: `artifacts/android-tv/app/src/main/res/drawable/banner.xml`
- Modify: `artifacts/android-tv/app/src/main/res/values/strings.xml:3`
- Test: `artifacts/signage/src/__tests__/identidade-visual.test.ts` (criado aqui, completado na Task 9)

**Interfaces:**
- Consumes: paths de `brand/logo.svg` e `MARK_VIEWBOX`/`LOGO_VIEWBOX` (Task 1).

Vector drawable aceita o mesmo `d` do SVG em `android:pathData` (comandos absolutos, sem `transform`, que é o que o opentype.js gera). A transformação de escala fica num `<group>`.

- [ ] **Step 1: Teste que falha** — `identidade-visual.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '../../../..');
const ler = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const MESTRE = ler('brand/logo.svg');
const CAMINHOS = Array.from(MESTRE.matchAll(/ d="([^"]+)"/g), (m) => m[1]);
const RES = 'artifacts/android-tv/app/src/main/res';

describe('app Android com a marca nova', () => {
  it('ícone tem os paths da tela e do play', () => {
    const icone = ler(`${RES}/drawable/ic_launcher.xml`);
    for (const d of CAMINHOS.slice(3)) expect(icone).toContain(`android:pathData="${d}"`);
    expect(icone).toContain('#FF28D8B3');
  });

  it('banner tem o logo completo', () => {
    const banner = ler(`${RES}/drawable/banner.xml`);
    for (const d of CAMINHOS) expect(banner).toContain(`android:pathData="${d}"`);
  });

  it('nome do app é Smart Vale TV', () => {
    expect(ler(`${RES}/values/strings.xml`)).toContain('<string name="app_name">Smart Vale TV</string>');
  });
});
```

(Ordem dos paths no mestre: smart, vale, tv, tela, play — `slice(3)` = tela e play.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run src/__tests__/identidade-visual.test.ts`
Expected: FAIL nos 3.

- [ ] **Step 3: `ic_launcher.xml`** (48dp; mark ocupa 40dp centralizado; escala 40/390 ≈ 0.10256; translação = 4 − 760·0.10256 e 4 − 3·0.10256):

```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- Ícone do app: ícone da marca (brand/logo-mark.svg) em teal sobre preto.
     pathData copiado do mestre; identidade-visual.test.ts confere a cópia. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="48dp"
    android:height="48dp"
    android:viewportWidth="48"
    android:viewportHeight="48">
    <path android:fillColor="#FF000000" android:pathData="M0,0h48v48h-48z" />
    <group
        android:scaleX="0.10256"
        android:scaleY="0.10256"
        android:translateX="-73.95"
        android:translateY="3.69">
        <path
            android:pathData="PATH_TELA do mestre"
            android:strokeColor="#FF28D8B3"
            android:strokeWidth="30"
            android:strokeLineJoin="round" />
        <path
            android:pathData="PATH_PLAY do mestre"
            android:fillColor="#FF28D8B3"
            android:strokeColor="#FF28D8B3"
            android:strokeWidth="14"
            android:strokeLineJoin="round" />
    </group>
</vector>
```

Substituir `PATH_TELA do mestre`/`PATH_PLAY do mestre` pelos valores literais de `logo-paths.ts`.

- [ ] **Step 4: `banner.xml`** (320×180; logo 1170×400 escalado a 260 de largura → 0.2222; altura 88.9; centralizado: translateX = 30, translateY = 45.5):

```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- Banner da launcher Android TV: logo completo (brand/logo.svg) sobre preto.
     pathData copiado do mestre; identidade-visual.test.ts confere a cópia. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="320dp"
    android:height="180dp"
    android:viewportWidth="320"
    android:viewportHeight="180">
    <path android:fillColor="#FF000000" android:pathData="M0,0h320v180h-320z" />
    <group
        android:scaleX="0.2222"
        android:scaleY="0.2222"
        android:translateX="30"
        android:translateY="45.5">
        <path android:fillColor="#FFFFFFFF" android:pathData="PATH_SMART" />
        <path android:fillColor="#FF28D8B3" android:pathData="PATH_VALE" />
        <path android:fillColor="#FFFFFFFF" android:pathData="PATH_TV" />
        <path
            android:pathData="PATH_TELA"
            android:strokeColor="#FF28D8B3"
            android:strokeWidth="30"
            android:strokeLineJoin="round" />
        <path
            android:pathData="PATH_PLAY"
            android:fillColor="#FF28D8B3"
            android:strokeColor="#FF28D8B3"
            android:strokeWidth="14"
            android:strokeLineJoin="round" />
    </group>
</vector>
```

Substituir cada `PATH_*` pelo literal de `logo-paths.ts`. Para não errar à mão, gerar os dois XML com um `node -e` que lê `brand/logo.svg`, extrai os 5 `d` e escreve os arquivos com o template acima.

- [ ] **Step 5: `strings.xml`** — `<string name="app_name">Signage TV</string>` → `<string name="app_name">Smart Vale TV</string>`.

- [ ] **Step 6: Rodar teste + build do APK**

Run:
```bash
cd artifacts/signage && pnpm vitest run src/__tests__/identidade-visual.test.ts
cd ../android-tv && ./gradlew assembleDebug lintDebug
```
Expected: 3 passed; `BUILD SUCCESSFUL` (lint sem erro novo de `VectorPath`/`VectorRaster` como erro — aviso de path longo é aceitável).

- [ ] **Step 7: Conferir o ícone renderizado**

Converter para ver: abrir o XML no Android Studio preview, ou instalar o APK debug num emulador Android TV (`adb install -r app/build/outputs/apk/debug/app-debug.apk`) e tirar screenshot da launcher. Se não houver emulador, registrar isso no PR como verificação pendente em aparelho.

- [ ] **Step 8: Commit**

```bash
git add artifacts/android-tv/app/src/main/res artifacts/signage/src/__tests__/identidade-visual.test.ts
git commit -m "feat(android-tv): ícone, banner e nome Smart Vale TV

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Varredura final, verificação e PR

**Files:**
- Modify: `artifacts/signage/src/__tests__/identidade-visual.test.ts`

- [ ] **Step 1: Teste de varredura** — acrescentar ao arquivo:

```ts
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Tudo que é da plataforma (não de cliente) e pode carregar cor de marca. */
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' || n === 'node_modules' ? [] : arquivos(p);
    return /\.(tsx?|css|html)$/.test(n) ? [p] : [];
  });
}

// Conteúdo de cliente escolhe as próprias cores; não é marca da plataforma.
const CLIENTE = /components\/flyer\/|lib\/promo-visual\.ts$|lib\/flyer-status\.ts$/;

describe('sem resto da identidade antiga', () => {
  const alvos = [
    ...arquivos(resolve(REPO, 'artifacts/signage/src')),
    ...arquivos(resolve(REPO, 'artifacts/signage/public')),
    resolve(REPO, 'artifacts/signage/index.html'),
    resolve(REPO, 'marketing/estilo.css'),
  ].filter((f) => !CLIENTE.test(f));

  const ANTIGAS = [/#ff3c00/i, /#3d00ff/i, /#4f46e5/i, /indigo-\d/, /248 100%/, /MonitorPlay/];

  it.each(alvos.map((f) => [f.replace(REPO + '/', ''), f]))('%s', (_rel, f) => {
    const texto = readFileSync(f, 'utf8');
    expect(ANTIGAS.filter((re) => re.test(texto)).map(String)).toEqual([]);
  });
});
```

(Mover os `import` novos para o topo junto dos existentes.)

- [ ] **Step 2: Rodar**

Run: `pnpm vitest run src/__tests__/identidade-visual.test.ts`
Expected: PASS. Se falhar, corrigir o arquivo apontado (trocar pela cor/token novo equivalente); se for conteúdo de cliente que escapou do filtro, ampliar `CLIENTE` com justificativa no comentário.

- [ ] **Step 3: Suíte inteira + typecheck + build**

Run:
```bash
cd /Users/yvillanova/Downloads/tv/Smart-Tv-Ads
pnpm typecheck
pnpm -r --filter ./artifacts/signage run test
pnpm -r --filter ./artifacts/signage run build
```
Expected: tudo verde. Colar a contagem de testes no PR.

- [ ] **Step 4: Conferência visual no navegador** (skill `run` ou `claude-in-chrome`)

Com `pnpm dev` na signage + API local, abrir e tirar screenshot de: `/` (landing inteira, rolando), `/login`, `/admin`, `/analytics` (gráfico em teal), portal anunciante e portal cliente, `/tv.html` sem device (tela de pareamento), `/apk.html`, uma rota inexistente (404). Conferir: nenhum fundo branco, botões teal com letra preta, logo nítido, foco visível (anel teal) ao navegar com Tab.

- [ ] **Step 5: Prévia de impressão**

No portal anunciante e no cliente, `Imprimir` → prévia/Salvar PDF. Conferir: página branca, texto escuro, cartões brancos, logo preto + teal escuro, gráfico legível.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/src/__tests__/identidade-visual.test.ts
git commit -m "test(portal): varredura contra cores e ícone da identidade antiga

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: PR**

```bash
git push -u origin feat/identidade-visual
gh pr create --title "feat(portal): nova identidade visual preto e teal" --body "$(cat <<'EOF'
Troca a identidade visual inteira para o logo novo e a paleta preto/branco/teal (#28D8B3).

- Logo vetorizado em `brand/` (mestre) e componente `<Logo>` no web
- Tema único escuro; relatório impresso continua em papel branco
- Landing sem cores fixas; mapa, planos e CTA nos tokens
- Favicon, apple-touch-icon, og.png e peças de divulgação regerados
- `tv.html` (pareamento) e `apk.html` com logo e paleta
- App Android: ícone, banner da launcher e nome "Smart Vale TV" (applicationId inalterado; TVs atualizam pelo auto-update)

Atenção: WhatsApp e Facebook cacheiam o og.png por URL. Links já compartilhados só mostram o card novo depois de um rescrape (Facebook Sharing Debugger).

Spec: docs/superpowers/specs/2026-09-25-identidade-visual-design.md
Plano: docs/superpowers/plans/2026-09-25-identidade-visual.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Não mesclar sem o ok do dono.
