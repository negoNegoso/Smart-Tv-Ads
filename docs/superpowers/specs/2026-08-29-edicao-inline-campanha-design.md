# Edição inline e peças unificadas na página da campanha

## Objetivo

Melhorar a experiência de edição na página de detalhe da campanha
(`/campaigns/:id`):

1. **Edição inline** — substituir o modal de edição por um **modo de edição** em
   que os próprios campos da página viram editáveis no lugar onde os elementos
   aparecem.
2. **Peças + QR unificados** — cada peça/anúncio passa a ocupar uma única linha
   que também mostra seu QR code (quando publicado), eliminando a duplicação
   atual em que peças com QR aparecem duas vezes.

## Problema atual

- Editar exige clicar em "Editar" e alterar dentro de um modal, longe de onde os
  dados são exibidos.
- No card "Peças / anúncios", a página renderiza primeiro todas as peças como
  linhas simples e, em seguida, um bloco separado com os QR codes. Peças com QR
  publicado aparecem **duas vezes** e o QR fica descolado do contexto da peça.

## Escopo

- Alterar apenas `artifacts/signage/src/pages/campaign-detail.tsx` e o
  `artifacts/signage/src/components/campaign-form-dialog.tsx`, extraindo a lógica
  compartilhada para um novo hook.
- O modal `CampaignFormDialog` continua existindo, mas só para **criação** em
  `/advertisers`. Não é mais usado no detalhe.

Fora de escopo: backend (as rotas `GET /api/campaigns/:id`, `PATCH
/campaigns/:id`, toggle e delete já atendem), listas de campanha, TV/display.

## Design

### 1. Peças + QR unificados (modo visualização)

O card "Peças / anúncios" passa a renderizar **uma linha por peça** a partir de
`data.announcementLinks`, sem o bloco de QR separado. Cada linha mostra:

- Título da peça.
- Métricas: `{plays} exibições · {scans} scans`.
- Quando a peça tem QR publicado (`scanCode` e `destinationUrl` presentes): o QR
  inline (imagem `api/qr/{scanCode}.png`), a URL de destino, e os botões
  **Copiar link** (copia `${origin}/r/{scanCode}`) e **Baixar PNG**, na mesma
  linha.
- Peças sem QR publicado: apenas título e métricas.

Isso remove a duplicação (a antiga variável `qrLinks` e o segundo `.map` deixam
de existir).

### 2. Modo de edição inline

A página passa a ter um estado local `editing: boolean`. O botão "Editar" do
cabeçalho ativa esse modo em vez de abrir um modal.

**Cabeçalho:**

- Em visualização: mostra toggle Ativa/Pausada, "Editar" e "Excluir" (como hoje).
- Em edição: mostra **Salvar** e **Cancelar**; o toggle e "Excluir" ficam
  ocultos para evitar ações conflitantes durante a edição.

**Campos editáveis, no mesmo lugar dos elementos:**

- **Nome** (o `<h1>`): vira um `Input`.
- **Card Detalhes:**
  - **Anunciante**: `select`/lista de rádio com os anunciantes.
  - **Valor contratado**: `Input` numérico.
  - **Início / Fim**: `Input type="date"`.
  - **Cobertura de TVs**: `Switch` "Publicar em todas as TVs"; quando desmarcado,
    lista de checkboxes de TVs.
- **Card Peças:** em modo de edição, lista os anúncios disponíveis; cada um com:
  - checkbox para incluir/excluir a peça na campanha;
  - `Input` de URL de destino do QR (opcional);
  - o QR inline quando já publicado;
  - aviso quando a peça tem QR publicado: desmarcá-la apaga o vínculo e
    **invalida o QR para sempre** (scan code é imutável).

**Ações:**

- **Salvar**: executa o PATCH (mesma lógica do modal), e em caso de sucesso
  recarrega a campanha via `GET /api/campaigns/:id` e volta a `editing = false`.
  Em erro, mostra toast e permanece em edição.
- **Cancelar**: descarta as alterações (reset do formulário) e volta a
  `editing = false`.

Ao entrar em edição, os dados do formulário são carregados a partir da campanha
atual; os dados auxiliares (anunciantes, anúncios, TVs) são buscados como já é
feito hoje em `loadFormData`.

### 3. Estrutura de código

**Novo hook `artifacts/signage/src/components/use-campaign-form.ts`:**

Encapsula todo o estado do formulário e a lógica de submissão, hoje dentro de
`CampaignFormDialog`:

- Estado: `name`, `contractValue`, `startsAt`, `endsAt`, `selectedAdvertiser`,
  `allDevices`, `selectedDevices`, `selectedAnnouncements`,
  `announcementDestinations`, `publishedScanCodes`.
- `reset(campaign?)`: (re)inicializa o estado a partir de uma campanha (modo
  edição) ou vazio (modo criação, com `lockedAdvertiserId` opcional).
- `submit()`: monta o payload e faz `POST /api/campaigns` (criação) ou `PATCH
  /api/campaigns/:id` (edição); retorna `{ ok: boolean; error?: string }`. Toda
  a lógica sensível (scan codes imutáveis, sincronização de URLs de destino,
  seleção de TVs) fica aqui.

Interface do hook (esboço):

```ts
type UseCampaignFormResult = {
  values: { name, contractValue, startsAt, endsAt, selectedAdvertiser,
            allDevices, selectedDevices, selectedAnnouncements,
            announcementDestinations, publishedScanCodes };
  setters: { ...setName, setContractValue, ... };
  reset: (campaign?: CampaignFormCampaign | null, lockedAdvertiserId?: number) => void;
  submit: () => Promise<{ ok: boolean; error?: string }>;
};
```

**`CampaignFormDialog`:** refatorado para consumir o hook, mantendo exatamente o
mesmo layout e comportamento de modal. Continua sendo usado apenas para criação
em `/advertisers`.

**`campaign-detail.tsx`:** ganha `editing` e consome o hook para o modo de
edição inline. Remove o `CampaignFormDialog` e o estado `editOpen`. O botão
"Editar" passa a chamar uma função que faz `reset(data)` + `loadFormData()` +
`setEditing(true)`.

**Sub-blocos compartilhados (opcional, decidido no plano):** os seletores de
peças e de TVs (listas de checkbox) podem virar pequenos componentes
reutilizados pelo modal e pelo inline, para não duplicar JSX. Não é obrigatório
para o design funcionar.

## Tratamento de erros

- PATCH com falha: toast com a mensagem de erro do backend; permanece em edição.
- `GET /api/campaigns/:id` inexistente: "Campanha não encontrada" (comportamento
  atual mantido).

## Testes / validação

Não há framework de testes de UI no `@workspace/signage`. Validação por:

- `pnpm --filter @workspace/signage typecheck` — sem novos erros nos arquivos
  alterados (os erros pré-existentes de Zod em `admin.tsx`, `client-detail.tsx`,
  `clients.tsx` permanecem e não são deste escopo).
- Conferência manual: entrar em edição, alterar nome/valor/datas/TVs/peças,
  salvar e cancelar; conferir QR inline em cada peça; desmarcar peça com QR
  publicado exibe o aviso; criação em `/advertisers` continua funcionando pelo
  modal.
