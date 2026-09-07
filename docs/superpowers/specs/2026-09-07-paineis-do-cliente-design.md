# Painéis do cliente: cardápio, promoção e aviso

Data: 2026-09-07

## Problema

Hoje só o admin cria conteúdo. `announcements` é alimentada pela tela de admin,
e o portal do cliente (`pages/portal-client.tsx`) é somente leitura: KPIs,
evolução e status das TVs. O lojista que quer colocar o cardápio ou uma
promoção na própria TV precisa pedir para o admin montar a imagem e subir.

Isso trava o produto em dois pontos:

1. **Latência humana.** Mudar o preço de um item depende de outra pessoa.
2. **Custo por cliente.** Cada lojista novo adiciona trabalho manual recorrente,
   e não trabalho de configuração única.

O objetivo é o cliente cadastrar o conteúdo dele e publicar, virando painel nas
TVs que já são dele, sem passar pelo admin.

## Escopo

Três tipos de painel:

- **Cardápio** — lista de itens (nome, descrição, categoria, preço). Sem foto.
  Paginado automaticamente; cada página vira um slide.
- **Promoção** — item único em destaque, com foto, preço "de/por".
- **Aviso** — headline + corpo, sem preço e sem item.

Publicação é **automática nas TVs do próprio cliente**. Sem fila de aprovação
do admin. O admin mantém o poder de despublicar.

Fora de escopo, decidido explicitamente: editor livre de layout, fonte/cor por
cliente, agendamento por horário do painel, cardápio com foto por item.

## Decisão central: renderizar no servidor, entregar imagem

Existem dois players e eles precisam concordar: `pages/display.tsx` (React) e
`public/tv.html` (JS puro, escrito para navegador velho de Smart TV). O código
já carrega a cicatriz de regra duplicada entre os dois — ver o comentário em
`lib/slide-caption.ts` sobre "não divergirem".

Um painel publicado é renderizado **no servidor** para PNG 1920×1080 e vira uma
`announcements` comum com `mediaKind: 'image'`.

Consequência: **nenhuma linha muda nos dois players.** Telemetria de play,
dedupe, ordenação e o `tv.html` antigo funcionam sem alteração.

Alternativas descartadas:

- **`mediaKind: 'panel'` com JSON, cada player desenha.** Texto nítido em
  qualquer resolução e edição sem regenerar arquivo, ao custo de escrever e
  manter o mesmo template duas vezes, uma delas em JS puro para TV antiga.
- **`mediaKind: 'web'` com iframe de `/panel/:id`.** Um template só, mas empurra
  o risco de renderização para o aparelho: iframe em webOS/Tizen antigo falha
  em silêncio, numa tela que ninguém está olhando.

Ambas movem risco para o elo mais frágil da cadeia. A imagem é o único formato
que o pipeline inteiro já sabe transportar, contar e exibir.

### Pilha de renderização

`satori` (layout flex → SVG, com o texto já convertido em `path`) seguido de
`@resvg/resvg-wasm` (SVG → PNG).

O resvg é o **WASM**, não o binário nativo: a função da Vercel é montada por
`scripts/build-vercel.mjs` com esbuild pela Build Output API v3, e um `.node`
nativo nesse caminho é dor garantida. O WASM é um arquivo copiado pelo build.

Duas fontes `.ttf` (regular e bold) entram como asset da API. Como satori
converte texto em path, nada depende de fonte no momento da exibição.

## Modelo de dados

Drizzle, em `lib/db/src/schema/`. Uma tabela por arquivo, seguindo o padrão
existente, exportadas por `schema/index.ts`.

### `panels`

Cadastro do cliente. É a fonte da verdade editável.

