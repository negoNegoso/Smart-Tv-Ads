/**
 * Funções puras do prerender da home. O script de build (scripts/prerender.mjs)
 * só faz I/O; tudo que decide o conteúdo dos arquivos mora aqui, testável.
 */

const ROOT_VAZIO = '<div id="root"></div>';

/**
 * Corpo do script inline do home.html. Roda antes da primeira pintura: quem tem
 * a dica de sessão (usuário logado) vai ver o spinner do RootGate, então a
 * landing pré-renderizada não pode piscar antes dele.
 *
 * try/catch pelo mesmo motivo de session-hint.ts: storage bloqueado lança.
 */
export function sessionHintScript(key: string): string {
  return `try{if(localStorage.getItem(${JSON.stringify(key)})==="1")document.documentElement.setAttribute("data-session-hint","")}catch(e){}`;
}

/**
 * Esconde só o [data-prerendered]. Quando o React monta, ele substitui o
 * conteúdo do #root e esse div some junto, então não há nada para desfazer.
 */
export function sessionHintHead(key: string): string {
  return `<style>html[data-session-hint] [data-prerendered]{display:none}</style>\n<script>${sessionHintScript(key)}</script>`;
}

/**
 * Função como substituto, não string: o texto da landing tem "R$ 150", e numa
 * string de substituição `$&`, `$'` e afins viram padrões do replace.
 *
 * Shell fora do formato esperado falha o build: gravar um home.html vazio
 * seria regredir o SEO em silêncio.
 */
export function injectPrerender(shell: string, appHtml: string, headHtml: string): string {
  if (!shell.includes(ROOT_VAZIO)) {
    throw new Error(`index.html sem "${ROOT_VAZIO}": não dá para injetar a home pré-renderizada.`);
  }
  if (!shell.includes('</head>')) {
    throw new Error('index.html sem </head>: não dá para injetar o head da home.');
  }
  return shell
    .replace('</head>', () => `${headHtml}\n</head>`)
    .replace(ROOT_VAZIO, () => `<div id="root"><div data-prerendered>${appHtml}</div></div>`);
}

/** Uma URL só: a home é a única página pública indexável. */
export function buildSitemap(sitePrefix: string, lastmod: Date): string {
  const dia = lastmod.toISOString().slice(0, 10);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${sitePrefix}/</loc>`,
    `    <lastmod>${dia}</lastmod>`,
    '  </url>',
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * Sem Disallow para login/portal/admin de propósito: Disallow impede o Google
 * de ler o X-Robots-Tag: noindex dessas rotas, e a URL pode aparecer no
 * resultado sem descrição. O noindex vem do header (scripts/build-vercel.mjs).
 */
export function buildRobots(sitePrefix: string): string {
  const linhas = ['User-agent: *', 'Allow: /', 'Disallow: /apresentacao'];
  if (sitePrefix) linhas.push('', `Sitemap: ${sitePrefix}/sitemap.xml`);
  return `${linhas.join('\n')}\n`;
}
