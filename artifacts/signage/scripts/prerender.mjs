/**
 * Grava a home pré-renderizada e os arquivos de SEO em dist/public.
 *
 * Roda depois dos dois builds do Vite (cliente e SSR). Só faz I/O: o que vai
 * em cada arquivo é decidido pelas funções de src/lib, testadas, que chegam
 * aqui pelo bundle SSR.
 *
 * index.html continua sendo o shell vazio: ele é o fallback de todas as rotas
 * do app, e quem abre /login não pode ver a landing antes do JS carregar. Só a
 * raiz recebe home.html (rota em scripts/build-vercel.mjs).
 */
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveSitePrefix } from './site-url.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'dist', 'public');
const entryPath = path.join(root, 'dist', 'prerender', 'entry-prerender.js');

const entry = await import(pathToFileURL(entryPath).href);
// Mesma regra de base do vite.config.ts no build.
const prefix = resolveSitePrefix(process.env.BASE_PATH || '/');

const shell = await readFile(path.join(publicDir, 'index.html'), 'utf8');
const head = [
  entry.sessionHintHead(entry.SESSION_HINT_KEY),
  entry.serializeJsonLd(entry.buildStructuredData(prefix)),
].join('\n');
await writeFile(path.join(publicDir, 'home.html'), entry.injectPrerender(shell, entry.render(), head));

await writeFile(path.join(publicDir, 'robots.txt'), entry.buildRobots(prefix));
const sitemapPath = path.join(publicDir, 'sitemap.xml');
if (prefix) {
  await writeFile(sitemapPath, entry.buildSitemap(prefix, new Date()));
} else {
  // Sitemap exige URL absoluta; sem domínio, nenhum sitemap é melhor que um quebrado.
  await rm(sitemapPath, { force: true });
}

console.log(`prerender: home.html, robots.txt${prefix ? ', sitemap.xml' : ''} (${prefix || 'sem domínio'})`);