| coluna | tipo | nota |
| --- | --- | --- |
| `id` | serial PK | |
| `client_id` | integer NOT NULL | FK `clients`, `on delete cascade` |
| `kind` | text NOT NULL | `menu` \| `promo` \| `notice` |
| `name` | text NOT NULL | rótulo interno, não vai para a tela |
| `template` | text NOT NULL | slug do layout |
| `status` | text NOT NULL default `draft` | `draft` \| `published` |
| `duration` | integer NOT NULL default 10 | segundos por slide gerado |
| `headline` | text | promo e aviso |
| `body` | text | promo e aviso |
| `published_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | padrão do projeto, com `$onUpdate` |

### `panel_items`

Linhas do cardápio. Promo usa exatamente uma. Aviso usa nenhuma.

| coluna | tipo | nota |
| --- | --- | --- |
| `id` | serial PK | |
| `panel_id` | integer NOT NULL | FK `panels`, cascade |
| `name` | text NOT NULL | |
| `description` | text | |
| `price_cents` | integer NOT NULL default 0 | |
| `old_price_cents` | integer | o "de" do "de/por" |
| `category` | text | agrupa no cardápio; nulo cai em um grupo sem título |
| `image_url` | text | só promo |
| `display_order` | integer NOT NULL default 0 | |
| `is_active` | boolean NOT NULL default true | |

**Preço em centavos inteiro**, divergindo de `campaigns.contract_value`
(`real`). Float erra centavo em soma e formatação, e aqui o número é o preço que
o cliente mostra ao consumidor dele.

**Aviso não cria item fantasma.** Painel com `headline`/`body` e zero itens.

### `panel_slides`

O rastro da renderização: liga painel à peça gerada.

| coluna | tipo | nota |
| --- | --- | --- |
| `id` | serial PK | |
| `panel_id` | integer NOT NULL | FK `panels`, cascade |
| `page_no` | integer NOT NULL | 1-based |
| `announcement_id` | integer NOT NULL | FK `announcements`, cascade |

Sem essa tabela, republicar acumula lixo: é ela que diz quais peças e PNGs da
publicação anterior apagar.

### Alteração em `announcements`

Uma coluna: `source` text NOT NULL default `'admin'`, com valor `'panel'` nas
peças geradas. Serve para o admin distinguir peça gerada de peça que ele subiu,
e para filtrar listagens. O dono sai por join
(`panel_slides → panels.client_id`); `client_id` não é duplicado aqui.

O default mantém o servidor da versão anterior funcionando durante o deploy.

### Índices

- `panel_slides(panel_id)`
- `panels(client_id, status)`

Ambos servem a query nova de `display.ts`, que roda a cada 60 s por TV.

## Como o painel chega na TV

`display.ts` ganha uma **terceira fonte** de slides, além da playlist do device
e das campanhas:

```
panel_slides → panels  onde panels.client_id = device.client_id
                        e   panels.status    = 'published'
