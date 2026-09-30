# Apresentação comercial em /apresentacao — design

Data: 2026-09-29
Branch: `feat/apresentacao-comercial`

## Objetivo

Ter uma apresentação de slides para vender a Smart Vale TV cara a cara, numa
reunião com um potencial cliente. Quem apresenta é o dono do projeto,
conduzindo os slides na tela (notebook, tablet, celular ou a própria TV do
local). A apresentação não precisa se sustentar sozinha como PDF: o
apresentador fala por cima.

Sucesso = em 5 a 8 minutos o apresentador mostra o que é a rede, prova que ela
existe e funciona (números e peças reais, ao vivo) e fecha com o plano certo
para quem está na mesa, terminando num QR code que abre o WhatsApp.

## Decisões tomadas

- **O que se vende é o serviço Smart Vale TV**, não o software.
- **Público: anunciante e dono de ponto na mesma apresentação.** Tronco comum,
  depois um bloco para cada; o apresentador pula o bloco que não serve.
- **Formato: página web no próprio app**, rota pública `/apresentacao`.
  Números e peças vêm da API ao vivo; a copy que já existe vem de
  `landing-content.ts`, sem duplicação. Precisa de internet (4G resolve).
- **Relatório do anunciante é mock com dados de exemplo**, sinalizado como tal.
  Não expõe cliente real.
- FAQ fica fora dos slides: dúvida se responde falando.

## Roteiro

| # | Slide | Conteúdo | Fonte |
|---|---|---|---|
| 1 | Capa | Logo grande + "Anúncios nas telas do comércio do Vale do Ribeira" | `<Logo>`, copy nova |
| 2 | O problema | Comércio local não tem onde anunciar barato e perto do cliente: panfleto vai pro lixo, rede social é disputada | copy nova |
| 3 | A solução | TV dentro do estabelecimento passando as peças que estão no ar | `TvMockup` (`/api/public/pieces`) |
| 4 | A rede hoje | Mapa do Vale com as cidades parceiras, telas ativas, 24 cidades | `MapaVale` (extraído), `usePublicStats` |
| 5 | Como funciona | Duas trilhas lado a lado: anunciante e ponto | `LANDING.howItWorks` |
| 6 | Diferenciais | QR que prova, concorrente bloqueado, alvo escolhido, relatório por peça | `LANDING.differentials` |
| 7 | Anunciante: o que você acompanha | Relatório mock: exibições e leituras de QR por peça, selo "Dados de exemplo" | `relatorio-mock.tsx`, copy nova |
| 8 | Anunciante: plano | R$ 150 mensal, R$ 135 trimestral, R$ 120 anual, lista do que inclui | `LANDING.plans.advertiser` |
| 9 | Ponto: o que você ganha | Grátis, anuncia o próprio negócio, concorrente fora, zero trabalho | `LANDING.plans.host` |
| 10 | Próximo passo | QR code grande para o WhatsApp + "Vamos conversar" | `whatsappUrl`, `qrcode` |

Blocos para o índice: **Comum** (1–6), **Anunciante** (7–8), **Ponto** (9),
**Fechamento** (10).

## Arquitetura

### Rota

`/apresentacao` entra no `Router` de `App.tsx`, ao lado de `/display/:deviceKey`,
fora do `RootGate`/`RoleRouter`: renderiza igual com ou sem sessão.

Fora dos buscadores: a página insere `<meta name="robots" content="noindex">`
ao montar (e remove ao desmontar), e `public/robots.txt` ganha
`Disallow: /apresentacao`. A apresentação é pública por link, mas não é porta
de entrada do site.

### Arquivos

Novos:

- `pages/apresentacao.tsx`: compõe os slides e controla a navegação. Não tem
  texto de interface.
- `lib/apresentacao-content.ts`: copy nova (capa, problema, títulos dos blocos,
  relatório de exemplo, fechamento, mensagem do WhatsApp). Copy que já existe
  é importada de `LANDING`.
