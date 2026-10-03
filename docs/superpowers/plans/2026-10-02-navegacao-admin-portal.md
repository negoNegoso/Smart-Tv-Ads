# Navegação do admin e do portal — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin e portal passam a usar um menu lateral único (sidebar no desktop, gaveta no celular), o portal ganha rotas reais com F5 e link funcionando, e as páginas de detalhe mostram o caminho até elas.

**Architecture:** Um `AppShell` guiado por configuração (`nav-config.ts`) envolve o admin (`Layout`) e o portal (`PortalShell`). O portal troca as abas em `useState` por um `Switch` do wouter (`PortalRoutes`), no mesmo molde do `AdminRoutes`. As páginas de detalhe declaram o próprio caminho com `PageHeader`. A API só ganha `companyId` na campanha.

**Tech Stack:** React 19 + wouter 3 + TanStack Query, shadcn (`components/ui/sidebar.tsx`, `breadcrumb.tsx`), Vitest + Testing Library (jsdom), Express + Drizzle na API.

**Spec:** `docs/superpowers/specs/2026-10-02-navegacao-admin-portal-design.md`

## Global Constraints

- Código, comentários, textos de tela e mensagens de commit em português; comentários explicam o porquê.
- Acentos como caracteres UTF-8 reais, nunca escapes `\uXXXX` (escrever escape por Write/Edit corrompe o arquivo).
- Commits no formato `tipo(escopo): descrição curta em português`, sem ponto final, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Trabalho na branch `feat/navegacao`; nada direto na `main`.
- Nenhuma dependência nova. Componentes shadcn já instalados: `sidebar`, `sheet`, `breadcrumb`.
- Rotas do portal continuam com `fetch` manual; `openapi.yaml` não muda.
- Testes do web: `pnpm --filter ./artifacts/signage test`. Testes da API: `pnpm --filter ./artifacts/api-server test`. Tipos: `pnpm run typecheck` na raiz.

## Review Focus

1. **`/` acende "Visão geral" em toda página do admin** se o item ativo usar só prefixo — `isNavItemActive('/parque', '/')` tem que ser `false`. Teste na Task 2.
2. **Usuário com os dois papéis** tem que ver os grupos Anunciante e Cliente juntos e cair em `/portal/anunciante` ao abrir `/`. Testes nas Tasks 2 e 6.
3. **`/portal/paineis/abc` (ou `0`, `-1`)** tem que voltar para `/portal/paineis` e não abrir o editor com `NaN`. Teste na Task 6.
4. **Gaveta no celular continua aberta por cima da página depois de tocar num item.** Teste na Task 3.
5. **Impressão do portal (PDF) passa a incluir o menu** se a sidebar ou a barra do topo perderem `print:hidden`. Teste na Task 3.

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `artifacts/api-server/src/routes/advertisers.ts` | `campaignSelection` ganha `companyId` |
| `artifacts/signage/src/test/setup.ts` | stub de `window.matchMedia` (jsdom não tem; `useIsMobile` usa) |
| `artifacts/signage/src/components/nav-config.ts` (novo) | tipos `NavItem`/`NavGroup`, `adminNav`, `portalNav`, `portalHome`, `isNavItemActive` |
| `artifacts/signage/src/components/app-shell.tsx` (novo) | sidebar/gaveta + barra do topo + Sair |
| `artifacts/signage/src/components/layout.tsx` | vira `<AppShell navGroups={adminNav}>` |
| `artifacts/signage/src/components/portal-shell.tsx` | vira `<AppShell navGroups={portalNav(roles)}>` com o contêiner do portal |
| `artifacts/signage/src/components/page-header.tsx` (novo) | caminho (breadcrumb no desktop, "‹ voltar" no celular) |
| `artifacts/signage/src/pages/campaign-detail.tsx`, `device-detail.tsx`, `company-detail.tsx` | adotam `PageHeader` |
| `artifacts/signage/src/components/change-password-form.tsx` (novo) | formulário de troca de senha reaproveitável |
| `artifacts/signage/src/pages/change-password.tsx` | usa o formulário (primeiro login) |
| `artifacts/signage/src/pages/portal-account.tsx` (novo) | `/portal/conta` |
| `artifacts/signage/src/App.tsx` | `PortalRoutes`; `/` do admin = Visão geral; `/analytics` redireciona |
| `artifacts/signage/src/pages/analytics.tsx` | título "Visão geral" |

---

### Task 1: API devolve `companyId` na campanha

**Files:**
- Modify: `artifacts/api-server/src/routes/advertisers.ts:137-141` (`campaignSelection`)
- Test: `artifacts/api-server/src/routes/__tests__/campaign-flyers-route.test.ts`

**Interfaces:**
- Produces: `GET /api/campaigns/:id` responde também `companyId: number` (id da empresa dona do anunciante). As listas que usam `campaignSelection` ganham o mesmo campo.

- [ ] **Step 1: Escrever o teste que falha**

No fim do `describe("rotas de campanha convivendo com encartes", ...)` de `campaign-flyers-route.test.ts`, adicionar:

```ts
  it("GET devolve companyId para o caminho da campanha apontar para a empresa", async () => {
    const { advertisersTable } = await import("@workspace/db/schema");
    const { default: request } = await import("supertest");
    const res = await request(app).get(`/campaigns/${CAMPAIGN_ID}`);
    expect(res.status).toBe(200);
    // A coluna selecionada é o que importa: o fake de banco devolve a linha
    // pronta, então o que prova o campo é campaignWithStats pedir a coluna.
    const cols = state.lastJoinedCampaignCols as Record<string, unknown>;
    expect(cols.companyId).toBe(advertisersTable.companyId);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/api-server test -- campaign-flyers-route`
