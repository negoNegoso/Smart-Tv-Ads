import { describe, expect, it } from 'vitest';
import { resolveSitePrefix, resolveSiteUrl } from '../site-url.mjs';

describe('resolveSiteUrl', () => {
  it('SITE_URL manda e perde a barra final', () => {
    expect(
      resolveSiteUrl({ SITE_URL: 'https://smartvale.tv/', VERCEL_PROJECT_PRODUCTION_URL: 'x.vercel.app' }),
    ).toBe('https://smartvale.tv');
  });

  it('cai para o domínio de produção da Vercel', () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'x.vercel.app' })).toBe('https://x.vercel.app');
  });

  it('sem nenhum dos dois, vazio', () => {
    expect(resolveSiteUrl({})).toBe('');
  });
});

describe('resolveSitePrefix', () => {
  it('base na raiz não deixa barra no fim', () => {
    expect(resolveSitePrefix('/', { SITE_URL: 'https://smartvale.tv' })).toBe('https://smartvale.tv');
  });

  it('base com caminho entra sem barra dupla nem final', () => {
    expect(resolveSitePrefix('/app/', { SITE_URL: 'https://smartvale.tv/' })).toBe(
      'https://smartvale.tv/app',
    );
  });

  it('sem domínio, vazio mesmo com base', () => {
    expect(resolveSitePrefix('/app/', {})).toBe('');
  });
});
