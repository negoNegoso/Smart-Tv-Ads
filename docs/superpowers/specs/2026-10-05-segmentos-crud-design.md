# Segmentos: cadastro, mesclar, segmento obrigatório e prévia de alcance — design

Data: 2026-10-05
Branch: `feat/segmentos`

## Objetivo

Fazer a regra do concorrente valer de verdade e ficar visível para o admin.

A regra (`lib/ad-eligibility.ts`) está certa, mas tem três furos de uso:

1. Empresa sem segmento escapa da regra: se o anunciante ou o dono da TV não
   tem segmento, a peça passa. O cadastro hoje aceita segmento vazio.
2. Segmentos só podem ser criados. Não há como renomear, apagar nem juntar
   duplicados — e duplicado ("Padaria" e "Panificadora") também fura a regra.
3. O admin não enxerga o efeito da regra: campanha mirando o próprio ramo, ou
   TVs de concorrente marcadas no modo "TVs escolhidas", salvam sem aviso e
   alcançam menos TVs (ou nenhuma) do que parece.

## Regras decididas

- **Mesmo segmento nunca se cruza, exceto a TV da própria empresa.** A regra
  atual de `canPlayOnDevice` fica como está.
- **Toda empresa precisa de segmento**, seja anunciante, dona de TV ou os dois.
  Ramo sem concorrente na rede ganha um segmento próprio.
- **Empresa antiga sem segmento continua funcionando.** Ela aparece como
  pendente e é obrigada a completar o segmento na próxima edição. Nada sai do
  ar no deploy.
- **Segmento em uso não pode ser apagado.** Para tirar um segmento usado, o
  admin mescla ele em outro.
- **Mesclar une concorrentes.** Empresas que estavam em segmentos diferentes
  passam a ser do mesmo ramo, e as peças entre elas somem das TVs na próxima
  atualização. O diálogo de confirmação avisa isso.
- **A conta de alcance é uma só.** TV, portal e formulário de campanha usam a
  mesma função; o front não reimplementa a regra.
- **Alcance zero avisa, mas não impede salvar.** A campanha pode ser preparada
  antes das TVs existirem.
- Só o admin gerencia segmentos (as rotas já ficam atrás de `requireAdmin`).

## Fora do escopo

- `NOT NULL` em `companies.segment_id`. Fica para uma migration à parte quando
  a contagem de empresas sem segmento chegar a zero.
- Contagem do portal com a TV vitrine (`loadNetwork` conta a vitrine só se ela
  estiver no alvo, mas ela exibe toda campanha). Correção pequena, outra
  entrega.
- Segmentos no portal do cliente ou do anunciante.
- Empresa com mais de um segmento.

## 1. API de segmentos

`routes/segments.ts`, contrato em `lib/api-spec/openapi.yaml` com os tipos
gerados em `api-zod` e `api-client-react`, como as rotas atuais.

| Rota | Comportamento |
|---|---|
| `GET /segments` | Mantém `id`, `slug`, `name`, ordenado por nome. Acrescenta `companyCount` e `campaignCount`. |
| `POST /segments` | Sem mudança: slug sai do nome; slug repetido → 409. |
| `PATCH /segments/:id` `{ name }` | Renomeia e recalcula o slug. Slug de outro segmento → 409 "Já existe o segmento X — use mesclar". Nome que vira slug vazio → 400. Id inexistente → 404. |
| `DELETE /segments/:id` | Só apaga se nenhuma empresa nem campanha usa. Em uso → 409 com `companyCount` e `campaignCount` e a mensagem "Usado por N empresas e M campanhas". Id inexistente → 404. Sucesso → 204. |
| `POST /segments/:id/merge` `{ targetId }` | Mescla a origem (`:id`) no destino. Sucesso → 200 com o segmento destino e as contagens atualizadas. |

## 2. Mesclar

Uma transação:

1. `update companies set segment_id = destino where segment_id = origem`.
2. `insert into campaign_segments (campaign_id, segment_id) select campaign_id,
   destino from campaign_segments where segment_id = origem on conflict do
   nothing` — a campanha pode já mirar os dois, e a tabela tem único
   (campanha, segmento).
3. `delete from segments where id = origem`. O cascade de `campaign_segments`
   remove as linhas que sobraram da origem.

Erros: origem igual ao destino → 400; origem ou destino inexistente → 404.
Falha no meio desfaz tudo.

## 3. Segmento obrigatório

**API (`lib/companies/input.ts` e `lib/companies/store.ts`):**

- Criar: `segmentId` obrigatório. Ausente ou nulo → 400 "Escolha o segmento da
  empresa."
