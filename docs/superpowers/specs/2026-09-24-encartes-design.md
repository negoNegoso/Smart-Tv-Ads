# Encartes — design

Data: 2026-09-24
Branch: `feat/encartes`

## Objetivo

Novo tipo de painel, o **encarte**: folheto de ofertas de supermercado com
vários produtos (foto, nome, preço, unidade), paginado automaticamente em
quantos slides forem precisos, gerado sempre nas duas orientações (horizontal
1920×1080 e vertical 1080×1920). O lojista (ou o admin) monta quantos encartes
quiser — cada encarte é um painel independente — e escolhe onde ele vai ao ar:
nas TVs da própria loja ou dentro de uma campanha, que então controla datas,
dias da semana e alvo.

Referência visual escolhida pelo dono do projeto:
<https://img.cdndsgni.com/preview/10042854.jpg> (modelo 17 do QROfertas, TV
vertical).

Este spec é o sub-projeto 1. A importação em lote de produtos/encartes por
planilha é o sub-projeto 2, com spec próprio, e depende deste.

## Decisões

| Tema | Decisão |
|------|---------|
| Modelo | Novo `kind = "flyer"` em `panels`, reusando `panel_items`, publicação, `panel_slides`, admin e cópia entre lojas. |
| Vários encartes | Cada encarte é um painel próprio; publica e despublica independente. |
| Paginação | Capa com faixa de até 3 destaques + grade; slides seguintes só grade. |
| Orientação | Publicar gera **sempre** o jogo horizontal e o vertical. Cada TV toca o da sua orientação (filtro que já existe). |
| Capa horizontal | Faixa de destaques em cima (3 lado a lado) + 1 linha de 4. Miolo 4×2. |
| Capa vertical | Faixa de 3 destaques + grade 2×3. Miolo 2×5. |
| Identidade da loja | Logo, 2 cores e horário no cadastro da **empresa**; endereço usa as colunas que já existem. |
| Cores | Livres (color picker), para casar com a identidade visual da empresa. Padrão verde `#0B6B3A` / amarelo `#FFC20E`. |
| Destino | "TVs da loja" (sem datas, até despublicar) **ou** "Campanha" (datas, dias, alvo e concorrência vêm da campanha). |
| Validade na arte | Só no destino campanha, a partir de `startsAt`/`endsAt` da campanha, fuso de Brasília. |
| Preço antigo | "DE R$ X" pequeno só quando `oldPriceCents > priceCents`, mesma regra da promoção. |
| Prévia | Renderizada no servidor pelo mesmo template da publicação (rota de prévia), não duplicada em React. |
| Limite | 60 itens ativos por encarte. |

Alternativas descartadas:

- **Tabelas próprias `flyers`/`flyer_items`.** Duplicaria publicação, limpeza
  de PNG, admin, cópia e permissões para pouco ganho de modelo.
- **Arte montada no navegador (canvas).** Contraria a decisão central da spec
  de painéis (2026-09-07): um só template, renderizado no servidor.
- **Encarte sempre dentro de campanha.** Campanha é do anunciante e criada pelo
  admin; o lojista perderia o autosserviço que é o motivo dos painéis.
- **Validade própria no encarte.** Duplicaria o controle de datas que a
  campanha já tem. Quem precisa de datas usa o destino campanha.

## 1. Dados

Migração gerada pelo drizzle-kit. Todas as colunas novas são anuláveis ou têm
default, para o servidor da versão anterior seguir funcionando durante o
deploy.

### `companies` (identidade da loja)

| Coluna | Tipo | Observação |
|---|---|---|
| `logo_url` | `text` null | Upload pelo MediaStore, igual à foto da promoção. |
| `opening_hours` | `text` null | Texto livre, até 2 linhas / 120 caracteres. |
| `brand_color` | `text` null | `#RRGGBB`, fundo do encarte. Nulo → `#0B6B3A`. |
| `brand_accent_color` | `text` null | `#RRGGBB`, faixa de destaque. Nulo → `#FFC20E`. |

Endereço: `street`, `number`, `district`, `city`, `state`, que já existem.

### `panels`

- `PANEL_KINDS` ganha `"flyer"`.
- `campaign_id integer null` → `campaigns.id`, `on delete set null`. Só o
  encarte usa. Nulo = destino "TVs da loja"; preenchido = destino "campanha".
  É a **intenção** do editor; o destino que vale na TV é o da última
  publicação (ver seção 2).
