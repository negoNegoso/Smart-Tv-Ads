# Landing page pública — design

Data: 2026-08-31

## Problema

A aplicação não tem porta de entrada pública. Hoje `/` cai no `RoleRouter`
(`artifacts/signage/src/App.tsx:170`) e, sem sessão, renderiza a tela de login.
Quem chega pelo domínio sem ser cliente ou anunciante encontra um formulário de
usuário e senha, sem nenhuma explicação do que o produto faz.

A landing precisa cumprir dois papéis: explicar o produto para quem nunca ouviu
falar dele e levar o interessado a uma conversa.

## Público e conversão

A página fala com **dois públicos**, com um hero dividido em duas portas:

- **Anunciante** — comércio ou serviço local que quer aparecer nas telas.
- **Dono do ponto** — estabelecimento que cede a TV e ganha com isso.

Registrado como ressalva assumida: duas portas costumam converter pior que uma
mensagem só. A decisão foi tomada com esse dado na mesa; trocar por uma landing
focada depois não exige refazer a estrutura, só editar o hero.

**Conversão é WhatsApp**, sem formulário. Cada porta abre `wa.me` com uma
mensagem pré-preenchida diferente, de modo que a origem do contato já chega
identificada. Não há captura de lead, não há tabela nova, não há tratamento de
dados pessoais.

Não entra preço na página. O CTA é "fale com a gente" e o assunto de valores
acontece no WhatsApp.

## Referência visual

`https://aqui.globo` — fundo branco, azul corporativo, sans-serif moderna,
seções curtas e empilhadas, CTA repetido ao longo da rolagem.

O que se aproveita da referência: a estrutura (hero → prova numérica → como
funciona → diferenciais → dúvidas → CTA final) e a sobriedade visual.

O que **não** se copia: o modal que pede para abrir no desktop (o tráfego pago
chega no celular), o simulador por endereço, os combos com desconto, o mapa de
cobertura e a galeria de depoimentos — todos dependem de dados que o produto não
tem.

## Arquitetura

Rota nova dentro do SPA `@workspace/signage`, reusando Tailwind, os tokens de
`src/index.css`, a fonte Outfit e os componentes shadcn já existentes.

Alternativas descartadas:

- **HTML estático separado** (como `public/tv.html`): melhor para busca
  orgânica, mas duplicaria todo o estilo fora do design system e brigaria com o
  catch-all para `index.html` em `scripts/build-vercel.mjs`. O `tv.html` já
  mostra o custo de manter um espelho de estilo à mão.
- **Projeto Next.js separado**: SSG traria SEO e performance melhores, ao preço
  de um artifact novo, um build novo e mudanças no roteamento da Vercel.
  Desproporcional para uma página.

A landing vive de tráfego pago e de link direto no WhatsApp, não de busca
orgânica. O ganho de SEO das alternativas não paga o custo.

Compensação parcial de SEO: reescrever as meta tags de
`artifacts/signage/index.html`, que hoje descrevem o painel interno — conteúdo
privado, que ninguém de fora acessa — para descrever o produto público.

## Roteamento

O `Login` atual não navega: ele invalida a query `['auth']` e deixa o
`RoleRouter` re-renderizar (`artifacts/signage/src/pages/login.tsx:30`). O portal
de cliente e anunciante renderiza em qualquer rota, inclusive `/`. Tirar o login
da raiz mexe nos dois pontos.

Estrutura final:

| Rota | Comportamento |
| --- | --- |
| `/display/:deviceKey` | `Display`, público, inalterado |
| `/login` | `Login`; se já autenticado, `Redirect` para `/` |
| `/` | anônimo: `Landing`. Autenticado: `RoleRouter`, como hoje |
| resto | `RoleRouter`; anônimo passa a ser mandado para `/login` |

### Flash na raiz

A sessão só é conhecida depois de `GET /api/auth/me`. Esperar a resposta em `/`
faria todo visitante anônimo — a maioria — encarar um spinner antes da landing.
Não esperar faria quem está logado ver a landing por um instante.

