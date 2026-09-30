# Apresentação comercial em /apresentacao — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página pública `/apresentacao` com 10 slides em tela cheia para vender a Smart Vale TV cara a cara, com números e peças ao vivo e QR do WhatsApp no fim.

**Architecture:** Nova página React no app web (`artifacts/signage`), fora do `RoleRouter`. Um hook (`useSlideNav`) cuida de slide atual, teclado e hash; um componente por slide; copy nova em `lib/apresentacao-content.ts`, copy existente importada de `LANDING`. O mapa SVG sai de `Cobertura` para um componente próprio, usado pela landing e pelo slide.

**Tech Stack:** React 19 + Vite, wouter, @tanstack/react-query, Tailwind (tokens de tema), vitest + Testing Library (jsdom), `qrcode`.

**Spec:** `docs/superpowers/specs/2026-09-29-apresentacao-comercial-design.md`

## Global Constraints

- Todo comando roda na raiz do repo `/Users/yvillanova/Downloads/tv/Smart-Tv-Ads`; testes do web: `pnpm --filter @workspace/signage test`.
- Branch: `feat/apresentacao-comercial` (já existe, spec commitada). Nunca commitar na `main`.
- Commits: `tipo(escopo): descrição em português`, sem ponto final, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Código e comentários em português, explicando o porquê. Acentos como UTF-8 real, nunca `\uXXXX` (conferir com `grep -rn '\\\\u[0-9a-fA-F]\{4\}'` nos arquivos novos antes de cada commit).
- Nenhum texto de interface dentro de `.tsx` em `components/apresentacao` ou `pages/apresentacao.tsx`: todo texto vem de `APRESENTACAO` ou `LANDING`.
- Só tokens de tema nas cores (`text-foreground`, `bg-primary`, `text-muted-foreground`, `bg-card`, `border-border`, `hsl(var(--primary))`…). Proibido: `zinc|slate|gray-N`, `bg-white`, `indigo-`, `text-white` junto de `bg-primary`, `rgb(` fixo. A única cor fixa permitida é o preto/branco do QR (hex, exigido para leitura pela câmera).
- Nunca mostrar "0 telas ativas": com `activeScreens <= 0` o número some.
- Mensagem do WhatsApp da apresentação: exatamente `Olá! Vi a apresentação da Smart Vale TV.`
- Dependência nova: `qrcode@^1.5.4` e `@types/qrcode@^1.5.6` em `devDependencies` do signage (mesmas versões da API).
- Título do PR: `feat(landing): apresentação comercial em /apresentacao`.

## Review Focus

1. Espaço com um botão focado (ex.: depois de tocar em "Vertical" no mockup da TV) deve acionar o botão e **não** avançar slide; setas continuam navegando. → teste na Task 2.
2. Hash lixo ou fora do intervalo (`#0`, `#11`, `#abc`, `#2.5`, vazio) abre o slide 1 sem quebrar. → teste na Task 2.
3. Avançar vários slides não pode empilhar histórico: o "voltar" do navegador sai da apresentação em vez de desfazer slide a slide. → teste na Task 2.
4. API de stats ainda carregando (4G lento na reunião): slide 4 mostra "24 cidades do Vale do Ribeira" e nenhum número, nunca "0". → teste na Task 4.
5. Navegador sem Fullscreen API (Safari de iPhone): tecla `F` não pode lançar erro; e clique dentro do painel do índice fora dos botões não troca de slide. → testes na Task 7.

---

## Estrutura de arquivos

Todos os caminhos abaixo são relativos a `artifacts/signage/`.

| Arquivo | Responsabilidade |
|---|---|
| `src/components/landing/mapa-vale.tsx` (novo) | SVG do Vale: pinta parceiras, destaca a ativa, clique opcional |
| `src/components/landing/cobertura.tsx` (alterado) | passa a usar `MapaVale` |
| `src/lib/apresentacao-content.ts` (novo) | toda copy nova da apresentação, blocos, dados do relatório de exemplo |
| `src/hooks/use-slide-nav.ts` (novo) | slide atual, limites, teclado de navegação, hash |
| `src/components/apresentacao/slide-shell.tsx` (novo) | moldura de um slide |
| `src/components/apresentacao/slides/*.tsx` (novos) | um componente por slide |
| `src/components/apresentacao/relatorio-mock.tsx` (novo) | tabela + barras do relatório de exemplo |
| `src/components/apresentacao/indice.tsx` (novo) | painel do índice por blocos |
| `src/pages/apresentacao.tsx` (novo) | compõe slides, clique por metade, `F`, `I`, `Esc`, progresso, noindex |
| `src/App.tsx` (alterado) | rota `/apresentacao` |
| `public/robots.txt` (alterado) | `Disallow: /apresentacao` |
| `src/__tests__/landing-cores.test.ts` (alterado) | também varre os arquivos da apresentação |

---

### Task 1: Extrair o mapa do Vale para `MapaVale`

**Files:**
- Create: `artifacts/signage/src/components/landing/mapa-vale.tsx`
- Modify: `artifacts/signage/src/components/landing/cobertura.tsx` (bloco `<svg>…</svg>`, linhas ~98–122)
- Test: `artifacts/signage/src/components/landing/__tests__/mapa-vale.test.tsx`

**Interfaces:**
- Consumes: `VALE_MUNICIPIOS`, `VALE_VIEW_BOX` de `@/lib/mapa-vale`.
- Produces:
  ```ts
  export interface MapaValeProps {
    parceiras: ReadonlySet<string>; // códigos IBGE com parceiro
    ativa?: string | null;          // IBGE destacado em teal cheio
    onSelecionar?: (ibge: string) => void; // sem ele, mapa não é clicável
    className?: string;
  }
  export function MapaVale(props: MapaValeProps): JSX.Element
  ```
  Cada `<path>` tem `data-ibge={ibge}`.

- [ ] **Step 1: Escrever o teste que falha**

`artifacts/signage/src/components/landing/__tests__/mapa-vale.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MapaVale } from '../mapa-vale';

const REGISTRO = '3542602';
const MIRACATU = '3529906';

function path(container: HTMLElement, ibge: string) {
  const el = container.querySelector(`path[data-ibge="${ibge}"]`);
  if (!el) throw new Error(`path ${ibge} não encontrado`);
  return el as SVGPathElement;
}

describe('MapaVale', () => {
  it('desenha os 24 municípios do Vale', () => {
    const { container } = render(<MapaVale parceiras={new Set()} />);
    expect(container.querySelectorAll('path[data-ibge]')).toHaveLength(24);
  });

  it('pinta a ativa, as parceiras e o resto com cores diferentes', () => {
    const { container } = render(
      <MapaVale parceiras={new Set([REGISTRO, MIRACATU])} ativa={REGISTRO} />,
    );
    expect(path(container, REGISTRO).getAttribute('fill')).toBe('hsl(var(--primary))');
    expect(path(container, MIRACATU).getAttribute('fill')).toBe('hsl(var(--primary) / 0.35)');
    expect(path(container, '3553500').getAttribute('fill')).toBe('hsl(var(--muted-foreground) / 0.3)');
  });

  it('só chama onSelecionar ao clicar em cidade parceira', () => {
    const onSelecionar = vi.fn();
    const { container } = render(
      <MapaVale parceiras={new Set([REGISTRO])} onSelecionar={onSelecionar} />,
    );
    fireEvent.click(path(container, '3553500'));
    expect(onSelecionar).not.toHaveBeenCalled();
    fireEvent.click(path(container, REGISTRO));
    expect(onSelecionar).toHaveBeenCalledWith(REGISTRO);
  });

  it('sem onSelecionar nenhuma cidade recebe ponteiro', () => {
    const { container } = render(<MapaVale parceiras={new Set([REGISTRO])} />);
    expect(path(container, REGISTRO).style.pointerEvents).toBe('none');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/landing/__tests__/mapa-vale.test.tsx`
Expected: FAIL — `Failed to resolve import "../mapa-vale"`.

- [ ] **Step 3: Implementar `MapaVale`**

`artifacts/signage/src/components/landing/mapa-vale.tsx`:

```tsx
import { VALE_MUNICIPIOS, VALE_VIEW_BOX } from '@/lib/mapa-vale';

export interface MapaValeProps {
  parceiras: ReadonlySet<string>;
  ativa?: string | null;
  onSelecionar?: (ibge: string) => void;
  className?: string;
}

/**
 * Mapa dos 24 municípios do Vale do Ribeira.
 *
 * Saiu de dentro da seção Cobertura para a apresentação comercial usar o
 * mesmo desenho: duas cópias do SVG divergiriam na primeira troca de cor.
 *
 * É decoração (aria-hidden): quem precisa de seleção acessível põe uma lista
 * de botões ao lado, como a landing faz. Sem `onSelecionar`, nenhuma cidade
 * captura o ponteiro — no slide o toque atravessa o mapa e troca de slide.
 */
export function MapaVale({ parceiras, ativa = null, onSelecionar, className }: MapaValeProps) {
  return (
    <svg viewBox={VALE_VIEW_BOX} className={className} aria-hidden="true">
      {VALE_MUNICIPIOS.map((municipio) => {
        const temParceiro = parceiras.has(municipio.ibge);
        const clicavel = temParceiro && onSelecionar !== undefined;
        return (
          <path
            key={municipio.ibge}
            data-ibge={municipio.ibge}
            d={municipio.path}
            fill={
              municipio.ibge === ativa
                ? 'hsl(var(--primary))'
                : temParceiro
                  ? 'hsl(var(--primary) / 0.35)'
                  : 'hsl(var(--muted-foreground) / 0.3)'
            }
            stroke="hsl(var(--background))"
            strokeWidth={1.5}
            style={{ pointerEvents: clicavel ? 'auto' : 'none', cursor: clicavel ? 'pointer' : 'default' }}
            onClick={clicavel ? () => onSelecionar(municipio.ibge) : undefined}
          />
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/landing/__tests__/mapa-vale.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 5: Trocar o SVG de `Cobertura` pelo componente**

Em `artifacts/signage/src/components/landing/cobertura.tsx`:

1. Trocar o import `import { VALE_MUNICIPIOS, VALE_VIEW_BOX } from '@/lib/mapa-vale';` por:
   ```tsx
   import { VALE_MUNICIPIOS } from '@/lib/mapa-vale';
   import { MapaVale } from './mapa-vale';
   ```
2. Depois de `const parceiras = VALE_MUNICIPIOS.filter(...)`, antes do `if (!data ...)`, adicionar:
   ```tsx
   const idsParceiras = React.useMemo(() => new Set(porCidade.keys()), [porCidade]);
   ```
   (Tem que ficar antes do `return null` para não quebrar a regra dos hooks.)
3. Substituir o bloco inteiro `<svg viewBox={VALE_VIEW_BOX} ...>…</svg>` por:
   ```tsx
   <MapaVale
     parceiras={idsParceiras}
     ativa={ativa}
     onSelecionar={setSelecionada}
     className="mx-auto hidden h-auto w-full max-w-md md:block"
   />
   ```

- [ ] **Step 6: Rodar os testes da landing (Cobertura não pode mudar)**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/landing src/__tests__/landing-cores.test.ts`
Expected: PASS — `cobertura.test.tsx` sem nenhuma alteração passa inteiro; `landing-cores` passa para `mapa-vale.tsx` também.

- [ ] **Step 7: Commit**

```bash
git add artifacts/signage/src/components/landing/mapa-vale.tsx artifacts/signage/src/components/landing/cobertura.tsx artifacts/signage/src/components/landing/__tests__/mapa-vale.test.tsx
git commit -m "refactor(landing): mapa do Vale em componente próprio

A apresentação comercial vai desenhar o mesmo mapa; uma cópia do SVG
divergiria na primeira troca de cor.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Copy da apresentação e hook de navegação

**Files:**
- Create: `artifacts/signage/src/lib/apresentacao-content.ts`
- Create: `artifacts/signage/src/hooks/use-slide-nav.ts`
- Test: `artifacts/signage/src/hooks/__tests__/use-slide-nav.test.tsx`

**Interfaces:**
- Produces (content):
  ```ts
  export const APRESENTACAO: { ... } // formato exato abaixo
  export type Bloco = keyof typeof APRESENTACAO.blocos; // 'comum' | 'anunciante' | 'ponto' | 'fechamento'
  ```
- Produces (hook):
  ```ts
  export function lerSlideDoHash(hash: string, total: number): number; // índice 0-based
  export interface SlideNav { atual: number; total: number; ir(n: number): void; avancar(): void; voltar(): void; }
  export function useSlideNav(total: number): SlideNav;
  ```
  `atual` é 0-based; o hash é 1-based (`#1`…`#10`).

- [ ] **Step 1: Criar a copy**

`artifacts/signage/src/lib/apresentacao-content.ts`:

```ts
/**
 * Texto da apresentação comercial (/apresentacao).
 *
 * Só o que é novo mora aqui. Planos, como funciona e diferenciais vêm de
 * LANDING: preço mudado num lugar só aparece igual no site e na reunião.
 */
export const APRESENTACAO = {
  navegacao: {
    indice: 'Índice',
    fecharIndice: 'Fechar índice',
    slide: 'Slide',
    progresso: 'Progresso da apresentação',
  },
  blocos: {
    comum: 'Visão geral',
    anunciante: 'Para quem anuncia',
    ponto: 'Para quem tem um ponto',
    fechamento: 'Próximo passo',
  },
  capa: {
    tagline: 'Anúncios nas telas do comércio do Vale do Ribeira',
  },
  problema: {
    eyebrow: 'O problema',
    titulo: 'Anunciar perto do cliente ainda é difícil',
    itens: [
      {
        titulo: 'Panfleto vai pro lixo',
        corpo: 'Custa impressão e entrega, e quase ninguém lê até o fim.',
      },
      {
        titulo: 'Rede social é disputada',
        corpo: 'O seu post briga com todo mundo, e quem vê pode nem estar na sua cidade.',
      },
      {
        titulo: 'Mídia tradicional custa caro',
        corpo: 'Rádio e outdoor cobram preço de cidade grande para falar com a região inteira.',
      },
    ],
  },
  solucao: {
    eyebrow: 'A solução',
    titulo: 'A sua marca dentro do comércio da região',
    corpo:
      'TVs instaladas nos estabelecimentos passam os anúncios o dia inteiro, onde o cliente já está. Esta é a programação no ar agora.',
  },
  rede: {
    eyebrow: 'A rede hoje',
    cidadesComParceiros: 'cidades com pontos parceiros',
  },
  resultado: {
    eyebrow: 'Para quem anuncia',
    titulo: 'Você acompanha cada peça',
    corpo: 'Exibições registradas pela própria TV e leituras do QR code, anúncio a anúncio.',
    selo: 'Dados de exemplo',
    periodo: 'Últimos 30 dias',
    colunas: { peca: 'Peça', exibicoes: 'Exibições', leituras: 'Leituras do QR' },
    pecas: [
      { nome: 'Promoção de pizza', exibicoes: 4320, leituras: 87 },
      { nome: 'Cardápio da semana', exibicoes: 3910, leituras: 52 },
      { nome: 'Delivery grátis', exibicoes: 2750, leituras: 64 },
    ],
  },
  planoAnunciante: { eyebrow: 'Para quem anuncia' },
  planoPonto: { eyebrow: 'Para quem tem um ponto' },
  fechamento: {
    titulo: 'Vamos conversar',
    corpo: 'Aponte a câmera do celular e fale com a gente no WhatsApp.',
    message: 'Olá! Vi a apresentação da Smart Vale TV.',
    qrLabel: 'QR code para falar com a Smart Vale TV no WhatsApp',
    linkLabel: 'Abrir o WhatsApp',
  },
} as const;

export type Bloco = keyof typeof APRESENTACAO.blocos;
```

- [ ] **Step 2: Escrever o teste do hook que falha**

`artifacts/signage/src/hooks/__tests__/use-slide-nav.test.tsx`:

```tsx
import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lerSlideDoHash, useSlideNav } from '../use-slide-nav';

beforeEach(() => {
  window.history.replaceState(null, '', '/apresentacao');
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('lerSlideDoHash', () => {
  it.each([
    ['#1', 0],
    ['#3', 2],
    ['#10', 9],
  ])('%s abre o índice %i', (hash, esperado) => {
    expect(lerSlideDoHash(hash, 10)).toBe(esperado);
  });

  it.each(['', '#', '#0', '#11', '#abc', '#2.5', '#-1'])('hash "%s" cai no primeiro slide', (hash) => {
    expect(lerSlideDoHash(hash, 10)).toBe(0);
  });
});

describe('useSlideNav', () => {
  it('abre no slide do hash', () => {
    window.history.replaceState(null, '', '/apresentacao#4');
    const { result } = renderHook(() => useSlideNav(10));
    expect(result.current.atual).toBe(3);
  });

  it('seta direita, espaço e PageDown avançam; seta esquerda e PageUp voltam', () => {
    const { result } = renderHook(() => useSlideNav(10));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: 'PageDown' });
    expect(result.current.atual).toBe(3);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'PageUp' });
    expect(result.current.atual).toBe(1);
  });

  it('não passa do último nem volta antes do primeiro', () => {
    const { result } = renderHook(() => useSlideNav(3));
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(result.current.atual).toBe(0);
    for (let i = 0; i < 5; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(result.current.atual).toBe(2);
  });

  it('ir() limita ao intervalo', () => {
    const { result } = renderHook(() => useSlideNav(10));
    act(() => result.current.ir(7));
    expect(result.current.atual).toBe(7);
    act(() => result.current.ir(50));
    expect(result.current.atual).toBe(9);
    act(() => result.current.ir(-2));
    expect(result.current.atual).toBe(0);
  });

  it('grava o slide atual no hash', () => {
    const { result } = renderHook(() => useSlideNav(10));
    act(() => result.current.avancar());
    act(() => result.current.avancar());
    expect(window.location.hash).toBe('#3');
    expect(window.location.pathname).toBe('/apresentacao');
  });

  it('trocar de slide não empilha histórico', () => {
    const antes = window.history.length;
    const { result } = renderHook(() => useSlideNav(10));
    for (let i = 0; i < 4; i++) act(() => result.current.avancar());
    expect(window.history.length).toBe(antes);
  });

  it('espaço com botão focado é clique no botão, não troca de slide', () => {
    const { result } = renderHook(() => useSlideNav(10));
    const botao = document.createElement('button');
    document.body.appendChild(botao);
    fireEvent.keyDown(botao, { key: ' ' });
    expect(result.current.atual).toBe(0);
    // Seta continua navegando mesmo com o botão focado.
    fireEvent.keyDown(botao, { key: 'ArrowRight' });
    expect(result.current.atual).toBe(1);
  });

  it('ignora atalhos com Ctrl, Alt ou Cmd', () => {
    const { result } = renderHook(() => useSlideNav(10));
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true });
    fireEvent.keyDown(window, { key: 'ArrowRight', metaKey: true });
    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true });
    expect(result.current.atual).toBe(0);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/hooks/__tests__/use-slide-nav.test.tsx`
Expected: FAIL — `Failed to resolve import "../use-slide-nav"`.

- [ ] **Step 4: Implementar o hook**

`artifacts/signage/src/hooks/use-slide-nav.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

/**
 * Hash 1-based (`#1`…`#N`) para índice 0-based. Qualquer coisa fora disso
 * abre o primeiro slide: link colado errado não pode deixar a tela vazia na
 * frente do cliente.
 */
