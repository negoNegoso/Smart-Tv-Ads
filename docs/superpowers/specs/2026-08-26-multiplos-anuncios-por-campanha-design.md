# Design: Vários anúncios por campanha

## Objetivo

Permitir vincular **vários anúncios (peças)** a uma mesma campanha, em vez de apenas um.
Hoje a campanha já suporta múltiplos anunciantes e dispositivos via tabelas de junção,
mas o anúncio é único (coluna `campaigns.announcement_id`).

## Decisões

- **Modelo de dados:** nova tabela de junção `campaign_announcements`; a coluna
  `campaigns.announcement_id` é migrada para lá e **removida**.
- **Exibição:** cada anúncio da campanha vira um slide próprio na rotação da TV
  (campanha com 3 anúncios contribui com 3 slides). A deduplicação por
  `announcementId` já existente é mantida.
- **Métricas:** total de impressões somado entre todos os anúncios da campanha,
  **mais** detalhamento por anúncio individual.
- **Imagem compartilhada:** se o mesmo anúncio estiver em duas campanhas, ele
  aparece uma única vez na TV (dedupe por `announcementId`) e a impressão conta
  para ambas as campanhas cujas janelas de data cobrirem o momento. Comportamento
  atual preservado.

## 1. Banco de dados

Nova tabela `campaign_announcements` (espelha `campaign_advertisers`):

```
id              serial PK
campaign_id     integer NOT NULL -> campaigns.id  ON DELETE CASCADE
announcement_id integer NOT NULL -> announcements.id ON DELETE CASCADE
unique(campaign_id, announcement_id)
```

Schema Drizzle em `lib/db/src/schema/campaign_announcements.ts`, exportado em
`lib/db/src/schema/index.ts`.

**Migração de dados:**
1. Criar a tabela `campaign_announcements`.
2. `INSERT INTO campaign_announcements (campaign_id, announcement_id)
   SELECT id, announcement_id FROM campaigns` (copia o vínculo atual).
3. Remover a coluna `campaigns.announcement_id` (e sua FK).

## 2. Backend (`artifacts/api-server/src/routes/advertisers.ts`)

- `campaignInput`: adicionar `announcementIds: z.array(...).default([])` e manter
  `announcementId` opcional como atalho retrocompatível. Helper
  `announcementIdsFor(input)` unifica ambos (igual ao `advertiserIdsFor`), exigindo
  no mínimo 1 anúncio (validação retorna 400 se vazio).
- **POST `/campaigns`** e **PATCH `/campaigns/:id`**: dentro da transação, sincronizar
  `campaign_announcements` (deletar+inserir os vínculos). A campanha deixa de gravar
  `announcement_id` na tabela `campaigns`.
- **`campaignWithStats` / `GET /campaigns` / `GET /advertisers/:id`:**
  - Expor `announcementIds: number[]` e `announcementTitles: string[]`
    (via subselect ordenado por título, igual ao padrão de `advertiserNames`).
  - `totalImpressions`: somar impressões de **todos** os anúncios vinculados dentro
    da janela `[startsAt, endsAt]` da campanha (subselect que faz `join` de
    `impressions` com `campaign_announcements`).
  - Novo campo `impressionsByAnnouncement: [{ announcementId, title, impressions }]`
    com o detalhamento por anúncio.

## 3. Exibição (`artifacts/api-server/src/routes/display.ts`)

- Trocar o `innerJoin(announcementsTable, eq(..., campaignsTable.announcementId))`
  por um join via `campaign_announcements`:
  `campaigns -> campaign_announcements -> announcements`.
- Cada linha resultante é um slide (`announcementId`, `title`, `imageUrl`, `duration`).
- O bloco de dedupe por `seen.has(slide.announcementId)` (já existente) permanece
  inalterado, garantindo que uma imagem compartilhada apareça uma única vez.

## 4. Frontend

`artifacts/signage/src/pages/advertisers.tsx`:
- Substituir o `<Select>` único "Anúncio / peça" por um multi-select de checkboxes,
  espelhando o bloco de "Anunciantes"/"TVs".
- Estado `selectedAnnouncements: number[]`. Ao criar/editar, o payload envia
  `announcementIds`. Editar pré-preenche a partir de `campaign.announcementIds`.
- Validação do botão submit: exigir `selectedAdvertisers.length` **e**
  `selectedAnnouncements.length`.
- Na listagem de campanhas, exibir `announcementTitles.join(", ")` no lugar do
  `announcementTitle` único.
- Ajustar o tipo `Campaign` local: `announcementIds: number[]`,
  `announcementTitles: string[]` (remover os campos singulares).

`artifacts/signage/src/pages/advertiser-detail.tsx`:
- Trocar a exibição de `announcementTitle` único por `announcementTitles.join(", ")`.

## Testes / verificação

- O projeto não possui suíte automatizada; validar via `typecheck`/build dos pacotes
  (`api-server`, `signage`, `db`) e verificação manual do fluxo:
  criar campanha com 2 anúncios, editar, checar slides no display e as métricas
  (total somado + por anúncio).

## Fora de escopo

- Atribuição de impressões diferente da contagem por `announcementId` (mantém o
  comportamento atual em que uma imagem compartilhada conta para ambas as campanhas).
- Reordenação de anúncios dentro da campanha.
