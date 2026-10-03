# Navegação do admin e do portal — design

Data: 2026-10-02

Sub-projeto 1 de 3 da melhoria de métricas e navegação:

1. **Navegação** (este documento)
2. Saúde da rede no admin — a Visão geral passa a responder "a rede está bem
   hoje?"
3. Portal que vende — detalhe por campanha e comprovante para o anunciante

A navegação vem primeiro porque define as URLs onde os outros dois entram.

## Problema

- **Admin:** o header tem 7 itens em linha, sem tratamento para celular — em
  tela estreita estoura. O admin usa o sistema no celular com frequência
  (conferir TV em campo).
- **Portal:** tudo é `useState` (`PortalSwitch`, `ClientArea`,
  `editingPanelId`). A URL nunca muda: F5 volta para o início, o botão voltar
  do navegador sai do sistema e não há link para mandar a alguém. Quem é
  anunciante e cliente alterna por um botão. Não existe tela para trocar a
  senha depois do primeiro login.
- **Detalhes sem caminho de volta:** `device-detail` e `company-detail` não
  têm link de volta; `campaign-detail.tsx:177` volta para `/advertisers/:id`,
  rota legada que redireciona — dois saltos.
- A raiz do admin cai em `/companies`, que não diz nada sobre o estado da
  rede.

## Decisões

- **Mesmo padrão nos dois lados:** sidebar lateral recolhível no desktop,
  gaveta aberta por ☰ no celular. Um componente só, usado pelo admin e pelo
  portal.
- **Navegação guiada por configuração:** o shell recebe a lista de grupos e
  itens; não sabe se está servindo admin ou portal.
- **Breadcrumb declarado pela página**, não derivado da URL. Só a página sabe
  o nome da TV ou da campanha (vem da query dela); derivar da URL mostraria
  "Parque › 42" ou obrigaria o shell a buscar dados das páginas.
- **Portal com rotas reais.** Quem tem os dois papéis vê os grupos ANUNCIANTE
  e CLIENTE juntos na mesma navegação, sem botão de alternar.

## Rotas

### Admin

| Rota | Agora | Antes |
|---|---|---|
| `/` | Visão geral — conteúdo atual de `/analytics` (o sub-projeto 2 reescreve) | redirect para `/companies` |
| `/analytics` | redirect para `/` (links salvos) | página de análises |
| demais | iguais | — |

Grupos da sidebar:

| Grupo | Itens |
|---|---|
| Operação | Visão geral (`/`), Parque de TVs (`/parque`) |
| Comercial | Empresas (`/companies`) |
| Conteúdo | Biblioteca de Mídia (`/admin`), Painéis (`/panels`), Divulgação (`/divulgacao`) |
| Sistema | Contas de Acesso (`/users-admin`) |

Sair fica no rodapé da sidebar.

### Portal

| Rota | Papel | Conteúdo | Antes |
|---|---|---|---|
| `/` | qualquer | redirect para o primeiro item do papel | abas em `useState` |
| `/portal/anunciante` | anunciante | `PortalAdvertiser` | aba Anunciante |
| `/portal/tvs` | cliente | `PortalClient` | aba Cliente › Desempenho |
| `/portal/paineis` | cliente | `PortalPanels` | aba Meus painéis |
| `/portal/paineis/:id` | cliente | `PortalPanelEditor` | `editingPanelId` |
| `/portal/conta` | qualquer | trocar senha (reaproveita `change-password.tsx`) | não existia |

Grupos da sidebar, montados a partir de `me.roles`:

| Grupo | Itens | Aparece quando |
|---|---|---|
| Anunciante | Desempenho (`/portal/anunciante`) | papel `advertiser` |
| Cliente | Minhas TVs (`/portal/tvs`), Meus painéis (`/portal/paineis`) | papel `client` |
| (sem rótulo) | Minha conta (`/portal/conta`) | sempre |

Primeiro item do papel, usado no redirect de `/`: `/portal/anunciante` se o
usuário é anunciante, senão `/portal/tvs`.

Rota de um papel que o usuário não tem, ou rota desconhecida dentro do portal,
redireciona para o primeiro item do papel. A API já bloqueia o acesso
(`requireAdvertiser` / `requireClient`); o redirect só evita uma tela de erro.

## Componentes

Novos, em `artifacts/signage/src/components/`:

| Arquivo | Contrato |
|---|---|
| `app-shell.tsx` | Recebe `navGroups: { label?: string; items: { href: string; label: string; icon: LucideIcon }[] }[]` e `children`. Monta o `SidebarProvider` de `components/ui/sidebar.tsx`: sidebar fixa no desktop, gaveta no celular (`useIsMobile`). Item ativo: `location === href` ou `location` começa com `href + '/'`; o item `/` só é ativo na raiz exata. Rodapé com Sair (`lib/logout`). |
| `page-header.tsx` | `<PageHeader trail={{ label: string; href?: string }[]} title={ReactNode} actions?={ReactNode} />`. Breadcrumb com `components/ui/breadcrumb.tsx`. No celular mostra só "‹ {último item com href}", para não quebrar linha. |
| `nav-config.ts` | `adminNav` (constante) e `portalNav(roles: string[])` (função pura). Separado para testar sem renderizar. |

