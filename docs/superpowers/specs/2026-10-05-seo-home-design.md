# SEO da home: HTML pré-renderizado, noindex no app, metadados locais — design

Data: 2026-10-05
Branch: `feat/seo-home`

## Objetivo

Duas coisas, nesta ordem:

1. **SEO local:** aparecer quando dono de comércio ou anunciante do Vale do
   Ribeira busca algo como "anunciar em TV Registro" ou "propaganda em TV de
   loja Vale do Ribeira".
2. **Compartilhamento:** o link da home continuar gerando um card certo no
   WhatsApp, Instagram e Facebook.

Escopo: **só a home** (`/`). Páginas por cidade ficaram de fora de propósito.

## Situação de hoje

- Bom: `lang="pt-BR"`, title, description, OG/Twitter com imagem 1200×630,
  canonical, `robots.txt`, `<h1>` na hero, `/apresentacao` com noindex.
- O site é SPA pura: o HTML entregue tem `<div id="root"></div>` vazio. O
  Google renderiza JS, mas indexa com atraso e às vezes mal. Bing, buscadores
  de IA e robôs sem JS veem uma página vazia.
- O Vercel serve o mesmo `index.html`, com `robots: index`, para qualquer rota
  que não seja arquivo. Por isso `/login`, `/portal/*`, `/admin`, `/parear/*`,
  `/tv` e `/apk` podem ser indexados.
- Não há sitemap nem dados estruturados.
- "Vale do Ribeira" aparece no conteúdo, mas não no title, na description nem
  no `<h1>`.
- As tags OG já saem do HTML estático (`socialMetaTags` em `vite.config.ts`),
  então o card de compartilhamento da home já funciona sem JS. O objetivo 2 só
  precisa não regredir.

## Decisões

### 1. HTML da home gerado no build com `react-dom/server`

Foram descartados:

- **Navegador headless (Puppeteer/Playwright):** põe Chromium no CI e deixa o
  build mais lento e frágil para gerar uma página só.
- **Texto manual no `index.html`:** seria uma segunda cópia do texto, que
  desatualiza em relação a `landing-content.ts`.

Como fica (`artifacts/signage`):

- `src/entry-prerender.tsx` exporta `render(): string`, que devolve
  `renderToString(<Landing />)` dentro dos providers que a landing usa:
  `QueryClientProvider` com um client novo e vazio, e o router do wouter em
  `/` (`ssrPath="/"`) com a mesma `base` do app.
- O script `build` vira:
  `vite build --config vite.config.ts && vite build --config vite.config.ts --ssr src/entry-prerender.tsx --outDir dist/prerender && node scripts/prerender.mjs`.
  O build SSR não pode apagar `dist/public`, por isso usa outro `outDir`.
- `scripts/prerender.mjs`:
  - importa `dist/prerender/entry-prerender.js` e chama `render()`;
  - lê `dist/public/index.html`, que já passou pelo `transformIndexHtml`, ou
    seja, já tem `__SITE_URL__` resolvido e os assets com hash;
  - troca `<div id="root"></div>` por `<div id="root">…html…</div>`;
  - injeta no `<head>` o JSON-LD (seção 3) e o script da dica de sessão
    (abaixo);
  - grava `dist/public/home.html`;
  - gera `sitemap.xml` e `robots.txt` (seção 3).
- `dist/public/index.html` **continua sendo o shell vazio.** Ele é o fallback
  de todas as rotas do app, e quem abre `/login` não pode ver a landing antes
  do JS carregar.
- A cobertura (`usePublicStats`) não entra no HTML pré-renderizado: sem dados
  da API ela não renderiza nada (regra "sem dado, sem seção" de
  `cobertura.tsx`). O cliente monta a seção depois, como hoje. As 24 cidades
  chegam ao buscador pelo `areaServed` do JSON-LD (seção 4).
- O FAQ sai só com as perguntas: o accordion fechado não renderiza as
  respostas. As respostas chegam pelo `FAQPage` do JSON-LD.

### 2. No navegador: `createRoot`, sem hidratação

Em `/`, o `RootGate` mostra spinner para quem tem a dica de sessão no
`localStorage` (usuário logado) e a landing para os demais. Com
`hydrateRoot`, o usuário logado teria HTML do servidor diferente do primeiro
render, o que gera erro de hidratação.

