# Mapa de cobertura do Vale do Ribeira na landing — Design

Data: 2026-09-16
Repositório: negoNegoso/Smart-Tv-Ads (SignageOS — Painel de Anúncios)

## Objetivo

Trocar a faixa de números da landing por uma seção de cobertura com mapa
clicável dos 24 municípios do Vale do Ribeira. Clicar numa cidade mostra
quantos estabelecimentos parceiros a rede tem lá.

A seção responde à pergunta que a faixa de contadores não responde: *onde* a
Smart Vale TV aparece.

## Estado atual (ponto de partida)

- `artifacts/signage/src/components/landing/stats-band.tsx` — faixa de quatro
  contadores (`plays30d`, `activeScreens`, `clients`, `segments`), sem
  localização. Some da tela se a API falhar ou se todos os valores forem zero.
- `artifacts/signage/src/hooks/use-public-stats.ts` — `useQuery` que engole o
  erro e devolve `null`.
- `artifacts/api-server/src/routes/public-stats.ts` — única rota sem sessão;
  `Cache-Control: s-maxage=300`.
- `artifacts/api-server/src/lib/public-stats/queries.ts` — só agregados, nada
  que identifique estabelecimento.
- `companies` já grava `city`, `state`, `city_ibge`, `lat`, `lng` (preenchidos
  pela consulta de CEP). `devices → clients → companies` liga TV a endereço.
- Nenhuma biblioteca de mapa instalada no workspace.
- Copy da landing inteira em `artifacts/signage/src/lib/landing-content.ts`.

## Decisões (capturadas no brainstorming)

- **Recorte regional, não nacional.** Mapa do Vale do Ribeira por município, em
  vez do Brasil por UF: a rede é regional e um mapa do Brasil com um estado
  aceso mente sobre o alcance.
- **Vale do Ribeira ampliado, 24 municípios** (recorte de bacia/cultural, não a
  região imediata de Registro sozinha).
- **Lista de municípios fixa no código**, com geometria da malha IBGE. O mapa
  tem sempre a mesma forma; o que varia é quais cidades acendem.
- **Número por cidade: estabelecimentos parceiros** (empresas com perfil de
  dono de TV). Não telas, não exibições.
- **A seção substitui a `StatsBand`.** A faixa de contadores é deletada; o
  total de telas da rede vive no painel esquerdo da nova seção.
- **Só clique.** Sem hover que muda a seleção e sem ciclo automático.
- **SVG pré-projetado, sem biblioteca de mapa.** Um script de build converte a
  malha IBGE em paths SVG commitados.

## Arquitetura

### 1. Municípios (fonte única de verdade)

`artifacts/api-server/src/lib/public-stats/vale-do-ribeira.ts` exporta os 24
códigos IBGE:

| Código | Município | | Código | Município |
|---|---|---|---|---|
| 3502705 | Apiaí | | 3524600 | Jacupiranga |
| 3505351 | Barra do Chapéu | | 3526100 | Juquiá |
| 3505401 | Barra do Turvo | | 3526209 | Juquitiba |
| 3509254 | Cajati | | 3529906 | Miracatu |
| 3509908 | Cananéia | | 3536208 | Pariquera-Açu |
| 3514809 | Eldorado | | 3537206 | Pedro de Toledo |
| 3520301 | Iguape | | 3537602 | Peruíbe |
| 3520426 | Ilha Comprida | | 3542602 | Registro |
| 3521200 | Iporanga | | 3542800 | Ribeira |
| 3522158 | Itaoca | | 3549953 | São Lourenço da Serra |
| 3522653 | Itapirapuã Paulista | | 3551801 | Sete Barras |
| 3523305 | Itariri | | 3553500 | Tapiraí |

O servidor só conhece códigos — o nome de cada cidade vem do asset do mapa, no
front. Um teste garante que as duas listas de códigos são idênticas.

### 2. Dados — `GET /public/stats` estendido

Contrato em `lib/api-spec/openapi.yaml`: `PublicStats` ganha

```yaml
cities:
  type: array
  items:
    type: object
    required: [ibge, companies]
    properties:
      ibge: { type: string }
      companies: { type: integer }
```

Regenerar com `pnpm --filter @workspace/api-spec run codegen` (Orval escreve
`lib/api-zod` e `lib/api-client-react`).

`queries.ts` ganha `citiesCoverage(): Promise<CityCoverage[]>`:

```sql
SELECT companies.city_ibge AS ibge, COUNT(*)::int AS companies
FROM companies
JOIN clients ON clients.company_id = companies.id
WHERE companies.city_ibge IN (<24 códigos>)
GROUP BY companies.city_ibge
```

- O `JOIN clients` é o que define "parceiro": empresa que só anuncia não conta
  como ponto no mapa.
- Cidade sem parceiro não aparece no array. O front trata ausência como zero;
  não existe linha com `companies: 0`.
- Nenhum nome de empresa, endereço ou coordenada sai da rota. Contagem por
  cidade é mais granular que os agregados de hoje, e numa cidade pequena com um
  parceiro ela indica que *existe* um ponto lá — mas não qual. Esse é o limite
  aceito: o nome do estabelecimento continua fora da API pública.
- `plays30d`, `activeScreens`, `clients` e `segments` continuam no payload:
  a `StatsBand` sai, mas o painel esquerdo usa `activeScreens`.

`publicStats()` passa a chamar `citiesCoverage()` junto das outras contagens.
O `Cache-Control` da rota não muda.