Resolução: no login bem-sucedido, grava-se um flag em `localStorage`. Sem flag, a
landing pinta imediatamente. Com flag, mantém-se o spinner atual enquanto a
sessão resolve. O flag é uma dica de UX, nunca uma decisão de autorização — quem
manda continua sendo `/api/auth/me`.

### Mudanças de navegação

- `pages/login.tsx`: após `invalidateQueries`, `setLocation('/')`, e grava o flag.
- `lib/auth-fetch-guard.ts`: sessão expirada passa a redirecionar para `/login`.

## Endpoint público de números

O repositório é contrato-primeiro: os schemas de `@workspace/api-zod` são gerados
por orval a partir de `lib/api-spec/openapi.yaml`
(`pnpm --filter @workspace/api-spec run codegen`). O endpoint nasce na spec, não
no código do Express.

**`GET /api/public/stats`**, registrado no bloco `// Públicos` de
`artifacts/api-server/src/routes/index.ts`, antes de `loadSession`.

```json
{ "plays30d": 0, "activeScreens": 0, "clients": 0, "segments": 0 }
```

| Campo | Origem |
| --- | --- |
| `plays30d` | `COUNT(*)` em `plays` com `createdAt >= now() - 30 days` |
| `activeScreens` | `devices` com `lastSeenAt` nas últimas 24 horas |
| `clients` | total de linhas em `clients` |
| `segments` | `segmentId` distintos e não nulos em `clients` |

Só agregados: nenhum nome de cliente, nenhum dado pessoal, nada que identifique
um estabelecimento.

`activeScreens` conta apenas dispositivos que reportaram presença nas últimas 24
horas; device cadastrado que nunca reportou não entra.

**Cache**: `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`. O
CDN da Vercel absorve a carga. Não há cache em memória: numa função serverless
ele é por instância e não ajuda.

### Cidades ficaram de fora

Não existe cidade no schema. `devices.location` é texto livre e `clients` não tem
campo de localidade (`lib/db/src/schema/clients.ts`). Um número de cobertura
geográfica — o equivalente aos "126.057 pontos" da referência — exigiria mudança
de schema e preenchimento manual do histórico. Fora do escopo desta página.

### Degradação

Duas regras que decidem se a faixa de números ajuda ou atrapalha:

1. **Falha da API não derruba a landing.** Se o fetch falhar, a faixa não é
   renderizada e o resto da página segue idêntico. Sem spinner, sem mensagem de
   erro: o visitante não precisa saber que existe uma API.
2. **Zero não vai para a tela.** Métrica com valor 0 é omitida individualmente.
   "0 telas ativas" numa página que vende rede de telas é pior que a ausência do
   número. Consequência assumida: enquanto a rede for pequena, a faixa aparece
   parcial ou vazia — é o preço de puxar do banco em vez de fixar valores no
   código.

## Conteúdo da página

Ordem das seções, pensada para o celular primeiro:

1. **Topo** — nome do produto, âncoras (Como funciona · Para anunciantes · Para
   pontos · Dúvidas) e botão **Entrar**, que leva a `/login`.
2. **Hero dividido** — headline que cobre os dois lados, seguida de duas portas:
   "Quero anunciar" e "Tenho um ponto". Cada uma abre o WhatsApp com mensagem
   própria.
3. **Faixa de números** — as quatro métricas do endpoint público.
4. **Como funciona** — duas colunas de três passos. Anunciante: escolhe onde
   aparecer, manda a arte, acompanha exibições e scans. Ponto: recebe a TV, ela
   roda sozinha o dia todo, o estabelecimento ganha sem trabalho.
5. **Por que aqui** — diferenciais reais, lidos do código e não inventados:
   - QR por campanha com scan medido de verdade, com tráfego de bot já filtrado
     (`scans`, `lib/scan-rate`);
   - anúncio de concorrente do mesmo ramo não entra na TV do estabelecimento
     (commit `f8b4118`);
   - alvo por segmento ou por TVs escolhidas (commit `58bedf6`);
   - relatório de exibições por peça.
6. **Dúvidas** — cinco ou seis perguntas curtas, sem falar de preço.
7. **CTA final** — repete as duas portas.
8. **Rodapé** — contato, WhatsApp, link Entrar.

