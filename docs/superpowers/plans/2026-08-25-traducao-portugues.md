# Tradução da interface para português (pt-BR) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Traduzir todos os textos visíveis ao usuário do painel Smart TV Ads para português do Brasil por substituição direta das strings.

**Architecture:** Substituição direta de strings hardcoded em componentes React (`.tsx`), no HTML de exibição (`tv.html`) e nos metadados (`index.html`). Sem biblioteca de i18n. A verificação é feita pelo typecheck/build do pacote `signage` (não há testes de UI aplicáveis a strings estáticas).

**Tech Stack:** React + TypeScript, Vite, Tailwind, wouter, react-hook-form + Zod, pnpm workspaces.

**Comando de validação (usado no fim de cada tarefa de código):**
```
pnpm --filter @workspace/signage typecheck
```
Espera-se: sem erros de TypeScript. O build completo (`pnpm --filter @workspace/signage build`) é rodado uma vez na tarefa final.

**Glossário (aplicar consistentemente):** Clients→Clientes, Client→Cliente, Devices→Dispositivos/TVs, Device→Dispositivo/TV, Media Library→Biblioteca de Mídia, Analytics→Análises, Advertisers→Anunciantes, Announcement(s)→Anúncio(s), Playlist→Playlist, Impressions→Impressões, Display Time→Tempo de exibição, Add→Adicionar, New→Novo/Nova, Loading...→Carregando..., Summary→Resumo, Total→Total, Location→Local, Name→Nome.

**Regra geral:** NÃO alterar nomes de rotas/URLs, chaves de objeto, nomes de variáveis, tipos, `className`, nem valores enviados à API. Traduzir apenas texto que o usuário lê (incluindo `aria-label`, `sr-only`, `alt`, `placeholder`, `<title>`, meta tags).

---

### Task 1: Marca e navegação (`layout.tsx`)

**Files:**
- Modify: `artifacts/signage/src/components/layout.tsx`

- [ ] **Step 1: Traduzir marca e labels de navegação**

Trocar `<span>SignageOS</span>` por `<span>Painel de Anúncios</span>`.

No array `navItems`, traduzir os `label`:

| Antes | Depois |
|---|---|
| `label: 'Clients'` | `label: 'Clientes'` |
| `label: 'Media Library'` | `label: 'Biblioteca de Mídia'` |
| `label: 'Analytics'` | `label: 'Análises'` |
| `label: 'Advertisers'` | `label: 'Anunciantes'` |

Não alterar os `href` nem os ícones.

- [ ] **Step 2: Validar**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add artifacts/signage/src/components/layout.tsx
git commit -m "i18n: traduzir navegação e marca para pt-BR"
```

---

### Task 2: Página de clientes (`clients.tsx`)

**Files:**
- Modify: `artifacts/signage/src/pages/clients.tsx`

- [ ] **Step 1: Traduzir validação Zod, toasts e textos**

Schema Zod:

| Antes | Depois |
|---|---|
| `'Name is required'` | `'O nome é obrigatório'` |
| `'Invalid email'` | `'E-mail inválido'` |

Toasts:

| Antes | Depois |
|---|---|
| `'Client created'` | `'Cliente cadastrado'` |
| `'Failed to create client'` | `'Não foi possível cadastrar o cliente'` |
| `'Client deleted'` | `'Cliente excluído'` |
| `'Failed to delete client'` | `'Não foi possível excluir o cliente'` |

Textos JSX:

| Antes | Depois |
|---|---|
| `Clients` (h1) | `Clientes` |
| `Manage your signage clients and their devices.` | `Gerencie seus clientes e as TVs de cada um.` |
| `New Client` (botão e DialogTitle) | `Novo cliente` |
| `Name` (FormLabel) | `Nome` |
| `Email (optional)` | `E-mail (opcional)` |
| `Phone (optional)` | `Telefone (opcional)` |
| `Create Client` | `Cadastrar cliente` |
| `No clients yet.` | `Nenhum cliente ainda.` |
| `Create your first client to get started.` | `Cadastre seu primeiro cliente para começar.` |
| `Summary` | `Resumo` |
| `Total clients` | `Total de clientes` |
| `Total devices` | `Total de TVs` |

Contador de dispositivos:
```tsx
<span>{client.deviceCount} {client.deviceCount === 1 ? 'device' : 'devices'}</span>
```
vira:
```tsx
<span>{client.deviceCount} {client.deviceCount === 1 ? 'TV' : 'TVs'}</span>
```

Não alterar os placeholders `"Acme Corp"`, `"contact@acme.com"`, `"+55 11 99999-9999"` (exemplos neutros — manter).

- [ ] **Step 2: Validar**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add artifacts/signage/src/pages/clients.tsx
git commit -m "i18n: traduzir página de clientes para pt-BR"
```

