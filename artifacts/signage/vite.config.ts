import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

/**
 * PORT and BASE_PATH describe a running dev/preview server. A production build
 * emits static files and has neither, so they are required only for `vite dev`
 * and `vite preview`.
 */
function resolveServerPort(): number {
  const rawPort = process.env.PORT;

  if (!rawPort) {
    throw new Error(
      'PORT environment variable is required but was not provided.',
    );
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  return port;
}

function resolveBasePath(): string {
  const basePath = process.env.BASE_PATH;

  if (!basePath) {
    throw new Error(
      'BASE_PATH environment variable is required but was not provided.',
    );
  }

  return basePath;
}

/**
 * og:image e og:url só funcionam com URL absoluta: o crawler do WhatsApp, do
 * Facebook e do X não resolve caminho relativo, e um card sem imagem é
 * exatamente o que a landing não pode entregar — todo o CTA dela é ser
 * compartilhada.
 *
 * SITE_URL manda. Na Vercel, VERCEL_PROJECT_PRODUCTION_URL já traz o domínio de
 * produção sem ninguém configurar nada. Sem nenhum dos dois, as tags que
 * dependem da URL saem do HTML em vez de saírem quebradas, e o twitter:card cai
 * para `summary`, que não promete imagem nenhuma.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : '';
}

function socialMetaTags(basePath: string): Plugin {
  const prefix = `${resolveSiteUrl()}${basePath.replace(/\/+$/, '')}`;
  return {
    name: 'signage-social-meta',
    transformIndexHtml(html) {
      if (!resolveSiteUrl()) {
        return html
          // og:image:* sozinho, sem og:image, é lixo no head.
          .replace(/^.*(?:__SITE_URL__|og:image:).*\n/gm, '')
          .replace('content="summary_large_image"', 'content="summary"');
      }
      return html.replaceAll('__SITE_URL__', prefix);
    },
  };
}

export default defineConfig(async ({ command }) => {
  const port = command === 'serve' ? resolveServerPort() : 0;
  // `||`, not `??`: an exported-but-empty BASE_PATH would otherwise yield
  // base: '', which Vite treats as a relative base and breaks assets on any
  // deep route. Empty means "not provided", exactly as the resolvers above.
  const basePath = command === 'serve' ? resolveBasePath() : (process.env.BASE_PATH || '/');

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      socialMetaTags(basePath),
      ...(process.env.NODE_ENV !== 'production' &&
      process.env.REPL_ID !== undefined
        ? [
            await import('@replit/vite-plugin-cartographer').then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, '..'),
              }),
            ),
            await import('@replit/vite-plugin-dev-banner').then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        '@assets': path.resolve(
          import.meta.dirname,
          '..',
          '..',
          'attached_assets',
        ),
      },
      dedupe: ['react', 'react-dom'],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, 'dist/public'),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
      fs: {
        strict: true,
      },
      proxy: {
        '/api': {
          target: process.env.API_PROXY ?? 'http://localhost:8080',
          changeOrigin: true,
        },
        '/r': {
          target: process.env.API_PROXY ?? 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
    preview: {
      port,
      host: '0.0.0.0',
      allowedHosts: true,
    },
  };
});