- `main.tsx` continua com `createRoot`: o React descarta o HTML pré-renderizado
  e monta o mesmo conteúdo. Isso elimina a classe de bug de hidratação, e o
  custo é re-renderizar uma página estática.
- O HTML pré-renderizado vai dentro de `<div data-prerendered>` no `#root`.
  Um script inline no `<head>` do `home.html` lê a mesma chave do
  `localStorage` que `lib/session-hint.ts` usa (dentro de `try/catch`, como
  lá). Se a dica existir, ele marca o `<html>` com `data-session-hint`, e uma
  regra CSS esconde `[data-prerendered]`. Quando o React monta, ele substitui
  o conteúdo do `#root` e o `div` some sozinho, então o `main.tsx` não muda.
  Assim o usuário logado não vê a landing piscar antes do spinner. A chave
  vira constante exportada de `session-hint.ts`, e o `prerender.mjs` a
  importa do build SSR, sem duplicar a string.
- **Risco a verificar no navegador:** flash visual na troca do HTML pelo
  render do React (por exemplo, animação de entrada recomeçando). Se
  incomodar, a alternativa é usar `hydrateRoot` só quando não há dica de
  sessão. Essa troca fica fora do escopo enquanto não for necessária.

### 3. Roteamento no Vercel e noindex

Em `scripts/build-vercel.mjs`, no `config.json`:

```js
routes: [
  { src: "/api/(.*)", dest: "/api" },
  { src: "/r/(.*)", dest: "/api" },
  // Só a raiz recebe o HTML pré-renderizado; o resto do app segue no shell.
  { src: "^/$", dest: "/home.html" },
  { src: "^/tv/?$", dest: "/tv.html", headers: { "X-Robots-Tag": "noindex" } },
  { src: "^/apk/?$", dest: "/apk.html", headers: { "X-Robots-Tag": "noindex" } },
  { handle: "filesystem" },
  // Login, portal, admin, parear: área de app, não de busca.
  { src: "/(.*)", dest: "/index.html", headers: { "X-Robots-Tag": "noindex" } },
]
```

- O noindex vai no header porque o shell é um só para todas as rotas do app.
  O header resolve tudo sem tocar em página nenhuma.
- `/tv` (player) e `/apk` (download para o instalador) são ferramenta de
  instalação, não página de busca.
- `/home.html` e `/index.html` continuam acessíveis direto pelo
  `filesystem`. O `home.html` não conta como conteúdo duplicado porque tem
  canonical para `/`.
- Rota inexistente cai no shell com noindex e responde 200. Aceitável com
  noindex.
- O `robots.txt` **não** ganha `Disallow` para as áreas do app: um `Disallow`
  impede o Google de ler o noindex, e a URL pode aparecer no resultado sem
  descrição.
- Guarda no fim do `build-vercel.mjs`, junto das checagens de `hb.wasm`:
  falha o build se `static/home.html` não existir ou se o `#root` dele não
  tiver um `<h1>`.
- O dev local (`vite dev`) não muda: continua servindo a landing via SPA.

### 4. Metadados

**Title e description** (`index.html`, que vale para a home e para o shell):

- Title: `Smart Vale TV — anúncios em TVs do comércio no Vale do Ribeira`
- Description: `Anuncie em TVs instaladas dentro do comércio de 24 cidades do Vale do Ribeira, a partir de R$ 120/mês. Tem um ponto? Coloque sua TV para gerar receita.`
- `og:title`, `og:description`, `twitter:title` e `twitter:description` com o
  mesmo texto. `og:image:alt` ganha "Vale do Ribeira" no lugar de "região".

Os valores "24 cidades" e "R$ 120/mês" já estão na landing
(`cobertura.regionLabel` e o FAQ de preço). Se mudarem lá, a description
precisa mudar junto. Um teste confere isso (ver Testes).

**`<h1>`** (`landing-content.ts`, `hero.title`):
`Anuncie nas telas do comércio do Vale do Ribeira — ou coloque a sua para trabalhar.`
Só a landing muda. As peças de divulgação e a apresentação continuam dizendo
"da região".

**JSON-LD** no `<head>` do `home.html`, montado por uma função pura
`buildStructuredData(siteUrl)` em `src/lib/structured-data.ts`, a partir de
`landing-content.ts` e `mapa-vale.ts`. Entra no build SSR e é chamada pelo
`prerender.mjs`.

