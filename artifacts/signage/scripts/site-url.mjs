/**
 * Domínio público do site, fonte única para o Vite (tags OG/canonical) e para o
 * prerender (sitemap, robots, JSON-LD). Se cada um resolvesse o seu, um dia o
 * sitemap apontaria para um domínio e o canonical para outro.
 *
 * og:image, og:url, canonical e sitemap só funcionam com URL absoluta: o
 * crawler do WhatsApp, do Facebook e do X não resolve caminho relativo.
 *
 * SITE_URL manda. Na Vercel, VERCEL_PROJECT_PRODUCTION_URL já traz o domínio de
 * produção sem ninguém configurar nada. Sem nenhum dos dois, quem chama decide
 * omitir o que depende da URL em vez de gerar algo quebrado.
 */
export function resolveSiteUrl(env = process.env) {
  const explicit = env.SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : '';
}

/** Domínio + base do Vite, sem barra final. Vazio quando não há domínio. */
export function resolveSitePrefix(basePath, env = process.env) {
  const site = resolveSiteUrl(env);
  return site ? `${site}${basePath.replace(/\/+$/, '')}` : '';
}