- `components/apresentacao/slide-shell.tsx`: moldura de um slide em tela
  cheia (`100dvh`), tema escuro da marca, conteúdo centralizado com largura
  máxima, tipografia maior que a da landing (é lida de longe).
- `components/apresentacao/slides/*.tsx`: um componente por slide.
- `components/apresentacao/relatorio-mock.tsx`: tabela de 3 peças de exemplo
  com exibições e leituras de QR, mais um gráfico de barras simples em CSS.
  Selo "Dados de exemplo" sempre visível.
- `components/apresentacao/indice.tsx`: painel do índice por blocos.
- `hooks/use-slide-nav.ts`: estado do slide atual, teclado, toque e hash.

Alterados:

- `components/landing/cobertura.tsx`: o SVG do mapa sai para
  `components/landing/mapa-vale.tsx` (props: cidades com parceiro, cidade
  ativa, callback de seleção). `Cobertura` passa a usá-lo; comportamento da
  landing não muda.
- `App.tsx`: nova rota.
- `public/robots.txt`: `Disallow`.
- `artifacts/signage/package.json`: dependência `qrcode` (+ `@types/qrcode`),
  mesma versão que a API já usa.

Seções da landing inteiras não entram nos slides: têm padding e layout de
página rolável. O slide monta layout próprio com os mesmos dados e
componentes menores.

### Navegação

- Avança: `→`, `espaço`, `PageDown`, toque/clique na metade direita.
- Volta: `←`, `PageUp`, toque/clique na metade esquerda.
- Não passa do último nem volta antes do primeiro.
- Toque ou clique em elemento interativo (`button`, `a`, `input`, ou qualquer
  coisa dentro de `[data-no-nav]`) não navega. Assim girar a TV do mockup ou
  tocar numa cidade do mapa não troca de slide.
- `F` alterna tela cheia (Fullscreen API; sem suporte, a tecla não faz nada).
- `I` ou o botão discreto no canto abre o índice; escolher um bloco pula para
  o primeiro slide dele. `Esc` fecha o índice.
- Slide atual no hash (`#1` a `#10`): recarregar mantém a posição. Hash
  inválido ou ausente abre o slide 1.
- Barra de progresso fina no rodapé.

### Fechamento (slide 10)

QR gerado no cliente com `QRCode.toString(url, { type: 'svg' })`, onde `url`
é `whatsappUrl(APRESENTACAO.fechamento.message)` e a mensagem é
"Olá! Vi a apresentação da Smart Vale TV." — contato que chega pela reunião
fica identificado. O link também aparece como texto clicável abaixo do QR.

## Falhas

- API de peças fora ou sem peça: `TvMockup` já cai no slide de exemplo.
- API de stats fora: slide 4 mostra "24 cidades do Vale do Ribeira" sem mapa
  de parceiros e sem número de telas.
- `activeScreens` igual a 0: número de telas some (mesma regra da landing:
  nunca "0 telas ativas" numa página que vende rede de telas).
- Falha ao gerar o QR: fica só o link em texto.

## Testes

Vitest, no padrão de `artifacts/signage`:

- `use-slide-nav`: teclas avançam e voltam; limites respeitados; hash `#N`
  abre no slide N; hash inválido abre o 1; pular para bloco vai ao primeiro
  slide dele.
- Página: clique em botão do `TvMockup` não troca de slide; clique na metade
  direita fora de elemento interativo troca.
- Slide rede: `activeScreens: 0` não mostra número; API com erro mostra só a
  frase das 24 cidades.
- Relatório mock: selo "Dados de exemplo" presente.
- Fechamento: o SVG do QR é gerado e o link aponta para `wa.me` com a mensagem
  da apresentação.
- `cobertura.test.tsx` existente passa sem alteração após a extração do mapa.
- Rota: `/apresentacao` renderiza sem sessão.

## Fora do escopo

Modo apresentador com notas, exportar PDF, controle remoto pelo celular,
métricas de quem viu a apresentação, edição da copy por painel.

## Entrega

PR `feat(landing): apresentação comercial em /apresentacao` (minor), merge
commit.