export function lerSlideDoHash(hash: string, total: number): number {
  const texto = hash.replace(/^#/, '');
  if (!/^\d+$/.test(texto)) return 0;
  const n = Number(texto);
  return n >= 1 && n <= total ? n - 1 : 0;
}

export interface SlideNav {
  atual: number;
  total: number;
  ir(n: number): void;
  avancar(): void;
  voltar(): void;
}

// PageUp/PageDown são o que os passadores de slide de bolso mandam.
const AVANCAR = new Set(['ArrowRight', ' ', 'PageDown']);
const VOLTAR = new Set(['ArrowLeft', 'PageUp']);

export function useSlideNav(total: number): SlideNav {
  const [atual, setAtual] = useState(() => lerSlideDoHash(window.location.hash, total));

  const ir = useCallback(
    (n: number) => setAtual(Math.min(Math.max(n, 0), total - 1)),
    [total],
  );
  const avancar = useCallback(() => setAtual((a) => Math.min(a + 1, total - 1)), [total]);
  const voltar = useCallback(() => setAtual((a) => Math.max(a - 1, 0)), []);

  // replaceState, não pushState: o "voltar" do navegador sai da
  // apresentação, em vez de desfazer slide a slide. O hash só existe para
  // um recarregamento no meio da reunião voltar ao mesmo slide.
  useEffect(() => {
    window.history.replaceState(window.history.state, '', `#${atual + 1}`);
  }, [atual]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      // Espaço num botão focado é clique nele (ex.: girar a TV do mockup).
      const alvo = e.target instanceof Element ? e.target : null;
      if (e.key === ' ' && alvo?.closest('button, a, input, textarea, select')) return;
      if (AVANCAR.has(e.key)) {
        e.preventDefault();
        avancar();
      } else if (VOLTAR.has(e.key)) {
        e.preventDefault();
        voltar();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [avancar, voltar]);

  return { atual, total, ir, avancar, voltar };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/hooks/__tests__/use-slide-nav.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/src/lib/apresentacao-content.ts artifacts/signage/src/hooks/use-slide-nav.ts artifacts/signage/src/hooks/__tests__/use-slide-nav.test.tsx
git commit -m "feat(landing): copy e navegação da apresentação comercial

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Moldura do slide e slides de conteúdo (1, 2, 5, 6, 8, 9)

**Files:**
- Create: `artifacts/signage/src/components/apresentacao/slide-shell.tsx`
- Create: `artifacts/signage/src/components/apresentacao/slides/capa.tsx`
- Create: `artifacts/signage/src/components/apresentacao/slides/problema.tsx`
- Create: `artifacts/signage/src/components/apresentacao/slides/como-funciona.tsx`
- Create: `artifacts/signage/src/components/apresentacao/slides/diferenciais.tsx`
- Create: `artifacts/signage/src/components/apresentacao/slides/plano-anunciante.tsx`
- Create: `artifacts/signage/src/components/apresentacao/slides/plano-ponto.tsx`
- Modify: `artifacts/signage/src/__tests__/landing-cores.test.ts` (lista `ARQUIVOS`)
- Test: `artifacts/signage/src/components/apresentacao/__tests__/slides-conteudo.test.tsx`

**Interfaces:**
- Consumes: `APRESENTACAO` (Task 2), `LANDING` de `@/lib/landing-content`, `Logo` de `@/components/brand/logo`.
- Produces:
  ```ts
  export function SlideShell(props: { eyebrow?: string; titulo?: string; children?: React.ReactNode }): JSX.Element
  export function SlideCapa(): JSX.Element
  export function SlideProblema(): JSX.Element
  export function SlideComoFunciona(): JSX.Element
  export function SlideDiferenciais(): JSX.Element
  export function SlidePlanoAnunciante(): JSX.Element
  export function SlidePlanoPonto(): JSX.Element
  ```
  `SlideShell` renderiza `<section aria-roledescription="slide" aria-label={titulo}>` e o título como `<h2>`.

- [ ] **Step 1: Escrever o teste que falha**

`artifacts/signage/src/components/apresentacao/__tests__/slides-conteudo.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { LANDING } from '@/lib/landing-content';
import { SlideCapa } from '../slides/capa';
import { SlideProblema } from '../slides/problema';
import { SlideComoFunciona } from '../slides/como-funciona';
import { SlideDiferenciais } from '../slides/diferenciais';
import { SlidePlanoAnunciante } from '../slides/plano-anunciante';
import { SlidePlanoPonto } from '../slides/plano-ponto';

describe('slides de conteúdo', () => {
  it('capa mostra o logo e a frase', () => {
    render(<SlideCapa />);
    expect(screen.getByRole('img', { name: 'Smart Vale TV' })).toBeInTheDocument();
    expect(screen.getByText(APRESENTACAO.capa.tagline)).toBeInTheDocument();
  });

  it('problema lista as três dores', () => {
    render(<SlideProblema />);
    expect(screen.getByRole('heading', { level: 2, name: APRESENTACAO.problema.titulo })).toBeInTheDocument();
    for (const item of APRESENTACAO.problema.itens) {
      expect(screen.getByText(item.titulo)).toBeInTheDocument();
    }
  });

  it('como funciona mostra as duas trilhas com todos os passos', () => {
    render(<SlideComoFunciona />);
    for (const trilha of LANDING.howItWorks.tracks) {
      expect(screen.getByRole('heading', { level: 3, name: trilha.title })).toBeInTheDocument();
      for (const passo of trilha.steps) expect(screen.getByText(passo.title)).toBeInTheDocument();
    }
  });

  it('diferenciais mostra os quatro itens', () => {
    render(<SlideDiferenciais />);
    for (const item of LANDING.differentials.items) {
      expect(screen.getByText(item.title)).toBeInTheDocument();
    }
  });

  it('plano do anunciante mostra preço, prazos e o que inclui', () => {
    render(<SlidePlanoAnunciante />);
    const plano = LANDING.plans.advertiser;
    expect(screen.getByText(plano.price)).toBeInTheDocument();
    for (const termo of plano.terms) expect(screen.getByText(termo.value)).toBeInTheDocument();
    for (const f of plano.features) expect(screen.getByText(f)).toBeInTheDocument();
  });

  it('plano do ponto mostra que é grátis e o que o ponto ganha', () => {
    render(<SlidePlanoPonto />);
    const plano = LANDING.plans.host;
    expect(screen.getByText(plano.price)).toBeInTheDocument();
    for (const f of plano.features) expect(screen.getByText(f)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/apresentacao/__tests__/slides-conteudo.test.tsx`
Expected: FAIL — `Failed to resolve import "../slides/capa"`.

- [ ] **Step 3: Implementar a moldura**

`artifacts/signage/src/components/apresentacao/slide-shell.tsx`:

```tsx
import type { ReactNode } from 'react';

/**
 * Moldura de um slide. Tipografia maior que a da landing: a apresentação é
 * lida do outro lado da mesa ou numa TV na parede, não a um palmo do rosto.
 */
export function SlideShell({
  eyebrow,
  titulo,
  children,
}: {
  eyebrow?: string;
  titulo?: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-roledescription="slide"
      aria-label={titulo}
      className="flex min-h-full w-full flex-col justify-center px-6 py-12 sm:px-12 lg:px-20"
    >
      <div className="mx-auto w-full max-w-6xl">
        {eyebrow ? (
          <p className="text-sm font-semibold uppercase tracking-widest text-primary sm:text-base">{eyebrow}</p>
        ) : null}
        {titulo ? (
          <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
            {titulo}
          </h2>
        ) : null}
        <div className={titulo ? 'mt-8 sm:mt-12' : undefined}>{children}</div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Implementar os seis slides**

`artifacts/signage/src/components/apresentacao/slides/capa.tsx`:

```tsx
import { Logo } from '@/components/brand/logo';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { SlideShell } from '../slide-shell';

export function SlideCapa() {
  return (
    <SlideShell>
      <div className="flex flex-col items-center gap-8 text-center">
        <Logo className="h-16 text-foreground sm:h-28" />
        <p className="max-w-3xl text-2xl leading-snug text-muted-foreground sm:text-4xl">
          {APRESENTACAO.capa.tagline}
        </p>
      </div>
    </SlideShell>
  );
}
```

`artifacts/signage/src/components/apresentacao/slides/problema.tsx`:

```tsx
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { SlideShell } from '../slide-shell';

export function SlideProblema() {
  const { eyebrow, titulo, itens } = APRESENTACAO.problema;
  return (
    <SlideShell eyebrow={eyebrow} titulo={titulo}>
      <ul className="grid gap-6 md:grid-cols-3">
        {itens.map((item) => (
          <li key={item.titulo} className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-xl font-semibold text-foreground sm:text-2xl">{item.titulo}</h3>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{item.corpo}</p>
          </li>
        ))}
      </ul>
    </SlideShell>
  );
}
```

`artifacts/signage/src/components/apresentacao/slides/como-funciona.tsx`:

```tsx
import { LANDING } from '@/lib/landing-content';
import { SlideShell } from '../slide-shell';

export function SlideComoFunciona() {
  const { title, tracks } = LANDING.howItWorks;
  return (
    <SlideShell titulo={title}>
      <div className="grid gap-8 md:grid-cols-2">
        {tracks.map((trilha) => (
          <div key={trilha.id} className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-xl font-semibold text-primary sm:text-2xl">{trilha.title}</h3>
            <ol className="mt-6 space-y-5">
              {trilha.steps.map((passo, i) => (
                <li key={passo.title} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-foreground">{passo.title}</p>
                    <p className="mt-1 text-base text-muted-foreground">{passo.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}
```

`artifacts/signage/src/components/apresentacao/slides/diferenciais.tsx`:

```tsx
import { LANDING } from '@/lib/landing-content';
import { SlideShell } from '../slide-shell';

export function SlideDiferenciais() {
  const { title, items } = LANDING.differentials;
  return (
    <SlideShell titulo={title}>
      <ul className="grid gap-6 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.title} className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-xl font-semibold text-foreground sm:text-2xl">{item.title}</h3>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{item.body}</p>
          </li>
        ))}
      </ul>
    </SlideShell>
  );
}
```

`artifacts/signage/src/components/apresentacao/slides/plano-anunciante.tsx`:

```tsx
import { Check } from 'lucide-react';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { LANDING } from '@/lib/landing-content';
import { SlideShell } from '../slide-shell';

export function SlidePlanoAnunciante() {
  const plano = LANDING.plans.advertiser;
  return (
    <SlideShell eyebrow={APRESENTACAO.planoAnunciante.eyebrow} titulo={plano.title}>
      <div className="grid gap-10 md:grid-cols-2 md:items-start">
        <div>
          <p className="flex items-baseline gap-2">
            <span className="text-6xl font-semibold tracking-tight text-primary sm:text-7xl">{plano.price}</span>
            <span className="text-2xl text-muted-foreground">{plano.period}</span>
          </p>
          <p className="mt-2 text-lg text-muted-foreground">{plano.note}</p>
          <p className="mt-8 text-base font-semibold text-foreground">{plano.termsLabel}</p>
          <dl className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {plano.terms.map((termo) => (
              <div key={termo.label} className="flex items-baseline justify-between gap-4 px-5 py-3">
                <dt className="text-base text-muted-foreground">{termo.label}</dt>
                <dd className="text-right">
                  <span className="text-lg font-semibold text-foreground">{termo.value}</span>
                  {'hint' in termo ? (
                    <span className="block text-sm text-muted-foreground">{termo.hint}</span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <ul className="space-y-4">
          {plano.features.map((f) => (
            <li key={f} className="flex gap-3 text-lg text-foreground">
              <Check className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </SlideShell>
  );
}
```

`artifacts/signage/src/components/apresentacao/slides/plano-ponto.tsx`:

```tsx
import { Check } from 'lucide-react';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { LANDING } from '@/lib/landing-content';
import { SlideShell } from '../slide-shell';

export function SlidePlanoPonto() {
  const plano = LANDING.plans.host;
  return (
    <SlideShell eyebrow={APRESENTACAO.planoPonto.eyebrow} titulo={plano.title}>
      <div className="grid gap-10 md:grid-cols-2 md:items-start">
        <div>
          <p className="text-6xl font-semibold tracking-tight text-primary sm:text-7xl">{plano.price}</p>
          <p className="mt-2 text-lg text-muted-foreground">{plano.note}</p>
        </div>
        <ul className="space-y-4">
          {plano.features.map((f) => (
            <li key={f} className="flex gap-3 text-lg text-foreground">
              <Check className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </SlideShell>
  );
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/apresentacao/__tests__/slides-conteudo.test.tsx`
Expected: PASS (6 testes).

- [ ] **Step 6: Estender a varredura de cores fixas à apresentação**

Em `artifacts/signage/src/__tests__/landing-cores.test.ts`, trocar a constante `ARQUIVOS` por:

```ts
const ARQUIVOS = [
  'pages/landing.tsx',
  'pages/apresentacao.tsx',
  ...readdirSync(resolve(RAIZ, 'components/landing')).map((f) => `components/landing/${f}`),
  // A apresentação usa o mesmo tema escuro; mesma armadilha de cor fixa.
  ...readdirSync(resolve(RAIZ, 'components/apresentacao'), { recursive: true, encoding: 'utf8' })
    .filter((f) => !f.includes('__tests__'))
    .map((f) => `components/apresentacao/${f}`),
].filter((f) => f.endsWith('.tsx') && existsSync(resolve(RAIZ, f)));
```

e o import da primeira linha por:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
```

(`existsSync` porque `pages/apresentacao.tsx` só nasce na Task 7; depois dela o arquivo entra na varredura sozinho.) Atualizar também o comentário do bloco para: "A landing e a apresentação usam só tokens de tema."

- [ ] **Step 7: Rodar a varredura**

Run: `pnpm --filter @workspace/signage exec vitest run src/__tests__/landing-cores.test.ts`
Expected: PASS, com os arquivos `components/apresentacao/slide-shell.tsx` e `components/apresentacao/slides/*.tsx` listados no relatório.

- [ ] **Step 8: Commit**

```bash
git add artifacts/signage/src/components/apresentacao artifacts/signage/src/__tests__/landing-cores.test.ts
git commit -m "feat(landing): slides de conteúdo da apresentação comercial

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Slides ao vivo — solução (TV) e rede (mapa + números)

**Files:**
- Create: `artifacts/signage/src/components/apresentacao/slides/solucao.tsx`
- Create: `artifacts/signage/src/components/apresentacao/slides/rede.tsx`
- Test: `artifacts/signage/src/components/apresentacao/__tests__/slides-ao-vivo.test.tsx`

**Interfaces:**
- Consumes: `TvMockup` de `@/components/landing/tv-mockup`, `MapaVale` (Task 1), `usePublicStats` de `@/hooks/use-public-stats` (retorna `PublicStats | null`; query key `['public-stats']`), `VALE_MUNICIPIOS`, `APRESENTACAO`, `LANDING.cobertura`, `SlideShell` (Task 3).
- Produces: `export function SlideSolucao(): JSX.Element`, `export function SlideRede(): JSX.Element`.

- [ ] **Step 1: Escrever o teste que falha**

`artifacts/signage/src/components/apresentacao/__tests__/slides-ao-vivo.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { LANDING } from '@/lib/landing-content';
import { SlideRede } from '../slides/rede';
import { SlideSolucao } from '../slides/solucao';

const BASE = { plays30d: 10, clients: 5, segments: 3 };

function stubFetch(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) })),
  );
}

function renderCom(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { client, ...utils };
}

async function esperarStats(client: QueryClient) {
  await waitFor(() => {
    expect(client.getQueryState(['public-stats'])?.status).not.toBe('pending');
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('SlideSolucao', () => {
  it('mostra o título e a TV (cai no exemplo sem API)', async () => {
    stubFetch({}, false);
    renderCom(<SlideSolucao />);
    expect(screen.getByRole('heading', { level: 2, name: APRESENTACAO.solucao.titulo })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: LANDING.mockup.portrait })).toBeInTheDocument();
  });
});

describe('SlideRede', () => {
  it('mostra telas ativas, cidades com parceiros e o mapa', async () => {
    stubFetch({
      ...BASE,
      activeScreens: 12,
      cities: [
        { ibge: '3542602', companies: 9 },
        { ibge: '3529906', companies: 2 },
      ],
    });
    const { container } = renderCom(<SlideRede />);
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText(LANDING.cobertura.screensLabel)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(APRESENTACAO.rede.cidadesComParceiros)).toBeInTheDocument();
    expect(container.querySelectorAll('path[data-ibge]')).toHaveLength(24);
  });

  it('com zero telas ativas não mostra o número', async () => {
    stubFetch({ ...BASE, activeScreens: 0, cities: [{ ibge: '3542602', companies: 9 }] });
    const { client } = renderCom(<SlideRede />);
    await esperarStats(client);
    expect(screen.queryByText(LANDING.cobertura.screensLabel)).not.toBeInTheDocument();
    expect(screen.getByText(LANDING.cobertura.regionLabel)).toBeInTheDocument();
  });

  it('com a API fora mostra só a frase das 24 cidades', async () => {
    stubFetch({}, false);
    const { client, container } = renderCom(<SlideRede />);
    await esperarStats(client);
    expect(screen.getByText(LANDING.cobertura.regionLabel)).toBeInTheDocument();
    expect(screen.queryByText(LANDING.cobertura.screensLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(APRESENTACAO.rede.cidadesComParceiros)).not.toBeInTheDocument();
    expect(container.querySelector('path[data-ibge]')).toBeNull();
  });

  it('enquanto carrega já mostra as 24 cidades e nenhum número', () => {
    // fetch que nunca resolve: 4G lento no meio da reunião.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    renderCom(<SlideRede />);
    expect(screen.getByText(LANDING.cobertura.regionLabel)).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/apresentacao/__tests__/slides-ao-vivo.test.tsx`
Expected: FAIL — `Failed to resolve import "../slides/rede"`.

- [ ] **Step 3: Implementar os dois slides**

`artifacts/signage/src/components/apresentacao/slides/solucao.tsx`:

```tsx
import { TvMockup } from '@/components/landing/tv-mockup';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { SlideShell } from '../slide-shell';

/**
 * A TV da landing, com as peças que estão no ar de verdade. Os botões de
 * orientação são `button`, então tocar neles não troca de slide.
 */
export function SlideSolucao() {
  const { eyebrow, titulo, corpo } = APRESENTACAO.solucao;
  return (
    <SlideShell eyebrow={eyebrow} titulo={titulo}>
      <div className="grid gap-10 md:grid-cols-[2fr_3fr] md:items-center">
        <p className="text-lg leading-relaxed text-muted-foreground sm:text-2xl">{corpo}</p>
        <TvMockup />
      </div>
    </SlideShell>
  );
}
```

`artifacts/signage/src/components/apresentacao/slides/rede.tsx`:

```tsx
import { useMemo } from 'react';
import { MapaVale } from '@/components/landing/mapa-vale';
import { usePublicStats } from '@/hooks/use-public-stats';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { LANDING } from '@/lib/landing-content';
import { VALE_MUNICIPIOS } from '@/lib/mapa-vale';
import { SlideShell } from '../slide-shell';

const format = new Intl.NumberFormat('pt-BR');

/**
 * A rede em números, ao vivo. Diferente da landing, o slide nunca some: a
 * reunião segue no roteiro mesmo com a API fora. O que some é o número que
 * não ajuda — telas ativas zeradas (madrugada, queda de internet) e o mapa
 * sem nenhum parceiro. "24 cidades do Vale do Ribeira" fica sempre.
 */
export function SlideRede() {
  const { data } = usePublicStats();

  const parceiras = useMemo(() => {
    // Só conta cidade que está entre as 24 do mapa, mesma regra da landing.
    const doVale = new Set(VALE_MUNICIPIOS.map((m) => m.ibge));
    return new Set((data?.cities ?? []).map((c) => c.ibge).filter((ibge) => doVale.has(ibge)));
  }, [data]);

  const telas = data?.activeScreens ?? 0;

  return (
    <SlideShell eyebrow={APRESENTACAO.rede.eyebrow} titulo={LANDING.cobertura.title}>
      <div className="grid gap-10 md:grid-cols-2 md:items-center">
        <div className="space-y-6">
          {telas > 0 ? (
            <p>
              <span className="block text-6xl font-semibold tracking-tight text-primary sm:text-7xl">
                {format.format(telas)}
              </span>
              <span className="text-xl text-muted-foreground">{LANDING.cobertura.screensLabel}</span>
            </p>
          ) : null}
          {parceiras.size > 0 ? (
            <p>
              <span className="block text-5xl font-semibold tracking-tight text-foreground">
                {format.format(parceiras.size)}
              </span>
              <span className="text-xl text-muted-foreground">{APRESENTACAO.rede.cidadesComParceiros}</span>
            </p>
          ) : null}
          <p className="text-2xl font-semibold text-foreground">{LANDING.cobertura.regionLabel}</p>
        </div>
        {parceiras.size > 0 ? (
          <MapaVale parceiras={parceiras} className="mx-auto h-auto w-full max-w-xl" />
        ) : null}
      </div>
    </SlideShell>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/apresentacao/__tests__/slides-ao-vivo.test.tsx src/__tests__/landing-cores.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/components/apresentacao/slides/solucao.tsx artifacts/signage/src/components/apresentacao/slides/rede.tsx artifacts/signage/src/components/apresentacao/__tests__/slides-ao-vivo.test.tsx
git commit -m "feat(landing): slides com a TV e a rede ao vivo na apresentação

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Relatório de exemplo do anunciante (slide 7)

**Files:**
- Create: `artifacts/signage/src/components/apresentacao/relatorio-mock.tsx`
- Create: `artifacts/signage/src/components/apresentacao/slides/resultado.tsx`
- Test: `artifacts/signage/src/components/apresentacao/__tests__/resultado.test.tsx`

**Interfaces:**
- Consumes: `APRESENTACAO.resultado` (Task 2), `SlideShell` (Task 3).
- Produces: `export function RelatorioMock(): JSX.Element`, `export function SlideResultado(): JSX.Element`.

- [ ] **Step 1: Escrever o teste que falha**

`artifacts/signage/src/components/apresentacao/__tests__/resultado.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { SlideResultado } from '../slides/resultado';

const R = APRESENTACAO.resultado;
const fmt = new Intl.NumberFormat('pt-BR');

describe('SlideResultado', () => {
  it('avisa que os dados são de exemplo', () => {
    render(<SlideResultado />);
    expect(screen.getByText(R.selo)).toBeInTheDocument();
  });

  it('mostra uma linha por peça com exibições e leituras formatadas', () => {
    render(<SlideResultado />);
    const tabela = screen.getByRole('table');
    expect(within(tabela).getAllByRole('row')).toHaveLength(R.pecas.length + 1);
    for (const peca of R.pecas) {
      const linha = within(tabela).getByRole('row', { name: new RegExp(peca.nome) });
      expect(within(linha).getByText(fmt.format(peca.exibicoes))).toBeInTheDocument();
      expect(within(linha).getByText(fmt.format(peca.leituras))).toBeInTheDocument();
    }
  });

  it('a barra da peça com mais exibições ocupa a largura toda', () => {
    const { container } = render(<SlideResultado />);
    const barras = [...container.querySelectorAll<HTMLElement>('[data-barra]')];
    expect(barras).toHaveLength(R.pecas.length);
    expect(barras.map((b) => b.style.width)).toContain('100%');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/apresentacao/__tests__/resultado.test.tsx`
Expected: FAIL — `Failed to resolve import "../slides/resultado"`.

- [ ] **Step 3: Implementar**

`artifacts/signage/src/components/apresentacao/relatorio-mock.tsx`:

```tsx
import { APRESENTACAO } from '@/lib/apresentacao-content';

const fmt = new Intl.NumberFormat('pt-BR');

/**
 * Relatório de exemplo, no formato do portal do anunciante. Dados fictícios
 * de propósito: print de cliente real expõe o cliente. O selo fica sempre
 * visível para ninguém sair da reunião achando que o número é da rede.
 */
export function RelatorioMock() {
  const { selo, periodo, colunas, pecas } = APRESENTACAO.resultado;
  const maior = Math.max(...pecas.map((p) => p.exibicoes));

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-muted-foreground">{periodo}</p>
        <span className="rounded-full border border-primary px-3 py-1 text-sm font-semibold text-primary">
          {selo}
        </span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="text-sm text-muted-foreground">
            <th scope="col" className="pb-3 font-medium">{colunas.peca}</th>
            <th scope="col" className="pb-3 text-right font-medium">{colunas.exibicoes}</th>
            <th scope="col" className="pb-3 text-right font-medium">{colunas.leituras}</th>
          </tr>
        </thead>
        <tbody>
          {pecas.map((peca) => (
            <tr key={peca.nome} className="border-t border-border">
              <th scope="row" className="py-4 pr-4 font-normal">
                <span className="text-lg text-foreground">{peca.nome}</span>
                <span className="mt-2 block h-2 w-full rounded-full bg-muted">
                  <span
                    data-barra
                    className="block h-2 rounded-full bg-primary"
                    style={{ width: `${Math.round((peca.exibicoes / maior) * 100)}%` }}
                  />
                </span>
              </th>
              <td className="py-4 text-right text-lg font-semibold text-foreground">{fmt.format(peca.exibicoes)}</td>
              <td className="py-4 text-right text-lg font-semibold text-primary">{fmt.format(peca.leituras)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`artifacts/signage/src/components/apresentacao/slides/resultado.tsx`:

```tsx
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { RelatorioMock } from '../relatorio-mock';
import { SlideShell } from '../slide-shell';

export function SlideResultado() {
  const { eyebrow, titulo, corpo } = APRESENTACAO.resultado;
  return (
    <SlideShell eyebrow={eyebrow} titulo={titulo}>
      <div className="grid gap-10 md:grid-cols-[2fr_3fr] md:items-center">
        <p className="text-lg leading-relaxed text-muted-foreground sm:text-2xl">{corpo}</p>
        <RelatorioMock />
      </div>
    </SlideShell>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/apresentacao/__tests__/resultado.test.tsx src/__tests__/landing-cores.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/components/apresentacao/relatorio-mock.tsx artifacts/signage/src/components/apresentacao/slides/resultado.tsx artifacts/signage/src/components/apresentacao/__tests__/resultado.test.tsx
git commit -m "feat(landing): relatório de exemplo na apresentação comercial

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Slide de fechamento com QR do WhatsApp (slide 10)

**Files:**
- Modify: `artifacts/signage/package.json` (devDependencies) e `pnpm-lock.yaml` (via pnpm)
- Create: `artifacts/signage/src/components/apresentacao/slides/fechamento.tsx`
- Test: `artifacts/signage/src/components/apresentacao/__tests__/fechamento.test.tsx`

**Interfaces:**
- Consumes: `whatsappUrl` de `@/lib/landing-content`, `APRESENTACAO.fechamento` (Task 2), `SlideShell` (Task 3).
- Produces: `export function SlideFechamento(): JSX.Element`.

- [ ] **Step 1: Adicionar a dependência**

Run: `pnpm --filter @workspace/signage add -D qrcode@^1.5.4 @types/qrcode@^1.5.6`
Expected: `package.json` do signage ganha as duas entradas em `devDependencies`; lockfile atualizado sem baixar versão nova (já resolvida pela API).

- [ ] **Step 2: Escrever o teste que falha**

`artifacts/signage/src/components/apresentacao/__tests__/fechamento.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import QRCode from 'qrcode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { whatsappUrl } from '@/lib/landing-content';
import { SlideFechamento } from '../slides/fechamento';

const F = APRESENTACAO.fechamento;

afterEach(() => vi.restoreAllMocks());

describe('SlideFechamento', () => {
  it('link abre o WhatsApp com a mensagem da apresentação', () => {
    render(<SlideFechamento />);
    const link = screen.getByRole('link', { name: F.linkLabel });
    expect(link).toHaveAttribute('href', whatsappUrl('Olá! Vi a apresentação da Smart Vale TV.'));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('gera o QR em SVG com o mesmo link', async () => {
    const spy = vi.spyOn(QRCode, 'toString');
    render(<SlideFechamento />);
    const qr = await screen.findByRole('img', { name: F.qrLabel });
    await waitFor(() => expect(qr.querySelector('svg')).not.toBeNull());
    expect(spy).toHaveBeenCalledWith(whatsappUrl(F.message), expect.objectContaining({ type: 'svg' }));
  });

  it('se o QR falhar, o link continua lá', async () => {
    vi.spyOn(QRCode, 'toString').mockImplementation((() =>
      Promise.reject(new Error('falhou'))) as unknown as typeof QRCode.toString);
    render(<SlideFechamento />);
    await waitFor(() => expect(screen.queryByRole('img', { name: F.qrLabel })).toBeNull());
    expect(screen.getByRole('link', { name: F.linkLabel })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/apresentacao/__tests__/fechamento.test.tsx`
Expected: FAIL — `Failed to resolve import "../slides/fechamento"`.

- [ ] **Step 4: Implementar**

`artifacts/signage/src/components/apresentacao/slides/fechamento.tsx`:

```tsx
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { whatsappUrl } from '@/lib/landing-content';
import { SlideShell } from '../slide-shell';

const URL_WHATSAPP = whatsappUrl(APRESENTACAO.fechamento.message);

/**
 * Fecha a reunião num QR que abre o WhatsApp. A mensagem é própria da
 * apresentação: o contato chega dizendo de onde veio.
 *
 * Preto e branco fixos no QR (não tokens de tema): câmera lê QR escuro
 * sobre claro; invertido no tema escuro, muito leitor falha.
 */
export function SlideFechamento() {
  const { titulo, corpo, qrLabel, linkLabel } = APRESENTACAO.fechamento;
  // undefined = gerando; null = falhou (fica só o link).
  const [svg, setSvg] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    QRCode.toString(URL_WHATSAPP, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((s) => vivo && setSvg(s))
      .catch(() => vivo && setSvg(null));
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <SlideShell titulo={titulo}>
      <div className="flex flex-col items-center gap-8 text-center md:flex-row md:text-left">
        {svg !== null ? (
          <div
            role="img"
            aria-label={qrLabel}
            className="h-56 w-56 shrink-0 rounded-xl bg-foreground p-3 sm:h-72 sm:w-72 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
          />
        ) : null}
        <div>
          <p className="text-xl leading-relaxed text-muted-foreground sm:text-2xl">{corpo}</p>
          <a
            href={URL_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-lg font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {linkLabel}
          </a>
        </div>
      </div>
    </SlideShell>
  );
}
```

(O `svg` vem só da biblioteca `qrcode` a partir de uma URL constante do próprio código; não há entrada de usuário no `dangerouslySetInnerHTML`.)

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/apresentacao/__tests__/fechamento.test.tsx src/__tests__/landing-cores.test.ts`
Expected: PASS. Se `landing-cores` acusar algo, é regra de cor: o QR usa hex (`#000000`), que a regra não proíbe; `bg-foreground` é token.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/package.json pnpm-lock.yaml artifacts/signage/src/components/apresentacao/slides/fechamento.tsx artifacts/signage/src/components/apresentacao/__tests__/fechamento.test.tsx
git commit -m "feat(landing): fechamento da apresentação com QR do WhatsApp

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Página, índice, rota pública e fora dos buscadores

**Files:**
- Create: `artifacts/signage/src/components/apresentacao/indice.tsx`
- Create: `artifacts/signage/src/pages/apresentacao.tsx`
- Modify: `artifacts/signage/src/App.tsx` (import das páginas ~linha 35; `Router()` ~linha 290)
- Modify: `artifacts/signage/public/robots.txt`
- Test: `artifacts/signage/src/pages/__tests__/apresentacao.test.tsx`
- Test: `artifacts/signage/src/__tests__/apresentacao-rota.test.tsx`

**Interfaces:**
- Consumes: `useSlideNav` (Task 2), `APRESENTACAO`, `Bloco` (Task 2), todos os `Slide*` (Tasks 3–6).
- Produces:
  ```ts
  export interface EntradaIndice { bloco: Bloco; label: string; primeiro: number } // primeiro é 0-based
  export function Indice(props: { entradas: EntradaIndice[]; atual: number; onEscolher(slide: number): void; onFechar(): void }): JSX.Element
  export default function Apresentacao(): JSX.Element
  ```

- [ ] **Step 1: Escrever o teste da página que falha**

`artifacts/signage/src/pages/__tests__/apresentacao.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { LANDING } from '@/lib/landing-content';
import Apresentacao from '../apresentacao';

function renderPagina() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Apresentacao />
    </QueryClientProvider>,
  );
}

// jsdom: window.innerWidth = 1024. Metade direita > 512.
const DIREITA = { clientX: 900, clientY: 300 };
const ESQUERDA = { clientX: 100, clientY: 300 };

function slideAtual() {
  return screen.getByRole('progressbar').getAttribute('aria-valuenow');
}

beforeEach(() => {
  window.history.replaceState(null, '', '/apresentacao');
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500 })));
});
afterEach(() => vi.unstubAllGlobals());

describe('Apresentacao', () => {
  it('abre na capa', () => {
    renderPagina();
    expect(screen.getByText(APRESENTACAO.capa.tagline)).toBeInTheDocument();
    expect(slideAtual()).toBe('1');
  });

  it('clique na metade direita avança e na esquerda volta', () => {
    renderPagina();
    const palco = screen.getByTestId('palco');
    fireEvent.click(palco, DIREITA);
    expect(screen.getByRole('heading', { level: 2, name: APRESENTACAO.problema.titulo })).toBeInTheDocument();
    fireEvent.click(palco, ESQUERDA);
    expect(screen.getByText(APRESENTACAO.capa.tagline)).toBeInTheDocument();
  });

  it('clique num botão do slide não troca de slide', async () => {
    window.history.replaceState(null, '', '/apresentacao#3');
    renderPagina();
    await userEvent.click(screen.getByRole('button', { name: LANDING.mockup.portrait }));
    expect(slideAtual()).toBe('3');
  });

  it('índice pula para o bloco escolhido e fecha', async () => {
    renderPagina();
    await userEvent.click(screen.getByRole('button', { name: APRESENTACAO.navegacao.indice }));
    const dialogo = screen.getByRole('dialog', { name: APRESENTACAO.navegacao.indice });
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(APRESENTACAO.blocos.ponto) }),
    );
    expect(dialogo).not.toBeInTheDocument();
    expect(slideAtual()).toBe('9');
  });

  it('tecla I abre o índice e Esc fecha', () => {
    renderPagina();
    fireEvent.keyDown(window, { key: 'i' });
    expect(screen.getByRole('dialog', { name: APRESENTACAO.navegacao.indice })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clique dentro do índice fora dos botões não troca de slide', async () => {
    renderPagina();
    await userEvent.click(screen.getByRole('button', { name: APRESENTACAO.navegacao.indice }));
    fireEvent.click(screen.getByRole('dialog'), DIREITA);
    expect(slideAtual()).toBe('1');
  });

  it('tecla F sem Fullscreen API não quebra', () => {
    // jsdom não implementa requestFullscreen, igual ao Safari de iPhone.
    renderPagina();
    expect(() => fireEvent.keyDown(window, { key: 'f' })).not.toThrow();
    expect(slideAtual()).toBe('1');
  });

  it('pede para não ser indexada e devolve a meta original ao sair', () => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'index, follow';
    document.head.appendChild(meta);
    const { unmount } = renderPagina();
    expect(meta.content).toBe('noindex');
    unmount();
    expect(meta.content).toBe('index, follow');
    meta.remove();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/pages/__tests__/apresentacao.test.tsx`
Expected: FAIL — `Failed to resolve import "../apresentacao"`.

- [ ] **Step 3: Implementar o índice**

`artifacts/signage/src/components/apresentacao/indice.tsx`:

```tsx
import { X } from 'lucide-react';
import { APRESENTACAO, type Bloco } from '@/lib/apresentacao-content';
import { cn } from '@/lib/utils';

export interface EntradaIndice {
  bloco: Bloco;
  label: string;
  primeiro: number;
}

/**
 * Atalho para pular o bloco que não serve a quem está na mesa. `data-no-nav`
 * faz o clique no fundo do painel não virar troca de slide.
 */
export function Indice({
  entradas,
  atual,
  onEscolher,
  onFechar,
}: {
  entradas: EntradaIndice[];
  atual: number;
  onEscolher: (slide: number) => void;
  onFechar: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={APRESENTACAO.navegacao.indice}
      data-no-nav
      className="absolute bottom-16 right-4 z-20 w-72 rounded-xl border border-border bg-card p-4 shadow-lg"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {APRESENTACAO.navegacao.indice}
        </p>
        <button
          type="button"
          onClick={onFechar}
          aria-label={APRESENTACAO.navegacao.fecharIndice}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ul className="space-y-1">
        {entradas.map((e, i) => {
          const fim = entradas[i + 1]?.primeiro ?? Infinity;
          const dentro = atual >= e.primeiro && atual < fim;
          return (
            <li key={e.bloco}>
              <button
                type="button"
                onClick={() => onEscolher(e.primeiro)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-base',
                  dentro ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
                )}
              >
                <span>{e.label}</span>
                <span className="text-sm opacity-70">
                  {APRESENTACAO.navegacao.slide} {e.primeiro + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Implementar a página**

`artifacts/signage/src/pages/apresentacao.tsx`:

```tsx
import { useEffect, useState, type ComponentType, type MouseEvent } from 'react';
import { List } from 'lucide-react';
import { Indice, type EntradaIndice } from '@/components/apresentacao/indice';
import { SlideCapa } from '@/components/apresentacao/slides/capa';
import { SlideProblema } from '@/components/apresentacao/slides/problema';
import { SlideSolucao } from '@/components/apresentacao/slides/solucao';
import { SlideRede } from '@/components/apresentacao/slides/rede';
import { SlideComoFunciona } from '@/components/apresentacao/slides/como-funciona';
import { SlideDiferenciais } from '@/components/apresentacao/slides/diferenciais';
import { SlideResultado } from '@/components/apresentacao/slides/resultado';
import { SlidePlanoAnunciante } from '@/components/apresentacao/slides/plano-anunciante';
import { SlidePlanoPonto } from '@/components/apresentacao/slides/plano-ponto';
import { SlideFechamento } from '@/components/apresentacao/slides/fechamento';
import { useSlideNav } from '@/hooks/use-slide-nav';
import { APRESENTACAO, type Bloco } from '@/lib/apresentacao-content';

/** Ordem da reunião: tronco comum, depois um bloco por público, e o fecho. */
const SLIDES: Array<{ bloco: Bloco; Slide: ComponentType }> = [
  { bloco: 'comum', Slide: SlideCapa },
  { bloco: 'comum', Slide: SlideProblema },
  { bloco: 'comum', Slide: SlideSolucao },
  { bloco: 'comum', Slide: SlideRede },
  { bloco: 'comum', Slide: SlideComoFunciona },
  { bloco: 'comum', Slide: SlideDiferenciais },
  { bloco: 'anunciante', Slide: SlideResultado },
  { bloco: 'anunciante', Slide: SlidePlanoAnunciante },
  { bloco: 'ponto', Slide: SlidePlanoPonto },
  { bloco: 'fechamento', Slide: SlideFechamento },
];

const ENTRADAS: EntradaIndice[] = (Object.keys(APRESENTACAO.blocos) as Bloco[]).map((bloco) => ({
  bloco,
  label: APRESENTACAO.blocos[bloco],
  primeiro: SLIDES.findIndex((s) => s.bloco === bloco),
}));

// Toque nisto é interação com o slide, não pedido de troca de slide.
const INTERATIVO = 'button, a, input, textarea, select, [data-no-nav]';

/**
 * A apresentação é pública por link, mas não é porta de entrada do site:
 * troca a meta robots do index.html por noindex enquanto está montada.
 */
function useNoIndex() {
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const criada = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    const original = meta.content;
    meta.content = 'noindex';
    return () => {
      if (criada) meta.remove();
      else meta.content = original;
    };
  }, []);
}

function alternarTelaCheia() {
  // Safari de iPhone não tem Fullscreen API fora de vídeo: sem ela, nada.
  if (document.fullscreenElement) void document.exitFullscreen?.();
  else void document.documentElement.requestFullscreen?.();
}

export default function Apresentacao() {
  const nav = useSlideNav(SLIDES.length);
  const [indiceAberto, setIndiceAberto] = useState(false);
  useNoIndex();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tecla = e.key.toLowerCase();
      if (tecla === 'f') alternarTelaCheia();
      else if (tecla === 'i') setIndiceAberto((a) => !a);
      else if (e.key === 'Escape') setIndiceAberto(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function onClickPalco(e: MouseEvent<HTMLDivElement>) {
    if (e.target instanceof Element && e.target.closest(INTERATIVO)) return;
    if (e.clientX < window.innerWidth / 2) nav.voltar();
    else nav.avancar();
  }

  const { Slide } = SLIDES[nav.atual];

  return (
    <div
      data-testid="palco"
      onClick={onClickPalco}
      className="relative h-[100dvh] select-none overflow-hidden bg-background text-foreground"
    >
      {/* Rolável: num celular em pé o slide de plano não cabe inteiro. */}
      <div className="h-full overflow-y-auto">
        <Slide />
      </div>

      <button
        type="button"
        onClick={() => setIndiceAberto((a) => !a)}
        aria-label={APRESENTACAO.navegacao.indice}
        aria-expanded={indiceAberto}
        className="absolute bottom-4 right-4 z-20 rounded-full border border-border bg-card p-2 text-muted-foreground opacity-60 hover:text-foreground hover:opacity-100"
      >
        <List className="h-5 w-5" aria-hidden="true" />
      </button>

      {indiceAberto ? (
        <Indice
          entradas={ENTRADAS}
          atual={nav.atual}
          onEscolher={(n) => {
            nav.ir(n);
            setIndiceAberto(false);
          }}
          onFechar={() => setIndiceAberto(false)}
        />
      ) : null}

      <div
        role="progressbar"
        aria-label={APRESENTACAO.navegacao.progresso}
        aria-valuemin={1}
        aria-valuemax={SLIDES.length}
        aria-valuenow={nav.atual + 1}
        className="absolute inset-x-0 bottom-0 h-1 bg-muted"
      >
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${((nav.atual + 1) / SLIDES.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Rodar o teste da página**

Run: `pnpm --filter @workspace/signage exec vitest run src/pages/__tests__/apresentacao.test.tsx`
Expected: PASS (8 testes).

- [ ] **Step 6: Escrever o teste de rota e robots que falha**

`artifacts/signage/src/__tests__/apresentacao-rota.test.tsx`:

```tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import App from '../App';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('rota /apresentacao', () => {
  it('abre sem sessão e sem consultar o login', async () => {
    const fetch = vi.fn(() => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }));
    vi.stubGlobal('fetch', fetch);
    window.history.replaceState(null, '', '/apresentacao');
    render(<App />);
    expect(await screen.findByText(APRESENTACAO.capa.tagline)).toBeInTheDocument();
    const urls = fetch.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls.some((u) => u.includes('api/auth/me'))).toBe(false);
  });

  it('robots.txt tira a apresentação dos buscadores', () => {
    const robots = readFileSync(resolve(import.meta.dirname, '../../public/robots.txt'), 'utf8');
    expect(robots).toMatch(/^Disallow: \/apresentacao$/m);
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/__tests__/apresentacao-rota.test.tsx`
Expected: FAIL — primeiro teste cai na landing/`RoleRouter` (tagline não aparece ou `auth/me` é chamado); segundo falha no `Disallow`.

- [ ] **Step 8: Registrar a rota e o robots**

Em `artifacts/signage/src/App.tsx`:

1. Junto do `import Landing from './pages/landing';` adicionar:
   ```tsx
   import Apresentacao from './pages/apresentacao';
   ```
2. Em `function Router()`, logo abaixo de `<Route path="/display/:deviceKey" component={Display} />`:
   ```tsx
   {/* Pública e fora do RootGate: abre igual com ou sem sessão, sem esperar /auth/me. */}
   <Route path="/apresentacao" component={Apresentacao} />
   ```

`artifacts/signage/public/robots.txt` passa a ser:

```
User-agent: *
Allow: /
Disallow: /apresentacao
```

- [ ] **Step 9: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/__tests__/apresentacao-rota.test.tsx src/pages/__tests__/apresentacao.test.tsx src/__tests__/landing-cores.test.ts`
Expected: PASS; o relatório do `landing-cores` agora inclui `pages/apresentacao.tsx` e `components/apresentacao/indice.tsx`.

- [ ] **Step 10: Commit**

```bash
git add artifacts/signage/src/components/apresentacao/indice.tsx artifacts/signage/src/pages/apresentacao.tsx artifacts/signage/src/pages/__tests__/apresentacao.test.tsx artifacts/signage/src/__tests__/apresentacao-rota.test.tsx artifacts/signage/src/App.tsx artifacts/signage/public/robots.txt
git commit -m "feat(landing): página /apresentacao com índice e navegação

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Verificação final

**Files:** nenhum novo.

- [ ] **Step 1: Suíte inteira do web, typecheck e build**

Run:
```bash
pnpm --filter @workspace/signage test
pnpm --filter @workspace/signage typecheck
PORT=21153 BASE_PATH=/ pnpm --filter @workspace/signage build
```
Expected: todos os testes passam; `tsc` sem erro; build conclui. Se o typecheck reclamar do `readdirSync(..., { recursive: true, encoding: 'utf8' })`, tipar o resultado com `as string[]`.

- [ ] **Step 2: Escapes unicode**

Run: `grep -rnE '\\u[0-9a-fA-F]{4}' artifacts/signage/src/lib/apresentacao-content.ts artifacts/signage/src/components/apresentacao artifacts/signage/src/pages/apresentacao.tsx artifacts/signage/src/hooks/use-slide-nav.ts`
Expected: nenhuma saída.

- [ ] **Step 3: Conferir no navegador**

Run: `./dev.sh` e abrir `http://localhost:21153/apresentacao`.
Conferir: setas, espaço, clique por metade, `F` (tela cheia), `I` e `Esc`, índice pulando para "Para quem tem um ponto" (slide 9), recarregar no `#7` volta ao 7, TV do slide 3 girando sem trocar slide, QR do slide 10 lido pela câmera do celular abrindo o WhatsApp com "Olá! Vi a apresentação da Smart Vale TV.". Repetir no modo celular em pé do DevTools (slide 8 rola).

- [ ] **Step 4: Fechar a branch**

Usar superpowers:finishing-a-development-branch. PR com título `feat(landing): apresentação comercial em /apresentacao` e merge commit (`gh pr merge --merge`).