- `Organization`: `name` (BRAND), `url`, `logo` (`/apple-touch-icon.png`),
  `contactPoint` com o telefone do WhatsApp (`+55…`, `contactType: "sales"`,
  `areaServed: "BR"`, `availableLanguage: "pt-BR"`), e `areaServed` com um
  `City` por município de `VALE_MUNICIPIOS`.
- `FAQPage` com `LANDING.faq.items`. Desde 2023 o Google só mostra o FAQ como
  resultado rico para sites de governo e saúde, então aqui ele ajuda mais o
  Bing e os buscadores de IA. Custa pouco.
- Sem `LocalBusiness`: ele exige endereço físico, e não há um público.
- Sem `SITE_URL` resolvida, o JSON-LD sai sem `url` e sem `logo`, e o resto
  continua.

**Sitemap e robots**, gerados pelo `prerender.mjs`:

- `resolveSiteUrl()` sai de `vite.config.ts` para um módulo
  (`scripts/site-url.mjs`) importado pelo Vite e pelo prerender, para os dois
  nunca discordarem do domínio.
- `sitemap.xml`: uma URL (`<site>/`) e `lastmod` com a data do build.
- `robots.txt`: o conteúdo atual (`Allow: /`, `Disallow: /apresentacao`) e,
  com URL resolvida, a linha `Sitemap: <site>/sitemap.xml`.
- Sem URL resolvida (build local), não há sitemap nem linha `Sitemap:`. É a
  mesma regra das tags OG de hoje.
- `public/robots.txt` deixa de existir, porque passa a ser gerado.

## Testes

Vitest, em `artifacts/signage`:

- `entry-prerender`: `render()` não lança (pega uso de `window`/`document`
  durante o render) e o HTML contém o `<h1>` novo e as perguntas do FAQ.
- `structured-data`: o resultado é JSON válido, tem `Organization` com as 24
  cidades e `FAQPage` com as mesmas perguntas de `LANDING.faq.items`; sem URL,
  não tem `url` nem `logo`.
- `prerender` (funções puras de montagem de HTML, sitemap e robots): injeta
  no `#root` e no `<head>`, sitemap e `Sitemap:` aparecem com URL e somem sem.
- A description do `index.html` contém "24 cidades" e "R$ 120". O teste
  confere que `LANDING.cobertura.regionLabel` começa com "24 cidades" e que
  algum item de `LANDING.faq.items` cita "R$ 120". Assim, mudar a landing sem
  mudar a description quebra o teste.
- Teste existente da landing ou da hero que use o título antigo é atualizado.

Verificação manual antes do PR:

- `pnpm --filter @workspace/signage run build` e conferir `dist/public/home.html`,
  `sitemap.xml` e `robots.txt`.
- Abrir o `home.html` servido (`vite preview` com rota para `/`) no navegador:
  visitante sem sessão não vê flash; com a dica de sessão setada, não vê a
  landing antes do spinner.
- No preview do Vercel do PR: `curl -I` em `/`, `/login`, `/tv` e `/apk`
  para conferir o `X-Robots-Tag`, e `curl /` para conferir o HTML com
  conteúdo.
- Validar o JSON-LD no Rich Results Test do Google com a URL do preview.

## Fora do código (passo a passo para o dono do projeto, depois do merge)

Para SEO local, isto provavelmente pesa mais que tudo acima:

1. **Perfil da Empresa no Google** (Google Business Profile): criar como
   "empresa de área de atendimento", sem endereço público, com as cidades do
   Vale do Ribeira como área, o site e o WhatsApp.
2. **Google Search Console:** verificar o domínio (registro DNS TXT), enviar
   `<site>/sitemap.xml` e pedir indexação da `/`.
3. **Bing Webmaster Tools:** importar do Search Console.
4. Pedir aos pontos parceiros que coloquem o link do site no Instagram ou no
   Perfil do Google deles. Links de negócios locais ajudam na busca local.

## Fora de escopo

- Páginas por cidade.
- `hydrateRoot` / SSR em tempo de requisição.
- Status 404 de verdade para rotas inexistentes.
- Mudar o texto das peças de divulgação e da apresentação.