Regras de comportamento:

- **A gaveta fecha ao navegar** no celular. Sem isso, o usuário toca no item e
  continua vendo o menu por cima da página.
- **Estado recolhido no desktop** usa o cookie que `sidebar.tsx` já grava.
- O shell não esconde nada em `print:` além do que o `portal-shell.tsx` já
  esconde hoje: a sidebar e o header ganham `print:hidden`, o `main` mantém
  `print:max-w-none print:px-0 print:py-0`. A impressão do portal depende
  disso.

## Arquivos alterados

- `components/layout.tsx` → wrapper fino: `<AppShell navGroups={adminNav}>`.
- `components/portal-shell.tsx` → wrapper fino: `<AppShell navGroups={portalNav(me.roles)}>`.
- `App.tsx`: saem `PortalSwitch` e `ClientArea`; entra `PortalRoutes` (um
  `Switch` com as rotas acima, no mesmo molde de `AdminRoutes`). Em
  `AdminRoutes`, `/` renderiza a Visão geral e `/analytics` redireciona.
- `pages/portal-panel-editor.tsx`: mantém a prop `panelId` (testes existentes
  continuam valendo); a rota `/portal/paineis/:id` converte o `:id` e passa a
  prop. `:id` não inteiro redireciona para `/portal/paineis`. O `onBack` sai e
  o caminho de volta passa a ser o `PageHeader` (link para `/portal/paineis`).
- `pages/portal-panels.tsx`: `onEdit(id)` vira link para `/portal/paineis/:id`.
- `pages/campaign-detail.tsx`, `device-detail.tsx`, `company-detail.tsx`,
  `portal-panel-editor.tsx`: adotam `PageHeader`. Trails:
  - Campanha: Empresas › {empresa} › {campanha}
  - TV: Parque de TVs › {nome da TV}
  - Empresa: Empresas › {empresa}
  - Painel do portal: Meus painéis › {painel}
- `pages/analytics.tsx`: título "Visão geral"; conteúdo inalterado neste
  sub-projeto.
- `pages/change-password.tsx`: o formulário sai para
  `components/change-password-form.tsx` (`onSuccess` como prop). A tela de
  primeiro login continua igual, usando o formulário com `onSuccess = onDone`.
  A nova página `pages/portal-account.tsx` (`/portal/conta`) usa o mesmo
  formulário dentro do shell; ao salvar, mostra toast de confirmação, limpa os
  campos e fica na mesma tela.

### API

`GET /api/campaigns/:id` (`routes/advertisers.ts`) ganha `companyId` na
resposta, para o breadcrumb da campanha apontar direto para
`/companies/:companyId` em vez de passar pela rota legada. Campo aditivo: nada
que já consome a resposta quebra. `LegacyRedirect` continua existindo para
links salvos.

## Casos de borda

- **Usuário sem papel de portal e sem admin:** comportamento atual mantido
  (`RoleRouter` mostra `Login`).
- **Usuário que vira admin depois de logado:** `RoleRouter` já escolhe
  `AdminRoutes` pelo `/auth/me`; nada muda.
- **Link antigo do portal:** não existia URL de portal, então não há link
  antigo a preservar além de `/`.
- **`/portal/paineis/:id` de painel de outro cliente:** a API responde
  403/404 como hoje; o editor mostra o erro que já mostra.
- **F5 em qualquer rota:** abre a mesma tela — é o objetivo principal.

## Testes

Vitest + Testing Library, padrão do repo.

- `nav-config`: anunciante só, cliente só, os dois papéis, nenhum papel
  (só "Minha conta").
- `app-shell`: item ativo por prefixo; `/` ativo só na raiz; no celular a
  gaveta abre pelo ☰ e fecha ao clicar num item.
- `page-header`: renderiza o trail com links; no celular mostra só o "‹
  voltar" para o último item com `href`.
- Rotas: `/portal/paineis/7` abre o editor do painel 7; anunciante em
  `/portal/tvs` vai para `/portal/anunciante`; cliente em `/` vai para
  `/portal/tvs`; admin em `/analytics` vai para `/`.
- API: `GET /campaigns/:id` devolve `companyId`.
- Ajustar os testes existentes de `portal-panels`, `portal-panel-editor`,
  `portal-client` e `portal-advertiser` que dependem das abas ou das props
  `onEdit` / `onBack`.

## Fora do escopo

- Conteúdo novo da Visão geral (sub-projeto 2).
- Métricas novas do portal, detalhe por campanha, comprovante (sub-projeto 3).
- Busca global, notificações.
- Mudar `openapi.yaml` das rotas do portal (seguem com `fetch` manual).

## Versão

PR `feat(portal): navegação por rotas e menu lateral no admin e no portal` →
minor.