---

### Task 3: Detalhe do cliente (`client-detail.tsx`)

**Files:**
- Modify: `artifacts/signage/src/pages/client-detail.tsx`

- [ ] **Step 1: Traduzir validação, toasts e textos**

Schema Zod: `'Name is required'` → `'O nome é obrigatório'`.

Toasts:

| Antes | Depois |
|---|---|
| `'Device created'` | `'TV cadastrada'` |
| `'Failed to create device'` | `'Não foi possível cadastrar a TV'` |
| `'Device deleted'` | `'TV excluída'` |
| `'Failed to delete device'` | `'Não foi possível excluir a TV'` |

Textos JSX:

| Antes | Depois |
|---|---|
| `Client not found.` | `Cliente não encontrado.` |
| `Back to clients` (link) | `Voltar para clientes` |
| `Clients` (botão voltar) | `Clientes` |
| `Devices` (h2) | `TVs` |
| `Add Device` (botão, DialogTitle e botão de submit) | `Adicionar TV` |
| `Name` (FormLabel) | `Nome` |
| `Location (optional)` | `Local (opcional)` |
| `No devices yet.` | `Nenhuma TV ainda.` |
| `Add a device to start configuring playlists.` | `Adicione uma TV para começar a configurar as playlists.` |

Contador:
```tsx
<span>{client.deviceCount} {client.deviceCount === 1 ? 'device' : 'devices'}</span>
```
vira:
```tsx
<span>{client.deviceCount} {client.deviceCount === 1 ? 'TV' : 'TVs'}</span>
```

"Last seen" (data do dispositivo):
```tsx
Last seen {new Date(device.lastSeenAt).toLocaleDateString()}
```
vira:
```tsx
Visto por último em {new Date(device.lastSeenAt).toLocaleDateString('pt-BR')}
```

Manter placeholders `"Reception TV"` → traduzir para `"TV da recepção"` e `"Main entrance"` → `"Entrada principal"` (são exemplos visíveis ao usuário).

