# Frequência por volta nas campanhas — design

Data: 2026-10-06
Branch: `feat/frequencia-por-volta`

## Objetivo

Deixar o anunciante comprar mais tempo de tela: a campanha pede quantas vezes
toca a cada volta da TV (1× a 5×), e as repetições ficam espalhadas pela volta
em vez de coladas.

Hoje a volta é campanhas + painéis + playlist, nessa ordem, sem repetição
(`composeDeviceSlides` tira peça duplicada). Toda campanha pesa igual. A
landing deixou frequência de fora de propósito: "não existe cota no loop para
garantir isso". Este sub-projeto cria essa cota.

Segundo de cinco sub-projetos de programação (faixas de horário ✓ →
frequência por volta → mensagem urgente → conteúdo editorial → zonas na tela).

## Regras decididas

1. **Unidade: inserções por volta.** A campanha toca exatamente N vezes a cada
   volta. Não é % do tempo: o % real varia por TV conforme o tamanho da fila.
2. **Cada inserção toca o bloco inteiro da campanha**: todas as peças dela, na
   ordem de hoje (páginas de encarte de campanha nunca se separam).
3. **De 1 a 5.** Padrão 1. O teto evita que uma campanha engula a TV do
   lojista; dá para subir depois.
4. **Campanha antiga não muda**: com tudo em 1× a volta sai idêntica à de hoje.
5. **Conteúdo do lojista pesa 1**: cada painel publicado é um bloco (todas as
   páginas do painel em sequência); cada item da playlist da TV é um bloco.
   Lojista não escolhe peso neste sub-projeto.
6. **Duplicata continua tocando uma vez**: peça que está em mais de uma fonte
   fica só na primeira (campanha > painel > playlist), como hoje. Repetição
   só vem do peso.
7. **Vale em todo caminho que usa `loadDeviceSlides`**: TV, vitrine, prévia do
   admin e prévia do portal.
8. **Landing fica de fora**: anunciar frequência exige decidir preço por
   inserção, decisão comercial. Quando decidida, é uma linha em
   `artifacts/signage/src/lib/landing-content.ts`.

## Dados

Coluna nova em `campaigns` (`lib/db/src/schema/campaigns.ts`):

```ts
// Quantas vezes a campanha toca a cada volta da TV (1 a 5). Cada inserção
// toca o bloco inteiro de peças. O default 1 mantém as campanhas antigas e o
// servidor da versão anterior como estavam durante o deploy.
loopInsertions: smallint("loop_insertions").notNull().default(1),
```

Migração versionada gerada com `pnpm --filter @workspace/db run generate` e
commitada. Esperado: só `ALTER TABLE "campaigns" ADD COLUMN "loop_insertions"
smallint DEFAULT 1 NOT NULL;`.

## Montagem da volta

### Módulo novo: `artifacts/api-server/src/lib/loop-schedule.ts`

Puro, sem banco.

```ts
export type LoopBlock<T> = { weight: number; slides: T[] };
export function buildLoop<T>(blocks: LoopBlock<T>[]): T[];
```

Round-robin ponderado suave (o do balanceador do nginx), sobre os blocos:

```
ignora bloco com slides vazios
total = soma dos pesos
crédito[i] = 0 para todo bloco
repete `total` vezes:
  crédito[i] += peso[i] para todo bloco
  escolhe o bloco de maior crédito; empate → o de menor índice (ordem de entrada)
  crédito[escolhido] -= total
  anota o bloco escolhido na ordem
pós-passo na virada (n = tamanho da ordem):
  se n >= 3, o último bloco é o primeiro, o penúltimo e o antepenúltimo são
  outros, e 2 × peso(primeiro) <= total:
    troca os dois últimos de lugar
emite os slides de cada bloco, na ordem final
```

Por que o pós-passo: a TV repete a volta, e o round-robin começa pelo bloco
mais pesado e, para pesos comuns, termina nele também (2,1,1 → `A B C A`), o
que faria a campanha 2× tocar duas vezes seguidas na virada (`…A|A…`). Com a
troca sai `A B A C`. Quando o peso passa de metade do total (3,1,1 ou 2,1) a
repetição colada é inevitável e a ordem fica como saiu.

Propriedades (todas testadas):

- cada bloco aparece exatamente `peso` vezes;
- todos com peso 1 → saída = concatenação na ordem de entrada;
- A=3, B=1, C=1 → `A B A C A`;
- sem repetição colada na virada quando dá (nenhum bloco encosta em si mesmo,
  inclusive do último para o primeiro, se todo peso é no máximo metade do
  total): 2,1,1 → `A B A C`; 3,2,1 → `A B A C A B`;
- determinístico: mesma entrada, mesma saída (a TV recomeça a volta quando a
  lista muda, então a fila não pode variar entre duas buscas iguais);
- não altera a entrada.

Peso inválido (≤ 0 ou não inteiro) não chega aqui (API valida); o módulo trata
peso < 1 como 1 por segurança.

### Mudanças no feed (`artifacts/api-server/src/lib/device-feed.ts`)

- `buildCampaignSlidesQuery` seleciona `loopInsertions: campaignsTable.loopInsertions`.
- `buildPanelSlidesQuery` (`lib/panels/device-slides.ts`) seleciona
  `panelId: panelSlidesTable.panelId` para agrupar as páginas de um painel.
  Playlist e campanha carregam `panelId: sql\`NULL\``; `loopInsertions` vale
  `sql\`1\`` na playlist e nos painéis, para os tipos unificarem.