Fica de fora, por falta de dado real: depoimentos, mapa de cobertura, blog,
combos com desconto e simulador por endereço. Nenhum número ou depoimento será
inventado.

## Visual

Tokens existentes de `artifacts/signage/src/index.css`: fundo branco,
`--primary` (`248 100% 50%`), Outfit, `--radius`, as sombras do sistema. Nenhuma
paleta nova.

A landing renderiza **sempre em tema claro**, independente da classe `.dark`. Uma
página pública de captação não deveria mudar de aparência conforme a preferência
de sistema de quem chega.

**No lugar de fotografias** — que não existem — a página mostra um mockup da TV
montado em CSS, reproduzindo o slide real: imagem de fundo, a faixa de legenda e
a caixa branca do QR com o rótulo `SAIBA +`. É o produto de verdade na tela, não
banco de imagens.

Responsivo de 375px para cima. Âncoras navegáveis por teclado e contraste
suficiente nos CTAs.

## Arquivos

**Frontend** (`artifacts/signage/src/`)

| Arquivo | Papel |
| --- | --- |
| `pages/landing.tsx` | compõe as seções, sem conteúdo próprio |
| `components/landing/site-header.tsx` | topo com âncoras e Entrar |
| `components/landing/hero.tsx` | headline e as duas portas |
| `components/landing/stats-band.tsx` | faixa de números |
| `components/landing/how-it-works.tsx` | dois fluxos de três passos |
| `components/landing/differentials.tsx` | "Por que aqui" |
| `components/landing/faq.tsx` | perguntas |
| `components/landing/final-cta.tsx` | CTA de fechamento |
| `components/landing/site-footer.tsx` | rodapé |
| `components/landing/tv-mockup.tsx` | a TV em CSS |
| `lib/landing-content.ts` | todo o texto, o número do WhatsApp e o FAQ |
| `hooks/use-public-stats.ts` | a query, separada de quem desenha |

Um arquivo por seção: a copy e a ordem das seções vão mudar com frequência, e
cada mudança deve caber num arquivo pequeno. Nenhum texto fica dentro de
componente — editar a página não pode exigir abrir um `.tsx`.

**Backend**

| Arquivo | Papel |
| --- | --- |
| `lib/api-spec/openapi.yaml` | contrato do endpoint, seguido de codegen |
| `artifacts/api-server/src/routes/public-stats.ts` | a rota |
| `artifacts/api-server/src/routes/index.ts` | registro no bloco público |
| `artifacts/api-server/src/routes/__tests__/` | teste das janelas de tempo |

**Roteamento**: `App.tsx`, `pages/login.tsx`, `lib/auth-fetch-guard.ts`.

**Meta tags**: `artifacts/signage/index.html`.

### WhatsApp

O número fica em `lib/landing-content.ts`, não em variável de ambiente. Ele
aparece no HTML de qualquer maneira, e uma variável nova significaria configurar
dev, preview e produção sem ganho nenhum.

## Testes e verificação

- `pnpm run typecheck`
- `pnpm run build`
- `pnpm --filter @workspace/api-server run test` — cobrindo a janela de 30 dias de
  `plays30d` e o corte de 24 horas de `activeScreens`, as duas regras que dão
  número errado em silêncio se derraparem.
- `./dev.sh` e inspeção manual em 375px e em desktop, **inclusive com a API
  derrubada**, para confirmar que a faixa de números some sem quebrar o resto.

## Dados que faltam

Bloqueiam a implementação, não o design. Ambos entram em
`lib/landing-content.ts`:

- **Nome público do produto.** Hoje só existe "SignageOS — Painel de Anúncios",
  que é nome interno de painel administrativo e não serve de marca para o
  público.
- **Número de WhatsApp** que recebe os contatos.

## Fora de escopo

- Captura de lead, tabela de leads e qualquer tratamento de dados pessoais.
- Preço na página.
- Cidade no schema e mapa de cobertura.
- Depoimentos e provas sociais.
- SSR, SSG ou qualquer mudança na estratégia de renderização.