```

Entra junto com a playlist do próprio device, na mesma prioridade: conteúdo do
lojista, atrás das campanhas elegíveis. A ordem é `page_no` dentro do painel.

**Não são criadas linhas em `device_playlist`.** Uma linha lá congelaria "quais
TVs o cliente tinha no dia da publicação": TV nova ficaria sem cardápio até
alguém republicar, TV removida deixaria lixo. O vínculo real é cliente→TVs e já
existe em `devices.client_id`.

Preço dessa escolha: o admin perde o controle por-TV que a tela de playlist dá
hoje — não há como tirar o cardápio de uma TV específica do cliente. O controle
fica no nível do painel (despublicar). Se o controle por-TV passar a importar,
a volta é criar linhas em `device_playlist` no publish.

Telemetria e QR não mudam: o slide gerado é imagem comum, conta `play` como
qualquer outra, com `campaignId` e `scanCode` nulos.

## API

Todas sob `/api/portal/client/panels`, com `requireClient` e verificação de que
`panel.client_id` está em `req.auth.clientIds` (admin passa). Sem essa
verificação, trocar o id na URL publica no cardápio de outro cliente.

| rota | efeito |
| --- | --- |
| `GET /panels` | lista os painéis do cliente com itens e estado |
| `POST /panels` | cria rascunho |
| `PATCH /panels/:id` | nome, template, duração, headline, body |
| `PUT /panels/:id/items` | substitui a lista inteira de itens, em transação |
| `POST /panels/:id/publish` | renderiza e coloca no ar |
| `POST /panels/:id/unpublish` | tira do ar, mantém o cadastro |
| `DELETE /panels/:id` | despublica e apaga |
| `POST /panels/:id/image` | foto da promo, via `MediaStore` e `MAX_UPLOAD_BYTES` |

`PUT /panels/:id/items` substitui tudo de uma vez em vez de expor CRUD por item:
o editor é uma tabela onde o cliente mexe em várias linhas antes de salvar, e um
POST por linha é onde nasce estado meio-salvo.

As rotas entram no `lib/api-spec/openapi.yaml` e no cliente gerado pelo orval.
Isso diverge do precedente do portal, que usa `fetch` cru em
`portal-client.tsx`, e é deliberado: essas são mutações com payload real, onde
um tipo errado só apareceria em produção. As leituras de dashboard existentes
ficam como estão.

## Fluxo de publicação

1. Autoriza: `requireClient` e dono do painel.
2. Pagina os itens conforme o template (cardápio: 8 itens por tela, respeitando
   quebra de categoria). Promo e aviso: uma página.
3. Renderiza cada página 1920×1080 → PNG → `mediaStore.put`.
4. Em transação: apaga as `announcements` da publicação anterior (via
   `panel_slides`), insere as novas com `source='panel'`,
   `mediaKind='image'` e `duration` do painel, insere as novas `panel_slides`.
5. Depois do commit, remove as imagens antigas com `mediaStore.remove` —
   remoção de arquivo não participa de rollback.
6. `status='published'`, `published_at = now()`.

## Erros

- **Render falha** (nome absurdo, foto corrompida): 422 informando a página que
  falhou, publicação anterior **intacta**. O cliente segue com o cardápio antigo
  no ar em vez de ficar com a TV vazia.
- **`mediaStore.put` falha no meio das páginas**: a transação não commita; os
  PNGs já gravados são apagados no `catch`. Se esse apagar também falhar, sobra
  lixo no Blob: aceito e registrado em log, sem coletor de lixo nesta entrega.
- **Cliente sem TV vinculada** publica normalmente; a tela avisa que ainda não
  há TV para exibir.

## Frontend

Em `artifacts/signage/src/pages/`:

- `portal-panels.tsx` — lista de painéis, estado (Rascunho / No ar desde …),
  ações publicar, despublicar, apagar.
- `portal-panel-editor.tsx` — editor por tipo. Cardápio: tabela de linhas com
  adicionar, remover e reordenar. Promo: formulário único com foto. Aviso: dois
  campos.

Ambas atrás de `requireClient`, com entrada no menu do portal.

**Pré-visualização 16:9** ao lado do editor, renderizada em React. É uma segunda
implementação do visual, assumida e limitada de propósito: mostra quebra de
página e o que não cabe, sem prometer ser pixel-exata. O que vai ao ar é sempre
o PNG do servidor.

No admin, as peças com `source='panel'` aparecem identificadas como painel do
cliente e **não são editáveis**: editar o PNG gerado quebraria a relação com o
cadastro que o produziu. A ação do admin é despublicar o painel.

## Testes

Vitest, no estilo de `artifacts/api-server/src/lib/__tests__` — funções puras,
sem banco.

- `panel-paginate`: categoria que estoura a página, item mais longo que a
  página, painel vazio, exatamente N itens.
- `panel-render`: PNG 1920×1080 não vazio para os três tipos; nome muito longo
  trunca em vez de vazar do quadro; `1990` formata como `R$ 19,90`.
- `panel-ownership`: painel de outro cliente devolve 403 em publish, patch,
  items e delete. Um teste por rota, não um genérico.
- `display`: TV do cliente recebe os slides do painel publicado; TV de outro
  cliente não; painel `draft` não aparece; com campanha ativa, a ordem
  campanha → conteúdo do lojista se mantém.

## Migração e rollout

- Schema aplicado com `pnpm --filter @workspace/db run push`, manualmente, nunca
  no build — como o README já determina.
- `announcements.source` entra com default, então o servidor da versão anterior
  continua funcionando durante o deploy.
- `display.ts` é o único caminho já em produção que muda. Sem painel publicado a
  query nova retorna vazio, então o risco é de performance, não de
  comportamento; daí os dois índices.
- As fontes `.ttf` e o `resvg.wasm` precisam ser copiados por `build.mjs` e por
  `scripts/build-vercel.mjs`. **Este é o ponto mais provável de falhar apenas em
  produção.** Validar com `pnpm --filter @workspace/api-server run build:vercel`
  e um deploy de preview antes de ir para produção.