### 3. Asset do mapa — script de build

`scripts/src/gerar-malha-vale.ts` (tsx, padrão de `@workspace/scripts`),
rodado à mão quando a lista de municípios mudar:

1. Baixa
   `https://servicodados.ibge.gov.br/api/v3/malhas/estados/35?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=municipio`
   (~1 MB, 645 municípios de SP).
   O endpoint por região imediata responde 500 — por isso o filtro é feito
   sobre a malha do estado.
2. Filtra os 24 `codarea` e busca o nome de cada um em
   `/api/v1/localidades/estados/35/municipios`.
   As duas respostas do IBGE têm caracteres de controle e quebram parser
   estrito; o script lê como texto e limpa antes do `JSON.parse`.
3. Projeta cada anel com Mercator esférico, normalizado pela bbox dos 24
   municípios, para uma viewBox de 1000 unidades de largura (altura derivada
   da proporção). Coordenadas arredondadas em 2 casas.
4. Grava `artifacts/signage/src/lib/mapa-vale.ts`:

```ts
// Altura calculada pela proporção da bbox projetada e escrita pelo script;
// o componente lê a constante, nunca recalcula.
export const VALE_VIEW_BOX = '0 0 1000 1234.56';
export const VALE_MUNICIPIOS: { ibge: string; nome: string; path: string }[] = [
  { ibge: '3502705', nome: 'Apiaí', path: 'M…Z' },
  // …24 no total, em ordem alfabética de nome
];
```

Arquivo gerado e **commitado** (~53 KB, bem menos com gzip): o build não
depende da rede, e a forma do mapa só muda quando alguém roda o script de novo.
Cabeçalho do arquivo diz que é gerado e qual comando o regenera.

### 4. Seção — `components/landing/cobertura.tsx`

Entra no lugar de `<StatsBand />` em `pages/landing.tsx`; `stats-band.tsx` é
deletado.

Layout em duas colunas (empilha no mobile), no padrão do `Hero`:

- **Esquerda:** título, subtítulo, total de telas ativas da rede, "24 cidades
  do Vale do Ribeira", nome da cidade selecionada com o número de parceiros, e
  CTA de WhatsApp (`whatsappUrl`, mensagem com o nome da cidade).
- **Direita:** o SVG, `VALE_VIEW_BOX`, um `<path>` por município.

Estado: `useState<string>` com o código IBGE selecionado. Seleção inicial é a
cidade com mais parceiros (empate resolve pelo código IBGE, para o render ser
determinístico — é o mesmo critério de desempate da ordenação no servidor).

Cidade **com** parceiro: preenchida na cor primária, `role="button"`,
`tabIndex={0}`, `aria-pressed`, clique e Enter/Espaço selecionam.
Cidade **sem** parceiro: cinza claro, `pointer-events: none`, fora da ordem de
tab — o mapa mostra a região inteira, mas só a rede real é interativa.

Abaixo do mapa, uma lista de botões com as mesmas cidades clicáveis, que
compartilha o mesmo estado. É a interface acessível e a única visível no
mobile; o SVG fica `aria-hidden`, como decoração.

Regra de falha, herdada da `StatsBand`: sem dado da API, ou com nenhuma cidade
parceira, a seção inteira não renderiza. Sem spinner, sem mensagem de erro.

Copy toda em `landing-content.ts`, sob `LANDING.cobertura`. Nenhum texto de
interface dentro do `.tsx`.

## Tratamento de erros

| Caso | Comportamento |
|---|---|
| `/public/stats` falha ou responde não-2xx | `usePublicStats` devolve `null`; seção não renderiza |
| `cities` vazio (nenhum parceiro na região) | Seção não renderiza |
| `cities` traz código fora dos 24 | Ignorado no front (não há path para desenhar) |
| Cidade dos 24 ausente de `cities` | Desenhada apagada e não clicável |
| Empresa com `city_ibge` nulo | Fora da contagem; não some da região, só não soma |

## Testes (Vitest, mockados — padrão atual, sem banco e sem rede)

**API** (`pnpm --filter @workspace/api-server run test`)

- `lib/public-stats/__tests__/coverage.test.ts`: filtro puro `coverageFromRows`
  — ignora município fora da lista, ignora empresa sem código IBGE, descarta
  contagem zero e ordena por contagem. O `JOIN clients` que exclui anunciante
  puro é exercido pelo SQL, não por teste (a suíte não toca banco).
- `routes/__tests__/public-stats.test.ts`: resposta inclui `cities`; array
  vazio continua sendo 200.

**Frontend** (`pnpm --filter @workspace/signage run test`)

- `lib/__tests__/mapa-vale.test.ts`: 24 municípios; todo `path` não vazio;
  códigos idênticos à lista do servidor.
- `components/landing/__tests__/cobertura.test.tsx`: seleção inicial é a cidade
  com mais parceiros; clique numa cidade parceira troca o número; cidade sem
  parceiro não é clicável; `data` nulo some com a seção; `cities` vazio some
  com a seção.

Mais `pnpm run typecheck` na raiz.

## Fora de escopo (YAGNI)

- Pinos por `lat`/`lng` de cada estabelecimento.
- Zoom, pan ou mapa base deslizante.
- Hover que muda a seleção e ciclo automático entre cidades.
- Municípios fora do Vale do Ribeira; mapa nacional por UF.
- Número de telas ou de exibições por cidade.
- Regeneração automática da malha no build (o script é manual).