- Nova função `composeDeviceLoop(campaigns, panels, playlist, screen)` em
  `lib/panels/device-slides.ts`, no lugar de `composeDeviceSlides`:
  1. tira duplicatas por `announcementId` na ordem campanha → painel →
     playlist (regra de hoje);
  2. filtra por orientação da tela (`filterByOrientation`) — antes da
     montagem, para bloco que ficou vazio sumir;
  3. agrupa: campanhas por `campaignId` (na ordem que a query já devolve, por
     id da campanha), com peso `loopInsertions`; painéis por `panelId`, peso 1;
     cada item da playlist é um bloco, peso 1;
  4. `buildLoop(blocos)`.
- `loadDeviceSlides` usa `composeDeviceLoop` e remove `loopInsertions` e
  `panelId` da resposta (o player não precisa deles), como já faz com
  `weekdays` e `timeWindows`.
- `composeDeviceSlides` sai; seus testes migram para `composeDeviceLoop`.

### Efeitos na TV e nos relatórios

- `tv.html` já toca em ordem, compara a lista por posição e recomeça quando
  ela muda. Repetição não quebra nada; playlist do YouTube repetida avança de
  vídeo a cada inserção (o cursor é por peça).
- Exibição continua contada por peça tocada: o relatório reflete as inserções
  sem mudança.
- `player-stage.tsx` (player do painel, `display.tsx`): a chave da transição de
  imagem vira a posição na fila (`${index}-${announcementId}`), para a mesma
  peça duas vezes seguidas (quando é o único conteúdo) ainda trocar de quadro.
- `device-preview.tsx` já usa índice na chave: nada muda.

## API (`artifacts/api-server/src/routes/advertisers.ts`)

No `campaignInput`:

```ts
// Inserções por volta (1 a 5). O default cobre o painel antigo em cache que
// ainda não manda o campo: a campanha segue 1×.
loopInsertions: z.coerce.number().int().min(1).max(5).default(1),
```

Grava `loopInsertions` no POST e no PATCH; GET devolve
`loopInsertions: campaignsTable.loopInsertions` na seleção. Entrada inválida →
400 com a mensagem do zod.

O PATCH regrava o corpo inteiro: painel antigo em cache que salve sem o campo
volta a campanha para 1×. Risco aceito, igual ao de `weekdays` e
`timeWindows`; por isso o formulário sempre envia o campo.

## Interface (`artifacts/signage`)

- **`use-campaign-form.ts`**: estado `loopInsertions` (padrão 1),
  `setLoopInsertions`; carrega de `campaign.loopInsertions ?? 1` ao editar;
  sempre vai no corpo do envio.
- **`CampaignLoopInsertionsPicker`** em `campaign-form-dialog.tsx`, logo
  abaixo do seletor de horários, exportado para a página da campanha:
  - rótulo "Inserções por volta";
  - `<select>` com 1× a 5× (`aria-label="Inserções por volta"`);
  - ajuda: "Quantas vezes a campanha toca a cada volta da TV. Com várias
    peças, cada inserção toca todas em sequência."
- **`campaign-detail.tsx`**: picker na edição, ao lado dos horários; na
  leitura, bloco "Inserções por volta" com `"2×"`.
- **`campaign-row.tsx`**: acrescenta ` · 2× por volta` depois dos horários só
  quando `loopInsertions > 1` (1× é o implícito e não polui a linha).
- **`player-stage.tsx`**: chave por posição (acima).

## Testes (TDD)

API:

- `loop-schedule.test.ts`: tudo 1× = concatenação; A=3,B,C → `A B A C A`;
  contagem exata por bloco com pesos variados (2,3,1,1); bloco de campanha
  mantém as peças em sequência; bloco vazio some; lista vazia → `[]`; mesma
  entrada duas vezes → mesma saída; entrada não alterada.
- `composeDeviceLoop`: campanha C 2× com um painel P e um item de playlist L
  sai exatamente `C P C L`; páginas de um painel ficam juntas; peça na
  campanha e na playlist toca uma vez; peça de outra orientação some antes da
  montagem.
- `device-feed-query`: SQL de campanhas contém `"campaigns"."loop_insertions"`;
  SQL de painéis contém `"panel_slides"."panel_id"`.
- Rota `/display/:key/feed`: campanha 2× aparece duas vezes; resposta não
  carrega `loopInsertions` nem `panelId`.
- Rota de campanhas: POST/PATCH gravam o valor; sem o campo grava 1; 400 para
  0, 6 e 2.5; seleção inclui `loopInsertions`.

Web:

- `use-campaign-form`: envia `loopInsertions` (1 sem mexer, valor escolhido
  depois); `reset` carrega e volta a 1.
- `campaign-form-dialog`: o select existe com 5 opções e muda o valor enviado.
- `campaign-row`: mostra "2× por volta"; com 1× não mostra.
- `player-stage`: mesma peça duas vezes seguidas troca de quadro (chave muda).

## Fora do escopo

- Landing e material comercial (preço por inserção).
- Peso para painéis/playlist do lojista; teto de fatia de anúncios por TV.
- % do tempo / share of voice; planos nomeados.
- Prévia de "aparições por hora" no formulário.

## PR

Título: `feat(api): frequência por volta nas campanhas` (minor).