- Editar: `null` explícito → 400 com a mesma mensagem. Se a empresa ainda está
  sem segmento e o corpo não traz `segmentId` → 400 "Complete o segmento antes
  de salvar." Assim qualquer edição de cadastro antigo, até só de status,
  completa o segmento.
- Segmento inexistente → 400 "Segmento não encontrado.", em vez do erro de
  chave estrangeira do banco.

**Banco:** sem migration. A coluna segue aceitando nulo (ver Fora do escopo).
O `onDelete: "set null"` fica, mas deixa de ser alcançável pelo app, porque o
`DELETE` recusa segmento em uso.

**Admin:**

- `company-form-dialog.tsx`: campo segmento obrigatório.
- Lista de empresas e detalhe da empresa: selo **"Sem segmento"** com a dica
  "a regra do concorrente não vale para esta empresa".
- Tela Segmentos: no topo, "N empresas sem segmento", com link para a lista de
  empresas.

## 4. Tela Segmentos

Página nova `/segments` no admin, com item no menu ao lado de Empresas.

- Tabela: nome, empresas, campanhas, ações.
- **Novo segmento:** usa o `POST /segments` existente.
- **Renomear:** edição do nome; o 409 de colisão aparece com a sugestão de
  mesclar.
- **Mesclar:** diálogo para escolher o destino, mostrando quantas empresas e
  campanhas vão mudar e o aviso: "As empresas dos dois segmentos passam a ser
  concorrentes: peças entre elas deixam de tocar nas TVs umas das outras."
- **Apagar:** só habilitado quando as duas contagens são zero. Se a API ainda
  assim responder 409 (alguém usou o segmento no meio do caminho), a tela
  mostra a mensagem e oferece mesclar.

## 5. Prévia de alcance

**Lógica pura (`lib/ad-eligibility.ts`):** nova função
`previewReach(campaign, network)` que devolve:

- `reachedCount`: TVs no alvo onde o anunciante pode tocar;
- `totalDevices`: tamanho da rede;
- `competitorDeviceIds`: TVs da rede inteira onde esse anunciante nunca toca
  (`canPlayOnDevice` falso), estejam ou não no alvo.

`countReachedDevices` passa a devolver `previewReach(...).reachedCount`, para
TV, portal e formulário saírem da mesma conta.

**Rota:** `POST /campaigns/reach-preview` com
`{ advertiserId, targetMode, deviceIds, segmentIds }`. Lê o segmento e a
empresa do anunciante, carrega a rede com `loadNetwork` e devolve
`previewReach` mais `advertiserSegmentId` e `advertiserHasSegment`. Anunciante
inexistente → 404.

## 6. Formulário de campanha

`campaign-form-dialog.tsx` e `use-campaign-form.ts`. A prévia é pedida com
debounce de ~300 ms sempre que o anunciante ou o alvo muda.

- Abaixo do alvo: "Alcança **N** de **M** TVs".
- N = 0: aviso âmbar "Nenhuma TV vai exibir esta campanha." O botão salvar
  continua habilitado.
- Lista de TVs (modo "TVs escolhidas"): TV em `competitorDeviceIds` aparece
  esmaecida com o selo "concorrente · não toca aqui". Continua desmarcável,
  para limpar campanha antiga.
- Lista de segmentos (modo "Por segmento"): o segmento igual ao do anunciante
  leva o selo "mesmo ramo do anunciante · só toca nas TVs dele".
- Anunciante sem segmento: alerta "Anunciante sem segmento: a regra do
  concorrente não vale" com link para a empresa.
- Falha da prévia não bloqueia o formulário: a linha de alcance some e o
  salvar segue normal.

## 7. Testes

- **Unitários (`ad-eligibility.test.ts`):** `previewReach` com concorrente,
  própria TV, anunciante sem segmento, TV sem segmento e cada modo de alvo;
  `countReachedDevices` sem regressão.
- **Rotas:** segmentos (listar com contagens, renomear, 409 de colisão, apagar
  livre, 409 em uso, mesclar com campanha que já mirava os dois, origem igual
  ao destino, 404); empresas (criar sem segmento, editar com `null`, editar
  cadastro antigo sem mandar segmento, segmento inexistente); `reach-preview`.
- **Componentes:** tela Segmentos (renomear, mesclar com aviso, apagar
  desabilitado em uso); formulário de empresa com segmento obrigatório;
  formulário de campanha com contagem, selos, aviso de alcance zero e alerta
  de anunciante sem segmento.
- Seguir o padrão de `routes/__tests__` e `components/__tests__`.