Expected: FAIL — `expected undefined to be ...` no teste novo.

- [ ] **Step 3: Implementar**

Em `campaignSelection` (`advertisers.ts`), logo depois de `advertiserId: campaignsTable.advertiserId,`:

```ts
  // O caminho da página da campanha (Empresas › empresa › campanha) aponta
  // direto para /companies/:id; sem isso o link passava pela rota legada
  // /advertisers/:id, que só redireciona.
  companyId: advertisersTable.companyId,
```

`advertisersTable` já está no join de todas as consultas que usam `campaignSelection` (conferir com `grep -n "select(campaignSelection)" -A3 artifacts/api-server/src/routes/advertisers.ts`: todas têm `innerJoin(advertisersTable, ...)`). Se alguma não tiver, parar e reportar.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter ./artifacts/api-server test`
Expected: PASS, suíte inteira.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/advertisers.ts artifacts/api-server/src/routes/__tests__/campaign-flyers-route.test.ts
git commit -m "feat(api): campanha devolve companyId da empresa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Configuração da navegação

**Files:**
- Create: `artifacts/signage/src/components/nav-config.ts`
- Test: `artifacts/signage/src/components/__tests__/nav-config.test.ts`

**Interfaces:**
- Produces:
  - `interface NavItem { href: string; label: string; icon: LucideIcon }`
  - `interface NavGroup { label?: string; items: NavItem[] }`
  - `const adminNav: NavGroup[]`
  - `function portalNav(roles: string[]): NavGroup[]`
  - `function portalHome(roles: string[]): string`
  - `function isNavItemActive(location: string, href: string): boolean`

- [ ] **Step 1: Escrever os testes que falham**

`artifacts/signage/src/components/__tests__/nav-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { adminNav, isNavItemActive, portalHome, portalNav } from '../nav-config';

const hrefs = (groups: ReturnType<typeof portalNav>) => groups.flatMap((g) => g.items.map((i) => i.href));
const labels = (groups: ReturnType<typeof portalNav>) => groups.map((g) => g.label ?? null);

describe('adminNav', () => {
  it('agrupa os itens do admin com Visão geral na raiz', () => {
    expect(labels(adminNav)).toEqual(['Operação', 'Comercial', 'Conteúdo', 'Sistema']);
    expect(hrefs(adminNav)).toEqual(['/', '/parque', '/companies', '/admin', '/panels', '/divulgacao', '/users-admin']);
    expect(adminNav[0].items[0].label).toBe('Visão geral');
  });
});

describe('portalNav', () => {
  it('anunciante só vê Desempenho e Minha conta', () => {
    expect(hrefs(portalNav(['advertiser']))).toEqual(['/portal/anunciante', '/portal/conta']);
  });

  it('cliente só vê Minhas TVs, Meus painéis e Minha conta', () => {
    expect(hrefs(portalNav(['client']))).toEqual(['/portal/tvs', '/portal/paineis', '/portal/conta']);
  });

  it('quem tem os dois papéis vê os dois grupos juntos', () => {
    const groups = portalNav(['client', 'advertiser']);
    expect(labels(groups)).toEqual(['Anunciante', 'Cliente', null]);
    expect(hrefs(groups)).toEqual(['/portal/anunciante', '/portal/tvs', '/portal/paineis', '/portal/conta']);
  });

  it('sem papel sobra só Minha conta', () => {
    expect(hrefs(portalNav([]))).toEqual(['/portal/conta']);
  });
});

describe('portalHome', () => {
  it('anunciante (com ou sem cliente) começa no desempenho', () => {
    expect(portalHome(['advertiser'])).toBe('/portal/anunciante');
    expect(portalHome(['client', 'advertiser'])).toBe('/portal/anunciante');
  });

  it('cliente começa nas TVs', () => {
    expect(portalHome(['client'])).toBe('/portal/tvs');
  });
});