- [ ] **Step 2: Validar**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add artifacts/signage/src/pages/client-detail.tsx
git commit -m "i18n: traduzir detalhe do cliente para pt-BR"
```

---

### Task 4: Detalhe do dispositivo (`device-detail.tsx`)

**Files:**
- Modify: `artifacts/signage/src/pages/device-detail.tsx`

- [ ] **Step 1: Traduzir toasts, abas e textos**

Toasts:

| Antes | Depois |
|---|---|
| `'Already in playlist or failed'` | `'Já está na playlist ou falhou'` |
| `'Failed to remove'` | `'Não foi possível remover'` |
| `'Failed to reorder'` | `'Não foi possível reordenar'` |
| `'Failed to toggle'` | `'Não foi possível alterar o status'` |
| `'Failed to copy'` | `'Não foi possível copiar'` |

Textos da aba de playlist (`PlaylistTab`):

| Antes | Depois |
|---|---|
| `{playlist.length} items in playlist` | `{playlist.length} itens na playlist` |
| `Add Announcement` (botão) | `Adicionar anúncio` |
| `Add to Playlist` (DialogTitle) | `Adicionar à playlist` |
| `All announcements are already in the playlist.` | `Todos os anúncios já estão na playlist.` |
| `No announcements in playlist. Add one above.` | `Nenhum anúncio na playlist. Adicione um acima.` |

Textos da aba de análises (`AnalyticsTab`):

| Antes | Depois |
|---|---|
| `Total Impressions` | `Total de impressões` |
| `Total Display Time` | `Tempo total de exibição` |
| `No impressions recorded yet.` | `Nenhuma impressão registrada ainda.` |
| `By Announcement` (CardTitle) | `Por anúncio` |
| `Announcement` (th) | `Anúncio` |
| `Impressions` (th) | `Impressões` |
| `Time` (th) | `Tempo` |

Textos do componente principal (`DeviceDetail`):

| Antes | Depois |
|---|---|
| `Device not found.` | `Dispositivo não encontrado.` |
| `Back to clients` (link) | `Voltar para clientes` |
| `TV URL:` | `URL da TV:` |

Rótulos das abas: hoje são renderizados a partir do id da aba com `capitalize`:
```tsx
{(['playlist', 'analytics'] as const).map((t) => (
  ...
  className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 ...`}
  ...
  >
    {t}
  </button>
))}
```
Substituir o texto exibido `{t}` por um rótulo traduzido, mantendo os ids `'playlist'`/`'analytics'` intactos (usados na lógica). Remover `capitalize` do className (rótulos já vêm capitalizados):
```tsx
{(['playlist', 'analytics'] as const).map((t) => (
  ...
  className={`px-4 py-2.5 text-sm font-medium border-b-2 ...`}
  ...
  >
    {t === 'playlist' ? 'Playlist' : 'Análises'}
  </button>
))}
```

- [ ] **Step 2: Validar**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add artifacts/signage/src/pages/device-detail.tsx
git commit -m "i18n: traduzir detalhe do dispositivo para pt-BR"
```

---

### Task 5: Biblioteca de mídia / anúncios (`admin.tsx`)

**Files:**
- Modify: `artifacts/signage/src/pages/admin.tsx`

- [ ] **Step 1: Traduzir validação Zod, toasts e textos**

Schema Zod:

| Antes | Depois |
|---|---|
| `'Title is required'` | `'O título é obrigatório'` |
| `'Must be at least 1 second'` | `'Deve ser no mínimo 1 segundo'` |
| `'Image is required'` | `'A imagem é obrigatória'` |

Toasts:

| Antes | Depois |
|---|---|
| `'Failed to reorder'` | `'Não foi possível reordenar'` |
| `'Failed to toggle status'` | `'Não foi possível alterar o status'` |
| `'Announcement deleted'` | `'Anúncio excluído'` |
| `'Failed to delete'` | `'Não foi possível excluir'` |
| `'Announcement created successfully'` | `'Anúncio criado com sucesso'` |
| title `'Upload failed'` / description `'Please try again.'` | title `'Falha no envio'` / description `'Tente novamente.'` |

`sr-only`: `Delete` → `Excluir`.

Estado ativo/oculto da linha:
```tsx
{item.isActive ? 'Active' : 'Hidden'}
```
vira:
```tsx
{item.isActive ? 'Ativo' : 'Oculto'}
```

Duração da linha:
```tsx
<p className="...">{item.duration}s duration</p>
```
vira:
```tsx
<p className="...">{item.duration}s de duração</p>
```

Textos do cabeçalho e cartões:

| Antes | Depois |
|---|---|
| `Announcements` (h1) | `Anúncios` |
| `Manage what plays on your digital displays.` | `Gerencie o que aparece nas suas TVs.` |
| `Active` (cartão) | `Ativos` |
| `Total` (cartão) | `Total` |
| `New Slide` (botão) | `Novo slide` |
| `Add Announcement` (DialogTitle) | `Adicionar anúncio` |
| `Upload an image and set its duration to appear in the rotation.` | `Envie uma imagem e defina a duração para entrar na rotação.` |
| `Title` (FormLabel) | `Título` |
| `Duration (seconds)` | `Duração (segundos)` |
| `Image File` | `Arquivo de imagem` |
| placeholder `E.g., Winter Promo` | `Ex.: Promoção de inverno` |

Botão de submit:
```tsx
{isUploading ? 'Uploading...' : 'Save & Publish'}
```
vira:
```tsx
{isUploading ? 'Enviando...' : 'Salvar e publicar'}
```

Estado vazio:

| Antes | Depois |
|---|---|
| `No announcements` | `Nenhum anúncio` |
| `You haven't added any announcements yet. Upload your first slide to start the broadcast.` | `Você ainda não adicionou nenhum anúncio. Envie seu primeiro slide para começar a exibição.` |
| `Add your first slide` | `Adicionar seu primeiro slide` |

- [ ] **Step 2: Validar**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add artifacts/signage/src/pages/admin.tsx
git commit -m "i18n: traduzir biblioteca de mídia para pt-BR"
```

---

### Task 6: Página de análises (`analytics.tsx`)

**Files:**
- Modify: `artifacts/signage/src/pages/analytics.tsx`

- [ ] **Step 1: Traduzir textos**

| Antes | Depois |
|---|---|
| `Analytics` (h1) | `Análises` |
| `Platform-wide impression and uptime statistics.` | `Estatísticas de impressões e disponibilidade de toda a rede.` |
| `Total Clients` | `Total de clientes` |
| `Total Devices` | `Total de TVs` |
| `Total Impressions` | `Total de impressões` |
| `Total Display Time` | `Tempo total de exibição` |
| `Top Announcements` (CardTitle) | `Anúncios em destaque` |
| `No impressions recorded yet.` | `Nenhuma impressão registrada ainda.` |
| `Announcement` (th) | `Anúncio` |
| `Impressions` (th) | `Impressões` |
| `Display Time` (th) | `Tempo de exibição` |

Não alterar a função `formatDuration` (sufixos `s`/`m`/`h` são unidades neutras).

- [ ] **Step 2: Validar**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add artifacts/signage/src/pages/analytics.tsx
git commit -m "i18n: traduzir página de análises para pt-BR"
```

---

### Task 7: Estados vazios da exibição (`display.tsx`)

**Files:**
- Modify: `artifacts/signage/src/pages/display.tsx`

- [ ] **Step 1: Traduzir os textos do `EmptyState`**

Primeiro estado (sem dispositivo):

| Antes | Depois |
|---|---|
| `title="No device configured"` | `title="Dispositivo não configurado"` |
| `subtitle="Open the admin panel to get a TV display URL for this device."` | `subtitle="Abra o painel admin para obter a URL de exibição desta TV."` |

Segundo estado (sem slides):

| Antes | Depois |
|---|---|
| `title="No slides configured for this display"` | `title="Nenhum slide configurado para esta tela"` |
| `subtitle="Go to the device settings and add announcements to its playlist."` | `subtitle="Acesse as configurações da TV e adicione anúncios à playlist."` |

Não alterar a lógica de impressão nem o SVG.

- [ ] **Step 2: Validar**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add artifacts/signage/src/pages/display.tsx
git commit -m "i18n: traduzir estados vazios da exibição para pt-BR"
```

---

### Task 8: Página 404 (`not-found.tsx`)

**Files:**
- Modify: `artifacts/signage/src/pages/not-found.tsx`

- [ ] **Step 1: Traduzir textos**

| Antes | Depois |
|---|---|
| `404 Page Not Found` | `404 Página não encontrada` |
| `Did you forget to add the page to the router?` | `Esqueceu de adicionar a página ao roteador?` |

- [ ] **Step 2: Validar**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add artifacts/signage/src/pages/not-found.tsx
git commit -m "i18n: traduzir página 404 para pt-BR"
```

---

### Task 9: Consistência em anunciantes (`advertisers.tsx`, `advertiser-detail.tsx`)

**Files:**
- Modify: `artifacts/signage/src/pages/advertisers.tsx`
- Modify: `artifacts/signage/src/pages/advertiser-detail.tsx`

- [ ] **Step 1: Traduzir os poucos textos remanescentes em inglês**

Em `advertisers.tsx`:

| Antes | Depois |
|---|---|
| `<h1 className="text-3xl font-bold tracking-tight">Advertisers</h1>` | `<h1 className="text-3xl font-bold tracking-tight">Anunciantes</h1>` |

Em `advertiser-detail.tsx`, o botão de voltar:
```tsx
<ArrowLeft className="mr-1 h-4 w-4" />Advertisers</Button>
```
vira:
```tsx
<ArrowLeft className="mr-1 h-4 w-4" />Anunciantes</Button>
```

O restante desses arquivos já está em português — não alterar.

- [ ] **Step 2: Validar**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add artifacts/signage/src/pages/advertisers.tsx artifacts/signage/src/pages/advertiser-detail.tsx
git commit -m "i18n: padronizar título de anunciantes em pt-BR"
```

---

### Task 10: Metadados e título da TV (`index.html`, `tv.html`)

**Files:**
- Modify: `artifacts/signage/index.html`
- Modify: `artifacts/signage/public/tv.html`

- [ ] **Step 1: Traduzir metadados de `index.html`**

Trocar `<html lang="en">` por `<html lang="pt-BR">`.

Nas meta tags, substituir todas as ocorrências do texto de descrição em inglês:

`Painel de Anúncios — built on Replit. Update this description to reflect the app.`
→
`Painel de Anúncios — gerencie os anúncios exibidos nas suas TVs.`

(aparece em `meta[name="description"]`, `meta[property="og:description"]` e `meta[name="twitter:description"]`). Os títulos já estão em `Painel de Anúncios` — manter.

- [ ] **Step 2: Traduzir o título de `tv.html`**

Trocar `<title>Display</title>` por `<title>Exibição</title>`. O restante do arquivo já está em pt-BR — não alterar.

- [ ] **Step 3: Commit**

```bash
git add artifacts/signage/index.html artifacts/signage/public/tv.html
git commit -m "i18n: traduzir metadados e título da exibição para pt-BR"
```

---

### Task 11: Validação final (build completo)

**Files:** nenhum (apenas verificação)

- [ ] **Step 1: Rodar o build do pacote signage**

Run: `pnpm --filter @workspace/signage build`
Expected: build conclui com sucesso, sem erros de TypeScript nem de Vite.

- [ ] **Step 2: Revisão manual de strings remanescentes**

Run:
```bash
grep -rnE "Loading\.\.\.|Failed to|No [a-z]+ (yet|configured)|Back to|Add [A-Z]|Total [A-Z]" artifacts/signage/src artifacts/signage/index.html artifacts/signage/public/tv.html
```
Expected: nenhuma linha de texto voltado ao usuário em inglês (ignorar nomes de variáveis/rotas). Corrigir qualquer resquício encontrado e recomeçar a partir do Step 1.

- [ ] **Step 3: Commit (se o Step 2 exigiu correções)**

```bash
git add -A
git commit -m "i18n: corrigir strings remanescentes em pt-BR"
```

---

## Self-Review (preenchido pelo autor do plano)

- **Cobertura do spec:** cada arquivo listado no spec tem uma tarefa (Tasks 1–10); Task 11 cobre a validação exigida pelo spec. ✔
- **Placeholders:** nenhuma tarefa contém TBD/TODO; todas as traduções estão explícitas em tabelas. ✔
- **Consistência de termos:** Devices renderizados como "TVs" de forma consistente entre `clients.tsx`, `client-detail.tsx` e `advertisers.tsx` (que já usa "TVs"); "Impressões", "Tempo de exibição" e "Anúncio" uniformes entre `analytics.tsx` e `device-detail.tsx`. ✔
- **Escopo:** backend e i18n permanecem fora de escopo, conforme spec. ✔
