# Design: Editar anunciantes e campanhas (manutenção)

Data: 2026-08-25

## Problema

Não é possível editar os dados de **anunciantes** nem os valores de **campanhas** depois
de cadastrados. Quando é preciso fazer uma manutenção (corrigir um valor contratado, ajustar
datas, trocar o anúncio, mudar as TVs ou os anunciantes vinculados), a única saída hoje é
excluir e recriar. Precisamos permitir edição completa dos dois.

## Estado atual

- **Anunciantes**: o backend já expõe `PATCH /advertisers/:id` (nome, empresa, e-mail, telefone),
  mas o frontend não tem nenhuma UI de edição — só criação (`advertisers.tsx`) e uma página de
  detalhe somente-leitura (`advertiser-detail.tsx`).
- **Campanhas**: o backend só tem `POST /campaigns`, `PATCH /campaigns/:id/toggle` e
  `DELETE /campaigns/:id`. **Não existe endpoint para editar os valores.** O frontend
  (`advertisers.tsx`) só permite criar, ligar/desligar e excluir.
- Anunciantes e campanhas **não estão no OpenAPI** (`lib/api-spec/openapi.yaml` cobre apenas
  announcements, clients e analytics), por isso essas páginas usam `fetch` cru.

## Abordagem escolhida

**`fetch` cru**, seguindo o padrão já existente em `advertisers.tsx` / `advertiser-detail.tsx`.
Não vamos adicionar esses endpoints ao OpenAPI nem migrar as páginas para hooks tipados neste
trabalho — isso fica como melhoria separada. O objetivo é resolver a dor de manutenção com o
menor risco e mantendo a consistência interna desses arquivos.

## Mudanças

### 1. Backend — `artifacts/api-server/src/routes/advertisers.ts`

#### Anunciante
Nenhuma mudança. `PATCH /advertisers/:id` já cobre nome/empresa/e-mail/telefone.

#### Campanha — novo `PATCH /campaigns/:id` (edição completa)
- Valida o corpo com o `campaignInput` já existente, aplicando a mesma regra
  `endsAt > startsAt` usada no `POST`.
- Retorna `404` se a campanha não existir.
- Reaproveita `advertiserIdsFor(input)` e as mesmas validações do `POST`:
  - pelo menos um anunciante (`Selecione pelo menos um anunciante`);
  - se `!allDevices`, pelo menos uma TV (`Select at least one TV or enable all devices`);
  - todos os anunciantes informados existem (`Um ou mais anunciantes não foram encontrados`).
- Atualiza a linha da campanha: `name`, `announcementId`, `contractValue`, `startsAt`,
  `endsAt`, `allDevices` e `advertiserId` = primeiro id da lista de anunciantes.
- **Substitui** os vínculos de forma idempotente:
  - `campaign_advertisers`: apaga todos os vínculos da campanha e recria a partir de
    `advertiserIds`.
  - `campaign_devices`: apaga todos os vínculos da campanha; recria apenas quando
    `!allDevices` (quando `allDevices`, fica sem vínculos de TV específicos).
- **Preserva** `isActive` e as impressões da campanha (não são tocados na edição).
- Responde com `campaignWithStats(id)`.

#### Ajuste no `GET /campaigns`
Incluir no retorno de cada campanha:
- `advertiserIds`: ids dos anunciantes vinculados (via `campaign_advertisers`);
- `deviceIds`: ids das TVs vinculadas (via `campaign_devices`).

Isso permite que o diálogo de edição pré-preencha corretamente os checkboxes de anunciantes e
TVs. O formato de agregação segue o mesmo padrão SQL já usado para `advertiserNames`.

### 2. Frontend — Anunciante (`artifacts/signage/src/pages/advertiser-detail.tsx`)

- Adicionar um botão com ícone de lápis (`Pencil`) no cabeçalho da página, seguindo o padrão de
  edição já usado em `client-detail.tsx`.
- Ao clicar, abre um `Dialog` com um formulário pré-preenchido com nome, empresa, e-mail e
  telefone do anunciante.
- Ao salvar: `fetch(PATCH /api/advertisers/:id)` com JSON, recarrega os dados da página, fecha o
  diálogo e mostra um toast de sucesso. Em erro, toast destrutivo.
- Mantém o `fetch` cru já usado no arquivo (sem hooks gerados).

### 3. Frontend — Campanha (`artifacts/signage/src/pages/advertisers.tsx`)

- Adicionar um ícone de lápis (`Pencil`) em cada card de campanha, ao lado do switch de
  ativar/pausar e da lixeira.
- Reaproveitar o **mesmo diálogo** de "Nova campanha", transformando-o em modo **criar/editar**:
  - manter um estado com o id da campanha em edição (`null` = criação);
  - ao abrir em modo edição, pré-preencher `campaignForm` (nome, anúncio, valor, datas),
    `allDevices`, `selectedAdvertisers` (a partir de `advertiserIds`) e `selectedDevices`
    (a partir de `deviceIds`);
  - título e botão do diálogo mudam conforme o modo ("Nova campanha publicitária" /
    "Publicar campanha" vs. "Editar campanha" / "Salvar alterações").
- Ao salvar em modo edição: `fetch(PATCH /api/campaigns/:id)` com o mesmo corpo do `POST`,
  depois `load()`, fecha o diálogo, limpa o estado e mostra toast "Campanha atualizada".
- Erros de validação retornados pelo backend são exibidos no toast, igual ao fluxo de criação.

## Tratamento de erros

- Reaproveita o padrão atual: respostas não-OK do backend têm o campo `error` exibido no toast
  destrutivo.
- Validações de datas e de anunciantes/TVs são feitas no backend e retornadas ao usuário.

## Testes (manuais)

- Editar valor e datas de uma campanha **ativa** e confirmar que ela continua ativa e com as
  impressões preservadas.
- Trocar o anúncio, os anunciantes vinculados e alternar entre "todas as TVs" e TVs específicas;
  confirmar que os vínculos são substituídos corretamente.
- Editar os dados de um anunciante e confirmar que a página reflete as mudanças.
- Verificar validações: campanha sem anunciante, sem TV quando `!allDevices`, e `endsAt` anterior
  a `startsAt`.

## Fora de escopo

- Adicionar anunciantes/campanhas ao OpenAPI e migrar as páginas para hooks tipados.
- Qualquer alteração no fluxo de ativar/pausar ou excluir campanhas.