describe('isNavItemActive', () => {
  it('ativa na rota exata e nas filhas', () => {
    expect(isNavItemActive('/parque', '/parque')).toBe(true);
    expect(isNavItemActive('/companies/5', '/companies')).toBe(true);
  });

  it('não confunde prefixo de texto com rota filha', () => {
    expect(isNavItemActive('/panelsx', '/panels')).toBe(false);
  });

  it('a raiz só ativa na raiz', () => {
    expect(isNavItemActive('/', '/')).toBe(true);
    expect(isNavItemActive('/parque', '/')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/signage test -- nav-config`
Expected: FAIL — `Failed to resolve import "../nav-config"`.

- [ ] **Step 3: Implementar**

`artifacts/signage/src/components/nav-config.ts`:

```ts
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Building2,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  Monitor,
  PanelsTopLeft,
  TrendingUp,
  Tv,
  UserCog,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/**
 * Menu do admin em grupos. Separado do AppShell para dar para testar a
 * estrutura sem renderizar nada e para o shell não saber se serve admin ou
 * portal.
 */
export const adminNav: NavGroup[] = [
  {
    label: 'Operação',
    items: [
      { href: '/', label: 'Visão geral', icon: BarChart3 },
      { href: '/parque', label: 'Parque de TVs', icon: Monitor },
    ],
  },
  { label: 'Comercial', items: [{ href: '/companies', label: 'Empresas', icon: Building2 }] },
  {
    label: 'Conteúdo',
    items: [
      { href: '/admin', label: 'Biblioteca de Mídia', icon: LayoutDashboard },
      { href: '/panels', label: 'Painéis', icon: PanelsTopLeft },
      { href: '/divulgacao', label: 'Divulgação', icon: Megaphone },
    ],
  },
  { label: 'Sistema', items: [{ href: '/users-admin', label: 'Contas de Acesso', icon: KeyRound }] },
];

/**
 * Menu do portal montado pelos papéis. Quem é anunciante e cliente vê os dois
 * grupos juntos, sem botão de alternar. Item de papel que o usuário não tem
 * nem aparece — a API bloquearia de qualquer jeito.
 */
export function portalNav(roles: string[]): NavGroup[] {
  const groups: NavGroup[] = [];
  if (roles.includes('advertiser')) {
    groups.push({ label: 'Anunciante', items: [{ href: '/portal/anunciante', label: 'Desempenho', icon: TrendingUp }] });
  }
  if (roles.includes('client')) {
    groups.push({
      label: 'Cliente',
      items: [
        { href: '/portal/tvs', label: 'Minhas TVs', icon: Tv },
        { href: '/portal/paineis', label: 'Meus painéis', icon: PanelsTopLeft },
      ],
    });
  }
  groups.push({ items: [{ href: '/portal/conta', label: 'Minha conta', icon: UserCog }] });
  return groups;
}

/** Para onde vai quem abre `/` (ou uma rota que não é do seu papel). */
export function portalHome(roles: string[]): string {
  return roles.includes('advertiser') ? '/portal/anunciante' : '/portal/tvs';
}

/**
 * Item ativo na rota exata e nas filhas (`/companies/5` acende Empresas).
 * A raiz é exceção: por prefixo, "Visão geral" acenderia em toda página.
 */
export function isNavItemActive(location: string, href: string): boolean {
  if (href === '/') return location === '/';
  return location === href || location.startsWith(`${href}/`);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter ./artifacts/signage test -- nav-config`
Expected: PASS (11 testes).

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/components/nav-config.ts artifacts/signage/src/components/__tests__/nav-config.test.ts
git commit -m "feat(portal): configuração do menu do admin e do portal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: AppShell no admin e no portal

**Files:**
- Modify: `artifacts/signage/src/test/setup.ts`
- Create: `artifacts/signage/src/components/app-shell.tsx`
- Modify: `artifacts/signage/src/components/layout.tsx` (arquivo inteiro)
- Modify: `artifacts/signage/src/components/portal-shell.tsx` (arquivo inteiro)
- Modify: `artifacts/signage/src/components/__tests__/marca-cabecalhos.test.tsx:22`
- Modify: `artifacts/signage/src/App.tsx` (só a linha `<PortalShell>` dentro de `PortalSwitch`)
- Test: `artifacts/signage/src/components/__tests__/app-shell.test.tsx`

**Interfaces:**
- Consumes: `NavGroup`, `isNavItemActive`, `adminNav`, `portalNav` (Task 2).
- Produces:
  - `function AppShell(props: { navGroups: NavGroup[]; children: ReactNode }): JSX.Element`
  - `function Layout(props: { children: ReactNode })` — assinatura igual à de hoje.
  - `function PortalShell(props: { roles: string[]; children: ReactNode })` — **nova prop obrigatória `roles`**.

- [ ] **Step 1: Stub de `matchMedia` no setup**

`SidebarProvider` usa `useIsMobile`, que chama `window.matchMedia` — o jsdom não tem. Em `artifacts/signage/src/test/setup.ts`, depois do bloco do `ResizeObserver`, adicionar:

```ts
// jsdom não implementa matchMedia, e o useIsMobile (usado pelo menu lateral)
// assina mudanças por ele. O valor vem de window.innerWidth no próprio hook;
// o stub só precisa aceitar a assinatura. Teste que quer celular ajusta
// window.innerWidth antes de renderizar.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
```

- [ ] **Step 2: Escrever os testes que falham**

`artifacts/signage/src/components/__tests__/app-shell.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { AppShell } from '../app-shell';
import { adminNav } from '../nav-config';

const DESKTOP_WIDTH = 1024;

function renderShell(path: string) {
  const { hook } = memoryLocation({ path });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Router hook={hook}>
        <AppShell navGroups={adminNav}>
          <p>conteúdo da página</p>
        </AppShell>
      </Router>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  window.innerWidth = DESKTOP_WIDTH;
});

describe('AppShell no desktop', () => {
  it('mostra os grupos, os itens e o conteúdo', () => {
    renderShell('/companies');
    expect(screen.getByText('Operação')).toBeInTheDocument();
    expect(screen.getByText('Sistema')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Parque de TVs/ })).toHaveAttribute('href', '/parque');
    expect(screen.getByText('conteúdo da página')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sair/ })).toBeInTheDocument();
  });

  it('marca o item da rota filha e não marca a Visão geral', () => {
    renderShell('/companies/5');
    expect(screen.getByRole('link', { name: /Empresas/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Visão geral/ })).not.toHaveAttribute('aria-current');
  });

  it('na raiz marca a Visão geral', () => {
    renderShell('/');
    expect(screen.getByRole('link', { name: /Visão geral/ })).toHaveAttribute('aria-current', 'page');
  });

  it('menu e barra do topo somem na impressão', () => {
    const { container } = renderShell('/');
    const sidebar = container.querySelector('[data-slot="sidebar"]');
    expect(sidebar?.closest('.print\\:hidden')).not.toBeNull();
    const topo = screen.getByRole('button', { name: 'Abrir menu' }).closest('header');
    expect(topo).toHaveClass('print:hidden');
  });
});

describe('AppShell no celular', () => {
  it('abre a gaveta pelo botão e fecha ao tocar num item', async () => {
    window.innerWidth = 500;
    const user = userEvent.setup();
    renderShell('/companies');
    // Gaveta fechada: os itens não estão na tela.
    await waitFor(() => expect(screen.queryByRole('link', { name: /Parque de TVs/ })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Abrir menu' }));
    const item = await screen.findByRole('link', { name: /Parque de TVs/ });

    await user.click(item);
    await waitFor(() => expect(screen.queryByRole('link', { name: /Parque de TVs/ })).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/signage test -- app-shell`
Expected: FAIL — `Failed to resolve import "../app-shell"`.

- [ ] **Step 4: Implementar o AppShell**

`artifacts/signage/src/components/app-shell.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { LogOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Logo } from '@/components/brand/logo';
import { logout } from '@/lib/logout';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { isNavItemActive, type NavGroup } from '@/components/nav-config';

function NavMenu({ groups }: { groups: NavGroup[] }) {
  const [location] = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <>
      {groups.map((group, index) => (
        <SidebarGroup key={group.label ?? `grupo-${index}`}>
          {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isNavItemActive(location, href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link
                        href={href}
                        aria-current={active ? 'page' : undefined}
                        // No celular a gaveta cobre a página: sem fechar,
                        // quem toca no item continua vendo o menu.
                        onClick={() => {
                          if (isMobile) setOpenMobile(false);
                        }}
                      >
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function TopBar() {
  const { isMobile } = useSidebar();
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 print:hidden">
      <SidebarTrigger aria-label="Abrir menu" />
      {/* No desktop o logo já está na sidebar; no celular a sidebar vira
          gaveta fechada, então o logo vem para a barra. */}
      {isMobile ? (
        <Logo className="h-7" />
      ) : (
        <span className="text-sm font-medium text-muted-foreground">Painel de Anúncios</span>
      )}
    </header>
  );
}

/**
 * Moldura comum do admin e do portal: sidebar no desktop, gaveta no celular.
 * Não sabe quem está servindo — os itens chegam por `navGroups`.
 */
export function AppShell({ navGroups, children }: { navGroups: NavGroup[]; children: ReactNode }) {
  const queryClient = useQueryClient();

  return (
    <SidebarProvider>
      {/* `contents` não cria caixa na tela; na impressão o print:hidden some
          com a sidebar inteira, inclusive o espaço reservado dela. */}
      <div className="contents print:hidden">
        <Sidebar>
          <SidebarHeader className="px-4 py-4">
            <Logo className="h-8" />
          </SidebarHeader>
          <SidebarContent>
            <NavMenu groups={navGroups} />
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => void logout(queryClient)}>
                  <LogOut />
                  <span>Sair</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
      </div>
      <SidebarInset className="min-h-[100dvh]">
        <TopBar />
        <div className="flex-1">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter ./artifacts/signage test -- app-shell`
Expected: PASS (5 testes). Se o teste do celular falhar porque o `Link` do wouter não repassa `aria-current`/`onClick` através do `Slot` do `SidebarMenuButton`, conferir em `node_modules/wouter` que `Link` espalha as props no `<a>`; não trocar a estratégia sem reportar.

- [ ] **Step 6: Trocar `Layout` e `PortalShell` pelo AppShell**

`artifacts/signage/src/components/layout.tsx` (arquivo inteiro):

```tsx
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { adminNav } from '@/components/nav-config';

export function Layout({ children }: { children: ReactNode }) {
  return <AppShell navGroups={adminNav}>{children}</AppShell>;
}
```

`artifacts/signage/src/components/portal-shell.tsx` (arquivo inteiro):

```tsx
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { portalNav } from '@/components/nav-config';

/**
 * Portal do anunciante/cliente. O contêiner mantém as regras de impressão de
 * antes: o PDF do portal sai sem margem extra e sem menu.
 */
export function PortalShell({ roles, children }: { roles: string[]; children: ReactNode }) {
  return (
    <AppShell navGroups={portalNav(roles)}>
      <div className="container mx-auto w-full px-4 py-6 print:max-w-none print:px-0 print:py-0">{children}</div>
    </AppShell>
  );
}
```

Em `App.tsx`, dentro de `PortalSwitch`, trocar `<PortalShell>` por `<PortalShell roles={me.roles}>` (a Task 6 substitui o `PortalSwitch` inteiro; aqui é só para compilar).

Em `components/__tests__/marca-cabecalhos.test.tsx:22`, trocar
`comQuery(<PortalShell>x</PortalShell>)` por `comQuery(<PortalShell roles={['advertiser']}>x</PortalShell>)`.

- [ ] **Step 7: Suíte e tipos**

Run: `pnpm --filter ./artifacts/signage test && pnpm run typecheck`
Expected: PASS. O teste `marca-cabecalhos` exige exatamente um logo no admin e no portal: no desktop (jsdom tem 1024 de largura) o logo só aparece na sidebar.

- [ ] **Step 8: Commit**

```bash
git add artifacts/signage/src/test/setup.ts artifacts/signage/src/components/app-shell.tsx artifacts/signage/src/components/__tests__/app-shell.test.tsx artifacts/signage/src/components/layout.tsx artifacts/signage/src/components/portal-shell.tsx artifacts/signage/src/components/__tests__/marca-cabecalhos.test.tsx artifacts/signage/src/App.tsx
git commit -m "feat(portal): menu lateral no desktop e gaveta no celular

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: PageHeader nas páginas de detalhe

**Files:**
- Create: `artifacts/signage/src/components/page-header.tsx`
- Test: `artifacts/signage/src/components/__tests__/page-header.test.tsx`
- Modify: `artifacts/signage/src/pages/campaign-detail.tsx:21-25` (tipo), `:167` (navigate após excluir), `:177` (botão voltar)
- Modify: `artifacts/signage/src/pages/device-detail.tsx:489-494` (botão voltar)
- Modify: `artifacts/signage/src/pages/company-detail.tsx:110-112` (botão voltar)
- Test: `artifacts/signage/src/pages/__tests__/device-detail.test.tsx`, `artifacts/signage/src/pages/__tests__/company-detail.test.tsx`

**Interfaces:**
- Consumes: `companyId` na resposta de `GET /api/campaigns/:id` (Task 1).
- Produces: `interface TrailItem { label: string; href?: string }` e `function PageHeader(props: { trail: TrailItem[] })`.

- [ ] **Step 1: Escrever os testes do PageHeader**

`artifacts/signage/src/components/__tests__/page-header.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from '../page-header';

const TRAIL = [
  { label: 'Empresas', href: '/companies' },
  { label: 'Padaria Central', href: '/companies/5' },
  { label: 'Campanha de Natal' },
];

describe('PageHeader', () => {
  it('desenha o caminho com links até a página atual', () => {
    render(<PageHeader trail={TRAIL} />);
    const caminho = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(caminho).toHaveClass('hidden', 'md:block');
    const links = Array.from(caminho.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Empresas', '/companies'],
      ['Padaria Central', '/companies/5'],
    ]);
    // O último item é onde o usuário está: texto, não link.
    expect(caminho).toHaveTextContent('Campanha de Natal');
    expect(screen.getByText('Campanha de Natal').closest('a')).toBeNull();
  });

  it('no celular mostra só o voltar para o item anterior', () => {
    render(<PageHeader trail={TRAIL} />);
    const voltar = screen.getByTestId('page-header-voltar');
    expect(voltar).toHaveClass('md:hidden');
    expect(voltar).toHaveAttribute('href', '/companies/5');
    expect(voltar).toHaveTextContent('Padaria Central');
  });

  it('sem item anterior com link não mostra voltar', () => {
    render(<PageHeader trail={[{ label: 'Sozinha' }]} />);
    expect(screen.queryByTestId('page-header-voltar')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/signage test -- page-header`
Expected: FAIL — `Failed to resolve import "../page-header"`.

- [ ] **Step 3: Implementar**

Conferir que `Breadcrumb` em `components/ui/breadcrumb.tsx` renderiza `<nav aria-label="breadcrumb">` e que `BreadcrumbLink` aceita `asChild` (aceita, linha 44). `artifacts/signage/src/components/page-header.tsx`:

```tsx
import { Fragment } from 'react';
import { Link } from 'wouter';
import { ChevronLeft } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export interface TrailItem {
  label: string;
  href?: string;
}

/**
 * Caminho até a página. A página declara o trail porque só ela sabe o nome
 * da TV ou da campanha (vem da query dela). O título continua na página.
 *
 * No celular o caminho inteiro quebraria linha; lá vale só "‹ anterior".
 * A troca é por CSS para não depender de medir a tela.
 */
export function PageHeader({ trail }: { trail: TrailItem[] }) {
  const back = trail
    .slice(0, -1)
    .reverse()
    .find((item) => item.href);

  return (
    <div className="mb-6">
      <Breadcrumb className="hidden md:block">
        <BreadcrumbList>
          {trail.map((item, index) => {
            const isLast = index === trail.length - 1;
            return (
              <Fragment key={`${index}-${item.label}`}>
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {item.href && !isLast ? (
                    <BreadcrumbLink asChild>
                      <Link href={item.href}>{item.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      {back?.href ? (
        <Link
          href={back.href}
          data-testid="page-header-voltar"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground md:hidden"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {back.label}
        </Link>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter ./artifacts/signage test -- page-header`
Expected: PASS (3 testes).

- [ ] **Step 5: Testes das páginas que falham**

Em `pages/__tests__/company-detail.test.tsx`, adicionar dentro do `describe('CompanyDetailView', ...)`:

```tsx
  it('mostra o caminho de volta para Empresas', async () => {
    renderView(BASE);
    await screen.findByRole('heading', { name: 'Padaria Central' });
    const caminho = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(caminho.querySelector('a')).toHaveAttribute('href', '/companies');
  });
```

Em `pages/__tests__/device-detail.test.tsx`, adicionar um `it` no primeiro `describe` do arquivo (usa os helpers `stubTv` e `renderPagina` que já existem):

```tsx
  it('mostra o caminho a partir do Parque de TVs', async () => {
    stubTv(DEVICE, []);
    renderPagina();
    await screen.findByRole('heading', { name: DEVICE.name });
    const caminho = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(caminho.querySelector('a')).toHaveAttribute('href', '/parque');
    expect(caminho).toHaveTextContent(DEVICE.name);
  });
```

Run: `pnpm --filter ./artifacts/signage test -- company-detail device-detail`
Expected: FAIL nos dois testes novos (`Unable to find role="navigation"`).

- [ ] **Step 6: Adotar o PageHeader nas três páginas**

`company-detail.tsx` — trocar o bloco das linhas 110-112:

```tsx
      <Link href="/companies">
        <Button variant="ghost" size="sm" className="-ml-2 mb-6 text-muted-foreground"><ArrowLeft className="mr-1 h-4 w-4" />Empresas</Button>
      </Link>
```

por:

```tsx
      <PageHeader trail={[{ label: 'Empresas', href: '/companies' }, { label: company.name }]} />
```

`device-detail.tsx` — trocar o bloco das linhas 489-494:

```tsx
      <Link href={`/clients/${device.clientId}`}>
        <Button variant="ghost" size="sm" className="mb-6 text-muted-foreground -ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          {device.clientName}
        </Button>
      </Link>
```

por:

```tsx
      <PageHeader trail={[{ label: 'Parque de TVs', href: '/parque' }, { label: device.name }]} />
```

`campaign-detail.tsx`:
- No `type Campaign`, depois de `advertiserId: number;`, adicionar `companyId: number;`.
- Linha 167 (`remove`): `navigate(\`/advertisers/${data.advertiserId}\`);` → `navigate(\`/companies/${data.companyId}\`);`
- Linha 177: trocar `<Link href={\`/advertisers/${data.advertiserId}\`}><Button ...>...</Button></Link>` por:

```tsx
      <PageHeader
        trail={[
          { label: 'Empresas', href: '/companies' },
          { label: data.company || data.advertiserName, href: `/companies/${data.companyId}` },
          { label: data.name },
        ]}
      />
```

Nas três: `import { PageHeader } from '@/components/page-header';` e remover de `lucide-react`/`wouter`/`Button` só os imports que ficarem sem uso (`ArrowLeft` some nas três; `Link` e `Button` continuam em uso em várias — conferir com `grep -n "ArrowLeft\|<Link\|<Button" <arquivo>` antes de remover).

- [ ] **Step 7: Suíte e tipos**

Run: `pnpm --filter ./artifacts/signage test && pnpm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add artifacts/signage/src/components/page-header.tsx artifacts/signage/src/components/__tests__/page-header.test.tsx artifacts/signage/src/pages/campaign-detail.tsx artifacts/signage/src/pages/device-detail.tsx artifacts/signage/src/pages/company-detail.tsx artifacts/signage/src/pages/__tests__/device-detail.test.tsx artifacts/signage/src/pages/__tests__/company-detail.test.tsx
git commit -m "feat(portal): caminho até a página nos detalhes de campanha, TV e empresa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Formulário de senha e página Minha conta

**Files:**
- Create: `artifacts/signage/src/components/change-password-form.tsx`
- Modify: `artifacts/signage/src/pages/change-password.tsx` (arquivo inteiro)
- Create: `artifacts/signage/src/pages/portal-account.tsx`
- Test: `artifacts/signage/src/components/__tests__/change-password-form.test.tsx`

**Interfaces:**
- Produces:
  - `function ChangePasswordForm(props: { onSuccess: () => void })`
  - `default function PortalAccount()` em `pages/portal-account.tsx`
  - `default function ChangePassword(props: { onDone: () => void })` — assinatura igual à de hoje.

- [ ] **Step 1: Escrever os testes que falham**

`artifacts/signage/src/components/__tests__/change-password-form.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordForm } from '../change-password-form';

afterEach(() => vi.unstubAllGlobals());

async function preencherEEnviar() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Senha atual'), 'senha-velha');
  await user.type(screen.getByLabelText(/Nova senha/), 'senha-nova-123');
  await user.click(screen.getByRole('button', { name: 'Trocar senha' }));
}

describe('ChangePasswordForm', () => {
  it('envia as duas senhas, avisa quem chamou e limpa os campos', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const onSuccess = vi.fn();
    render(<ChangePasswordForm onSuccess={onSuccess} />);

    await preencherEEnviar();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('api/auth/change-password');
    expect(JSON.parse(String(init.body))).toEqual({ currentPassword: 'senha-velha', newPassword: 'senha-nova-123' });
    // Na página Minha conta o formulário continua na tela: senha não pode
    // ficar preenchida depois de trocada.
    expect(screen.getByLabelText('Senha atual')).toHaveValue('');
    expect(screen.getByLabelText(/Nova senha/)).toHaveValue('');
  });

  it('mostra o erro do servidor e não avisa sucesso', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Senha atual incorreta' }), { status: 400 })),
    );
    const onSuccess = vi.fn();
    render(<ChangePasswordForm onSuccess={onSuccess} />);

    await preencherEEnviar();

    expect(await screen.findByText('Senha atual incorreta')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/signage test -- change-password-form`
Expected: FAIL — `Failed to resolve import "../change-password-form"`.

- [ ] **Step 3: Implementar o formulário**

Ler `pages/change-password.tsx` inteiro antes. `artifacts/signage/src/components/change-password-form.tsx` leva o estado, o `handleSubmit` e o `<form>` de lá, mais a limpeza dos campos:

```tsx
import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Formulário de troca de senha. Serve a tela obrigatória do primeiro login e
 * a página Minha conta do portal; quem usa decide o que acontece depois.
 */
export function ChangePasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (res.ok) {
        setCurrent('');
        setNext('');
        onSuccess();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Não foi possível trocar a senha.');
    } catch {
      setError('Não foi possível trocar a senha. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="current-password">Senha atual</Label>
        <Input
          id="current-password"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">Nova senha (mín. 8)</Label>
        <Input
          id="new-password"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Salvando…' : 'Trocar senha'}
      </Button>
    </form>
  );
}
```

Se o `handleSubmit` atual de `change-password.tsx` tiver algo além do que está acima (ler o arquivo), levar junto e reportar a diferença.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter ./artifacts/signage test -- change-password-form`
Expected: PASS (2 testes).

- [ ] **Step 5: Tela do primeiro login usa o formulário**

`artifacts/signage/src/pages/change-password.tsx` (arquivo inteiro):

```tsx
import { Card } from '@/components/ui/card';
import { KeyRound } from 'lucide-react';
import { ChangePasswordForm } from '@/components/change-password-form';

export default function ChangePassword({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2 font-bold tracking-tight text-primary">
          <KeyRound className="h-6 w-6" />
          <span>Defina uma nova senha</span>
        </div>
        <ChangePasswordForm onSuccess={onDone} />
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Página Minha conta**

`artifacts/signage/src/pages/portal-account.tsx`:

```tsx
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ChangePasswordForm } from '@/components/change-password-form';

/**
 * Antes desta página, quem queria trocar a senha depois do primeiro login
 * não tinha por onde. Fica na mesma tela depois de salvar: o toast confirma.
 */
export default function PortalAccount() {
  const { toast } = useToast();

  return (
    <div className="max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight">Minha conta</h1>
      <p className="mt-1 text-sm text-muted-foreground">Troque a senha de acesso ao portal.</p>
      <Card className="mt-6 p-6">
        <ChangePasswordForm onSuccess={() => toast({ title: 'Senha alterada' })} />
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: Suíte e tipos**

Run: `pnpm --filter ./artifacts/signage test && pnpm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add artifacts/signage/src/components/change-password-form.tsx artifacts/signage/src/components/__tests__/change-password-form.test.tsx artifacts/signage/src/pages/change-password.tsx artifacts/signage/src/pages/portal-account.tsx
git commit -m "feat(portal): página Minha conta para trocar a senha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Rotas do portal e Visão geral na raiz do admin

**Files:**
- Modify: `artifacts/signage/src/App.tsx` (`AdminRoutes`, `ClientArea`, `PortalSwitch`, `RoleRouter`, imports)
- Modify: `artifacts/signage/src/pages/analytics.tsx` (título)
- Test: `artifacts/signage/src/__tests__/rotas-navegacao.test.tsx`

**Interfaces:**
- Consumes: `PortalShell({ roles, children })` (Task 3), `portalHome` (Task 2), `PortalAccount` (Task 5).
- Produces: rotas `/portal/anunciante`, `/portal/tvs`, `/portal/paineis`, `/portal/paineis/:id`, `/portal/conta`; admin `/` = Visão geral, `/analytics` → `/`.

- [ ] **Step 1: Escrever os testes que falham**

`artifacts/signage/src/__tests__/rotas-navegacao.test.tsx`. Segue o molde de `apresentacao-rota.test.tsx`: monta o `App` inteiro com `fetch` falso. Fora `/api/auth/me`, tudo responde 500 — as páginas mostram estado de erro e o que se verifica é a URL e o menu, não o conteúdo.

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

interface FakeMe {
  isAdmin?: boolean;
  roles?: string[];
}

function stubSessao({ isAdmin = false, roles = [] }: FakeMe) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('api/auth/me')) {
      return new Response(
        JSON.stringify({
          authenticated: true,
          isAdmin,
          roles,
          clientIds: roles.includes('client') ? [7] : [],
          advertiserIds: roles.includes('advertiser') ? [3] : [],
          mustChangePassword: false,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function abrir(path: string) {
  window.history.replaceState(null, '', path);
  render(<App />);
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('rotas do portal', () => {
  it('cliente em / vai para Minhas TVs', async () => {
    stubSessao({ roles: ['client'] });
    abrir('/');
    await waitFor(() => expect(window.location.pathname).toBe('/portal/tvs'));
    expect(await screen.findByRole('link', { name: /Meus painéis/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Desempenho/ })).not.toBeInTheDocument();
  });

  it('quem tem os dois papéis vê os dois grupos e começa no anunciante', async () => {
    stubSessao({ roles: ['client', 'advertiser'] });
    abrir('/');
    await waitFor(() => expect(window.location.pathname).toBe('/portal/anunciante'));
    // Links e não rótulos de grupo: "Anunciante"/"Cliente" podem aparecer
    // também no conteúdo da página.
    expect(await screen.findByRole('link', { name: /Desempenho/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Minhas TVs/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Meus painéis/ })).toBeInTheDocument();
  });

  it('anunciante em rota de cliente volta para o desempenho', async () => {
    stubSessao({ roles: ['advertiser'] });
    abrir('/portal/tvs');
    await waitFor(() => expect(window.location.pathname).toBe('/portal/anunciante'));
  });

  it('F5 no editor abre o mesmo painel', async () => {
    const fetchMock = stubSessao({ roles: ['client'] });
    abrir('/portal/paineis/7');
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('api/portal/client/panels/7'))).toBe(true),
    );
    expect(window.location.pathname).toBe('/portal/paineis/7');
  });

  it.each(['abc', '0', '-1'])('id de painel inválido (%s) volta para a lista', async (id) => {
    stubSessao({ roles: ['client'] });
    abrir(`/portal/paineis/${id}`);
    await waitFor(() => expect(window.location.pathname).toBe('/portal/paineis'));
  });

  it('Minha conta abre para qualquer papel', async () => {
    stubSessao({ roles: ['advertiser'] });
    abrir('/portal/conta');
    expect(await screen.findByRole('heading', { name: 'Minha conta' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/portal/conta');
  });
});

describe('rotas do admin', () => {
  it('a raiz abre a Visão geral', async () => {
    stubSessao({ isAdmin: true });
    abrir('/');
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('/analytics redireciona para a raiz', async () => {
    stubSessao({ isAdmin: true });
    abrir('/analytics');
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/signage test -- rotas-navegacao`
Expected: FAIL — o portal fica em `/` (sem redirect) e o admin vai para `/companies`.

- [ ] **Step 3: Título da Visão geral**

Em `pages/analytics.tsx`, trocar `<h1 className="text-3xl font-bold tracking-tight">Análises</h1>` por `<h1 className="text-3xl font-bold tracking-tight">Visão geral</h1>`. O subtítulo e o resto continuam (o sub-projeto 2 reescreve a página).

- [ ] **Step 4: Rotas do admin**

Em `AdminRoutes` (`App.tsx`), trocar:

```tsx
      <Route path="/">
        <Redirect to="/companies" />
      </Route>
```

por:

```tsx
      <Route path="/">
        <Layout><Analytics /></Layout>
      </Route>
```

e trocar:

```tsx
      <Route path="/analytics">
        <Layout><Analytics /></Layout>
      </Route>
```

por:

```tsx
      {/* Links salvos de antes da Visão geral virar a raiz. */}
      <Route path="/analytics">
        <Redirect to="/" replace />
      </Route>
```

- [ ] **Step 5: Rotas do portal**

Em `App.tsx`, apagar `ClientArea` e `PortalSwitch` inteiros e pôr no lugar:

```tsx
/**
 * O `:id` vem da URL: qualquer coisa que não seja inteiro positivo volta para
 * a lista em vez de abrir o editor com NaN.
 */
function PortalPanelRoute({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const panelId = Number(id);
  if (!Number.isInteger(panelId) || panelId <= 0) return <Redirect to="/portal/paineis" replace />;
  return <PortalPanelEditor panelId={panelId} onBack={() => navigate('/portal/paineis')} />;
}

/**
 * Cada tela do portal tem URL própria: F5, voltar do navegador e link
 * mandado a alguém abrem a mesma tela. Rota de papel que o usuário não tem
 * nem é registrada e cai no redirect final — a API bloquearia de qualquer
 * jeito, o redirect só evita uma tela de erro.
 */
function PortalRoutes({ me }: { me: Me }) {
  const [, navigate] = useLocation();
  const isAdv = me.roles.includes('advertiser');
  const isClient = me.roles.includes('client');

  return (
    <PortalShell roles={me.roles}>
      <Switch>
        {isAdv ? (
          <Route path="/portal/anunciante">
            <PortalAdvertiser />
          </Route>
        ) : null}
        {isClient ? (
          <Route path="/portal/tvs">
            <PortalClient />
          </Route>
        ) : null}
        {isClient ? (
          <Route path="/portal/paineis/:id">{(params) => <PortalPanelRoute id={params.id} />}</Route>
        ) : null}
        {isClient ? (
          <Route path="/portal/paineis">
            <PortalPanels onEdit={(id) => navigate(`/portal/paineis/${id}`)} />
          </Route>
        ) : null}
        <Route path="/portal/conta">
          <PortalAccount />
        </Route>
        <Route>
          <Redirect to={portalHome(me.roles)} replace />
        </Route>
      </Switch>
    </PortalShell>
  );
}
```

Em `RoleRouter`, trocar `return <PortalSwitch me={me} />;` por `return <PortalRoutes me={me} />;`.

Imports em `App.tsx`: adicionar `import PortalAccount from './pages/portal-account';` e `import { portalHome } from './components/nav-config';`. `useState` deixa de ser usado se só `ClientArea`/`PortalSwitch` o usavam — conferir com `grep -n "useState" artifacts/signage/src/App.tsx` e tirar do import se sobrar sem uso.

Se o `Switch` do wouter não aceitar `null` entre os filhos (teste falha com erro de elemento inválido), montar a lista de rotas num array filtrado antes do `return` em vez de usar ternário; não mudar o comportamento.

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter ./artifacts/signage test -- rotas-navegacao`
Expected: PASS (10 testes, contando os 3 do `it.each`).

- [ ] **Step 7: Suíte inteira e tipos**

Run: `pnpm --filter ./artifacts/signage test && pnpm --filter ./artifacts/api-server test && pnpm run typecheck`
Expected: PASS em tudo.

- [ ] **Step 8: Commit**

```bash
git add artifacts/signage/src/App.tsx artifacts/signage/src/pages/analytics.tsx artifacts/signage/src/__tests__/rotas-navegacao.test.tsx
git commit -m "feat(portal): rotas próprias no portal e Visão geral na raiz do admin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Depois das tasks

PR com título `feat(portal): navegação por rotas e menu lateral no admin e no portal` (minor), merge com `gh pr merge --merge`, conforme `CLAUDE.md`. O corpo do PR não pode ter linha começando com `BREAKING CHANGE:`.
