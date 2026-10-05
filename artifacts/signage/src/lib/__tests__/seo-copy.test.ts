import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANDING } from '@/lib/landing-content';
import { VALE_MUNICIPIOS } from '@/lib/mapa-vale';

/**
 * A description do index.html repete dois fatos da landing ("24 cidades" e o
 * menor preço mensal). Ela é texto estático no HTML, então nada a mantém em dia
 * sozinha: estes testes quebram quando a landing muda e a description não.
 */
const indexHtml = readFileSync(resolve(import.meta.dirname, '../../../index.html'), 'utf8');

function meta(attr: 'name' | 'property', key: string): string {
  const match = indexHtml.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`));
  if (!match) throw new Error(`meta ${key} não encontrada no index.html`);
  return match[1];
}

describe('SEO: texto da home', () => {
  const description = meta('name', 'description');

  it('title e h1 citam a região', () => {
    expect(indexHtml).toContain(
      '<title>Smart Vale TV — anúncios em TVs do comércio no Vale do Ribeira</title>',
    );
    expect(LANDING.hero.title).toContain('Vale do Ribeira');
  });

  it('description cita as 24 cidades que a landing e o mapa mostram', () => {
    expect(description).toContain('24 cidades do Vale do Ribeira');
    expect(LANDING.cobertura.regionLabel).toBe('24 cidades do Vale do Ribeira');
    expect(VALE_MUNICIPIOS).toHaveLength(24);
  });

  it('description cita o menor preço mensal que o FAQ informa', () => {
    expect(description).toContain('R$ 120/mês');
    expect(LANDING.faq.items.some((item) => item.a.includes('R$ 120 por mês'))).toBe(true);
  });

  it('OG e Twitter repetem title e description', () => {
    expect(meta('property', 'og:description')).toBe(description);
    expect(meta('name', 'twitter:description')).toBe(description);
    expect(meta('property', 'og:title')).toBe(meta('name', 'twitter:title'));
    expect(meta('property', 'og:title')).toContain('Vale do Ribeira');
  });
});