- `art_outdated boolean not null default false` — a arte publicada ficou com
  datas de campanha velhas porque a republicação automática falhou (seção 2).
  Zerada a cada publicação bem-sucedida.
- `headline` = chamada do cabeçalho (padrão "OFERTAS", até 40 caracteres).
- `body` = aviso do rodapé (padrão "Ofertas válidas enquanto durarem os
  estoques.", até 160 caracteres).

### `panel_items`

- `unit text null` — "UNIDADE", "KG", "BANDEJA"… Nulo = sem linha de unidade.
  Até 12 caracteres, gravado em maiúsculas.
- `featured boolean not null default false` — destaque. Os 3 primeiros
  destaques ativos (por `displayOrder`) vão para a faixa da capa; os
  excedentes entram na grade na sua posição normal.

### `panel_slides`

- `orientation text not null default 'landscape'` — `landscape | portrait`.
- O único `panel_slides_panel_page_unique` passa a ser
  `(panel_id, page_no, orientation)`.

O default mantém cardápio, promoção e aviso exatamente como estão.

### Regra de posse da campanha

`campaign_id` só aceita campanha cujo anunciante (`advertisers.company_id`) é
a **mesma empresa** do cliente dono do painel (`clients.company_id`). Validado
na rota; fora disso, 400 com mensagem. Vale também para o admin: evita um
supermercado publicar encarte na campanha de outro.

## 2. Publicação e entrega nas TVs

### Páginas

Função pura `paginateFlyer(items, orientation)`:

1. Itens ativos ordenados por `displayOrder`.
2. Destaques = os 3 primeiros com `featured`. Grade = todos os demais, na
   ordem, incluindo destaques excedentes.
3. Capa: destaques + os primeiros da grade (4 no horizontal, 6 no vertical).
   Sem destaque nenhum, a capa é uma página de grade cheia (8 / 10) com o
   mesmo cabeçalho.
4. Miolo: grade em blocos de 8 (horizontal) ou 10 (vertical).
5. Nenhum item ativo → sem páginas → publicação recusada ("Encarte sem
   produtos para publicar.").

Todas as páginas têm cabeçalho e rodapé; só a capa tem faixa de destaque.

### Renderização

`publishPanel` para `flyer`:

1. Carrega painel, itens, empresa (identidade) e, se houver `campaign_id`, a
   campanha (datas).
2. Recusa com 400 acima de 60 itens ativos.
3. Resolve cada foto e o logo para `data:` URI uma única vez
   (`fetchImageDataUri`, com a guarda de SSRF existente) e reusa nas duas
   orientações. Foto que falha some do card; publicação segue.
4. Renderiza todas as páginas das duas orientações **antes** da transação
   (regra atual: se falhar, a publicação anterior segue no ar) e sobe os PNG.
   Nome do arquivo: `panel-<id>-<orientação>-p<n>.png`.
5. Transação (com a trava `for update` atual): apaga as `announcements`
   antigas do painel, cria as novas com `orientation`, grava `panel_slides`
   com a orientação e, se o destino for campanha, grava uma linha em
   `campaign_announcements` por peça (sem `scanCode`/`destinationUrl`).

60 itens ≈ 7 slides verticais + 8 horizontais ≈ 15 PNG por publicação.

### Destino "TVs da loja"

Igual aos painéis de hoje: `panelSlidesForClient` entrega. O filtro por
orientação da TV (spec de peças verticais) escolhe o jogo certo.

### Destino "campanha"

As peças entram na campanha via `campaign_announcements`, e o `device-feed`
de campanhas passa a entregá-las com tudo da campanha: janela
`startsAt`/`endsAt`, `weekdays`, alvo (`all`/`devices`/`segments`) e regra de
concorrência.

### O destino que vale é o da última publicação

`buildPanelSlidesQuery` exclui peça que tenha linha em
`campaign_announcements` (`left join … where campaign_announcements.id is
null`). Não filtra por `panels.campaign_id`: assim, trocar o destino no editor
sem republicar não faz o encarte sumir da loja nem aparecer onde não deveria.
O editor mostra "alterações não publicadas", como já faz para outros campos.

### Efeitos de mudanças na campanha

- **Datas da campanha mudam** (`PATCH /campaigns/:id` em
  `routes/advertisers.ts`): depois de salvar, republica os encartes
  publicados ligados a ela (a arte traz as datas). Falha de render não desfaz
  a edição da campanha: loga e grava `panels.art_outdated = true`. O portal mostra "arte desatualizada".
- **Campanha apagada** (`DELETE /campaigns/:id`): antes de apagar, despublica
  os encartes cujas peças estão nela. Sem isso, o cascade removeria
  `campaign_announcements` e as peças cairiam de repente nas TVs da loja.
- **Campanha termina ou é desativada**: para de tocar pelo filtro existente.
  Nada a fazer.

### Despublicar

Igual a hoje. O cascade das `announcements` leva `campaign_announcements`
junto.

### Status mostrado no portal

Derivado, sem coluna nova além de `art_outdated`:

| Situação | Badge |
|---|---|
| `status = draft` | Rascunho |
| publicado, peças sem campanha | Na loja |
| publicado em campanha, antes de `startsAt` | Agendado |
| publicado em campanha, dentro da janela e ativa | No ar |
| publicado em campanha, depois de `endsAt` ou inativa | Encerrado |
| `art_outdated` | + "Arte desatualizada" |

## 3. Arte (templates satori)

### Fonte

Barlow Condensed (OFL) Bold e ExtraBold, `.woff` estáticos (subset latin do
`@fontsource/barlow-condensed`) em `artifacts/api-server/assets/fonts/`,
carregados em `assets.ts` como a Fredoka. Licença em
`assets/fonts/OFL-BarlowCondensed.txt`.

### Cores

Função pura `flyerPalette(brandColor, accentColor)` em
`src/lib/panels/flyer-palette.ts`, reusando o cálculo de contraste WCAG de
`promo-palette.ts` (extraído para uma função compartilhada, sem mudar o
comportamento da promoção):

- `background` = `brandColor ?? #0B6B3A`; `band` = `accentColor ?? #FFC20E`.
- `textOnBackground` / `textOnBand`: branco `#FFFFFF` ou quase-preto
  `#1F1B2E`, o de maior contraste com a superfície.
- `priceOnBackground` = `band` se contraste com `background` ≥ 3:1, senão
  `textOnBackground`.
- `priceOnBand` = `background` se contraste com `band` ≥ 3:1, senão
  `textOnBand`.

### Blocos

- **Cabeçalho:** logo numa caixa com `objectFit: contain` (sem logo → nome da
  empresa em texto); chamada em maiúsculas com degraus de fonte por tamanho;
  no destino campanha, "OFERTAS VÁLIDAS DE 20/09 A 27/09" (mesmo ano) ou com
  ano quando cruzar o ano, fuso `America/Sao_Paulo`.
- **Card de destaque:** foto `contain` em cima, nome (até 2 linhas, corte em
  40 caracteres com reticências), "DE R$ X" quando houver, `R$` + preço
  grande, unidade.
- **Card de grade:** foto à esquerda, nome / preço / unidade à direita.
- **Sem foto:** card só com texto, centralizado.
- **Preço longo:** degraus de fonte por número de dígitos, como na promoção.
- **Rodapé:** horário (ícone relógio em SVG), endereço montado das colunas da
  empresa (ícone pino), aviso (`body`). Bloco ausente quando o campo está
  vazio.
- **Paginação:** "2/4" discreto no canto do rodapé quando houver mais de uma
  página.

Medidas finais (px de cada bloco) ficam no plano de implementação e são
ajustadas olhando o PNG; a estrutura acima é o contrato.

### Código

- `src/lib/panels/flyer-paginate.ts` — `paginateFlyer`. Pura.
- `src/lib/panels/flyer-palette.ts` — `flyerPalette`. Pura.
- `src/lib/panels/flyer-template.ts` — `flyerNode(input, page, orientation)`
  para o satori. `templates.ts` só despacha para ele, para não crescer.
- `render.ts` aceita `orientation` e usa 1080×1920 quando `portrait`.

## 4. Portal

### Prévia renderizada no servidor

`POST /api/panels/:id/preview` recebe o estado atual do editor (campos do
painel, itens e identidade, sem salvar), `orientation` e `page`; devolve
`image/png` do mesmo template da publicação. O editor chama com debounce de
~600ms e mostra a imagem. Prévia = resultado exato; custo ~0,5–1s por
atualização. Mesmas permissões de editar o painel. Fotos passam pela mesma
resolução com guarda de SSRF.

Cardápio, promoção e aviso continuam com a prévia em React.

### Componentes

`portal-panel-editor.tsx` já tem 43K; quando `kind === "flyer"` ele só
delega para `components/flyer/flyer-editor.tsx`, com:

- `flyer-items-table.tsx` — produtos: foto (upload/URL, reuso da promoção),
  nome, preço, preço antigo, unidade (campo livre com sugestões UNIDADE, KG,
  100G, BANDEJA, PACOTE, LITRO), destaque (estrela), ativo, arrastar para
  ordenar. Aviso com mais de 3 destaques: "Só os 3 primeiros vão para a
  faixa." Contador "N/60".
- `flyer-destination-field.tsx` — rádio "TVs da loja" / "Campanha" + select
  das campanhas elegíveis (nome e período). Empresa sem perfil de anunciante
  ou sem campanha elegível: opção desabilitada com a explicação.
- `store-identity-card.tsx` — card recolhível: logo, 2 cores (picker + hex
  sincronizados), horário; endereço só leitura com link para o cadastro.
  Salva na empresa, com o aviso "Vale para todos os encartes da loja".
- `flyer-preview.tsx` — abas Horizontal / Vertical, seletor de página,
  imagem da rota de prévia, estado de carregando e erro.

Campos do painel no editor: nome interno, chamada, aviso do rodapé, segundos
por slide. Publicar/despublicar como hoje.

`portal-panels.tsx` (lojista e admin): botão "Novo encarte" e os badges de
status da seção 2.

### API

`lib/api-spec/openapi.yaml`, depois regenerar `lib/api-zod` e
`lib/api-client-react`:

- `Panel` / `UpdatePanelRequest`: `campaignId` (nullable), `artOutdated`
  (só leitura), `kind` com `flyer`; status derivado para o badge.
- `PanelItem` e requests de item: `unit`, `featured`.
- `GET /api/panels/:id/campaign-options` — campanhas do anunciante da mesma
  empresa com `endsAt` no futuro.
- `POST /api/panels/:id/preview`.
- `GET` / `PATCH /api/clients/:clientId/identity` — `logoUrl`,
  `openingHours`, `brandColor`, `brandAccentColor`. Lojista só a própria loja
  (via `canAccessPanel`/vínculo `user_clients`), admin qualquer. Hex fora de
  `^#[0-9A-Fa-f]{6}$` → 400.

### Cópia entre lojas

`copy.ts` copia `unit` e `featured` dos itens. `campaignId` **zera** na cópia:
a campanha é da empresa de origem. A cópia continua saindo como rascunho.

## 5. Testes

- **Puros:** `paginateFlyer` (capa 3+4 e 3+6, miolo 8 e 10, destaques
  excedentes na grade, sem destaque, 1 item, 60 itens); `flyerPalette`
  (contraste em cores claras e escuras, fallback do preço); texto de validade
  no fuso de Brasília (virada à meia-noite, cruzando o ano); refatoração do
  contraste não muda `promoPalette` (testes atuais passam).
- **Render:** horizontal e vertical, com e sem foto, com e sem logo, preço de
  7 dígitos, nome de 40 caracteres → PNG no tamanho certo sem lançar.
- **Publicação:** gera as duas orientações com `orientation` certa nas
  `announcements` e `panel_slides`; destino campanha cria
  `campaign_announcements`; republicar troca tudo e limpa PNG antigos;
  `buildPanelSlidesQuery` exclui peça de campanha (inspeção via `.toSQL()`,
  padrão existente); mudar `campaignId` sem republicar não muda o que toca.
- **Rotas:** campanha de outra empresa → 400; mais de 60 itens → 400;
  identidade de outra loja → 403; hex inválido → 400; editar datas da
  campanha republica o encarte e, se o render falhar, marca
  `artOutdated`; apagar campanha despublica o encarte antes; cópia zera
  `campaignId`.
- **Portal:** editor envia `unit`, `featured`, `campaignId`; destino campanha
  desabilitado sem anunciante; aviso com mais de 3 destaques; prévia troca
  orientação e página; badges de status; card de identidade salva na empresa.

## Fora do escopo

- Importação em lote por planilha (sub-projeto 2).
- Cor por encarte (sobrescrever a da empresa) e temas prontos.
- Remoção de fundo das fotos: o lojista sobe PNG já recortado.
- QR code no encarte.
- Mais de um modelo de layout de encarte.
- Encarte de uma empresa em campanha de outra.
