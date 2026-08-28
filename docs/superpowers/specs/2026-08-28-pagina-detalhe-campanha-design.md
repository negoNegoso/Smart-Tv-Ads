# Página dedicada de detalhe da campanha

## Objetivo

Melhorar a experiência da área de campanhas criando uma **página específica para
os detalhes de uma campanha** (`/campaigns/:id`) e simplificando as listas de
campanha (em `/advertisers` e `/advertisers/:id`) para exibirem **apenas linhas
clicáveis** que abrem essa página.

Hoje os detalhes de campanha (QR codes, métricas, editar, excluir, toggle) ficam
espalhados inline nas listas, deixando as telas pesadas. A mudança concentra
esses detalhes/ações em uma página dedicada e mantém as listas enxutas.

## Escopo

- Nova rota e página `/campaigns/:id`.
- Novo endpoint `GET /api/campaigns/:id`.
- Simplificação das listas de campanha em **duas** telas: `/advertisers` e
  `/advertisers/:id`.
- Extração do formulário de criar/editar campanha para um componente
  compartilhado.

Fora de escopo: mudanças de schema/banco, alterações na TV/display, analytics.

## Backend

Adicionar `GET /api/campaigns/:id` em
`artifacts/api-server/src/routes/advertisers.ts`, reutilizando o helper já
existente `campaignWithStats(campaignId)`, que retorna a campanha completa
(`announcementLinks`, `plays`, `scans`, `contractValue`, `deviceIds`, `devices`,
`allDevices`, `isActive`, `advertiserId`, `advertiserName`, período etc.).

- 200 com o objeto da campanha quando encontrada.
- 404 `{ error: "Campaign not found" }` quando não existir.

Sem mudanças de schema. As rotas existentes de toggle (`PATCH
/campaigns/:id/toggle`), edição (`PATCH /campaigns/:id`) e exclusão (`DELETE
/campaigns/:id`) permanecem inalteradas e são consumidas pela nova página.

## Frontend

### Nova página `pages/campaign-detail.tsx`

Registrada em `App.tsx` dentro de `AdminRoutes`:
`<Route path="/campaigns/:id"><Layout><CampaignDetail /></Layout></Route>`.

Busca dados via `GET /api/campaigns/:id`. Layout, de cima para baixo:

1. **Cabeçalho**: botão voltar (para o anunciante de origem,
   `/advertisers/:advertiserId`), nome da campanha, selo Ativa/Pausada e, à
   direita, as ações: **toggle** ativar/pausar, **Editar** (abre
   `CampaignFormDialog` em modo edição) e **Excluir** (confirma, chama `DELETE`
   e navega de volta para o anunciante).
2. **Metadados**: anunciante, período (datas), cobertura de TVs (todas as TVs ou
   lista das TVs selecionadas) e valor contratado.
3. **Métricas**: cards com exibições, scans e taxa de conversão.
4. **Peças/anúncios**: lista com métricas por peça (exibições, scans). Quando a
   peça tiver QR publicado (`scanCode` + `destinationUrl`), exibe o QR code com
   os botões "Copiar link" e "Baixar PNG" (mesmo comportamento atual).

Após editar (via dialog) ou alternar o toggle, os dados da página são
recarregados. Após excluir, navega de volta para o anunciante.

### Componente compartilhado `components/campaign-form-dialog.tsx`

Extrai o formulário de criar/editar campanha hoje embutido em `advertisers.tsx`,
encapsulando todo o estado disperso (peças selecionadas, destinos de QR,
`publishedScanCodes`, TVs selecionadas, `allDevices`, datas, valor) e a lógica de
POST/PATCH, incluindo o tratamento sensível de scan codes imutáveis e destinos.

Props:

- `open`, `onOpenChange`
- `advertisers`, `announcements`, `devices` (dados para os seletores)
- `campaign?: Campaign | null` — presente = modo edição; ausente = criação
- `lockedAdvertiserId?: number` — opcional, pré-seleciona o anunciante (não
  usado agora; mantém a porta aberta)
- `onSaved: () => void` — callback para o consumidor recarregar/invalidar

Consumidores:

- `/advertisers`: usa para **criar** (botão "Nova campanha" mantido).
- `/campaigns/:id`: usa para **editar** a campanha atual.

Fonte única de verdade para a lógica delicada, eliminando duplicação e
encolhendo `advertisers.tsx`.

### Componente de linha `CampaignRow`

Linha enxuta e clicável reutilizada nas duas listas, exibindo:

- Nome da campanha
- Selo Ativa/Pausada
- Período (datas de início e fim)
- Toggle ativar/pausar inline (usa `stopPropagation`/`preventDefault` para não
  navegar ao alternar)

Clicar na linha (fora do toggle) navega para `/campaigns/:id`. Editar, excluir,
QR codes e métricas detalhadas **não** aparecem na linha.

### Ajustes nas telas existentes

- **`pages/advertisers.tsx`**: o card "Campanhas" passa a renderizar
  `CampaignRow`; remove QR inline, botões editar/excluir e métricas extras das
  linhas. Mantém o botão "Nova campanha" usando `CampaignFormDialog` em modo
  criação. O código do formulário sai deste arquivo.
- **`pages/advertiser-detail.tsx`**: os cards expandidos de campanha viram
  `CampaignRow`, cada um linkando para `/campaigns/:id`.

## Fluxo de dados

`/advertisers` e `/advertisers/:id` → linhas (`CampaignRow`) → clique abre
`/campaigns/:id` → página busca `GET /api/campaigns/:id` → ações (toggle/editar/
excluir) chamam as rotas existentes e recarregam ou navegam.

## Tratamento de erros

- `GET /api/campaigns/:id` inexistente: página exibe "Campanha não encontrada".
- Falhas de toggle/editar/excluir: toast de erro, mantendo o padrão atual.

## Testes / validação

O projeto não possui suíte de testes de UI. Validação por:

- `pnpm typecheck` (sem erros de tipo).
- Conferência manual: navegar pelas linhas até o detalhe, editar via dialog,
  alternar toggle, excluir, e conferir QR/métricas.
