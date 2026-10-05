import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRobots,
  buildSitemap,
  injectPrerender,
  sessionHintHead,
  sessionHintScript,
} from '@/lib/prerender-html';
import { SESSION_HINT_KEY } from '@/lib/session-hint';

const SHELL = '<html><head><title>x</title></head><body><div id="root"></div></body></html>';

describe('injectPrerender', () => {
  it('põe o app dentro do #root marcado e o head antes de </head>', () => {
    const html = injectPrerender(SHELL, '<h1>Oi</h1>', '<meta name="x">');
    expect(html).toContain('<div id="root"><div data-prerendered><h1>Oi</h1></div></div>');
    expect(html).toContain('<meta name="x">\n</head>');
  });

  it('preserva $ do texto (R$ 150, $&, $1) sem interpretar como padrão', () => {
    const app = '<p>R$ 150 por mês $& $1 $` fim</p>';
    const head = '<meta content="R$ 120 $\'">';
    const html = injectPrerender(SHELL, app, head);
    expect(html).toContain(app);
    expect(html).toContain(head);
  });

  it('falha se o shell não tiver o #root vazio', () => {
    expect(() => injectPrerender('<head></head><div id="root" class="x"></div>', 'a', 'b')).toThrow(
      /root/,
    );
  });

  it('falha se o shell não tiver </head>', () => {
    expect(() => injectPrerender('<div id="root"></div>', 'a', 'b')).toThrow(/head/);
  });
});

describe('script da dica de sessão', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-session-hint');
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const rodar = () => new Function(sessionHintScript(SESSION_HINT_KEY))();

  it('usa a mesma chave do session-hint', () => {
    expect(SESSION_HINT_KEY).toBe('signage:has-session');
  });

  it('com a dica, marca o <html>', () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');
    rodar();
    expect(document.documentElement.hasAttribute('data-session-hint')).toBe(true);
  });

  it('sem a dica, não marca', () => {
    rodar();
    expect(document.documentElement.hasAttribute('data-session-hint')).toBe(false);
  });

  it('storage que lança (Safari privado) não quebra a página', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(rodar).not.toThrow();
    expect(document.documentElement.hasAttribute('data-session-hint')).toBe(false);
  });

  it('head esconde só o conteúdo pré-renderizado', () => {
    const head = sessionHintHead(SESSION_HINT_KEY);
    expect(head).toContain('html[data-session-hint] [data-prerendered]{display:none}');
    expect(head).toContain(`<script>${sessionHintScript(SESSION_HINT_KEY)}</script>`);
  });
});

describe('buildSitemap', () => {
  it('lista a home com a data do build', () => {
    const xml = buildSitemap('https://smartvale.tv/app', new Date('2026-10-05T23:59:00Z'));
    expect(xml).toContain('<loc>https://smartvale.tv/app/</loc>');
    expect(xml).toContain('<lastmod>2026-10-05</lastmod>');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
});

describe('buildRobots', () => {
  it('com domínio, aponta o sitemap', () => {
    expect(buildRobots('https://smartvale.tv')).toBe(
      'User-agent: *\nAllow: /\nDisallow: /apresentacao\n\nSitemap: https://smartvale.tv/sitemap.xml\n',
    );
  });

  it('sem domínio, mantém o robots de hoje', () => {
    expect(buildRobots('')).toBe('User-agent: *\nAllow: /\nDisallow: /apresentacao\n');
  });
});
