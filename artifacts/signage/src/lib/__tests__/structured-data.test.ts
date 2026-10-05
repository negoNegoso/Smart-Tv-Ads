import { describe, expect, it } from 'vitest';
import { LANDING } from '@/lib/landing-content';
import { VALE_MUNICIPIOS } from '@/lib/mapa-vale';
import { buildStructuredData, serializeJsonLd } from '@/lib/structured-data';

describe('buildStructuredData', () => {
  it('Organization cobre os 24 municípios do Vale', () => {
    const [org] = buildStructuredData('https://smartvale.tv');
    expect(org['@type']).toBe('Organization');
    expect(org.name).toBe('Smart Vale TV');
    const cidades = org.areaServed as { '@type': string; name: string }[];
    expect(cidades).toHaveLength(24);
    expect(cidades.map((c) => c.name)).toEqual(VALE_MUNICIPIOS.map((m) => m.nome));
    expect(cidades.every((c) => c['@type'] === 'City')).toBe(true);
  });

  it('Organization tem url, logo e telefone com prefixo absoluto', () => {
    const [org] = buildStructuredData('https://smartvale.tv/app');
    expect(org.url).toBe('https://smartvale.tv/app/');
    expect(org.logo).toBe('https://smartvale.tv/app/apple-touch-icon.png');
    expect((org.contactPoint as { telephone: string }).telephone).toBe('+5513997478695');
  });

  it('sem domínio, não inventa url nem logo', () => {
    const [org] = buildStructuredData('');
    expect(org).not.toHaveProperty('url');
    expect(org).not.toHaveProperty('logo');
    expect(org.areaServed).toHaveLength(24);
  });

  it('FAQPage repete as perguntas e respostas da landing', () => {
    const [, faq] = buildStructuredData('');
    expect(faq['@type']).toBe('FAQPage');
    const perguntas = faq.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    expect(perguntas.map((p) => p.name)).toEqual(LANDING.faq.items.map((i) => i.q));
    expect(perguntas.map((p) => p.acceptedAnswer.text)).toEqual(LANDING.faq.items.map((i) => i.a));
  });
});

describe('serializeJsonLd', () => {
  it('gera uma tag por item com JSON válido', () => {
    const html = serializeJsonLd(buildStructuredData('https://smartvale.tv'));
    const blocos = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    expect(blocos).toHaveLength(2);
    for (const [, json] of blocos) expect(() => JSON.parse(json)).not.toThrow();
  });

  it('texto com </script> não fecha a tag antes da hora', () => {
    const original = { '@type': 'Thing', name: 'a</script><b>x</b>' };
    const html = serializeJsonLd([original]);
    // Só o fechamento legítimo, no fim.
    expect(html.indexOf('</script>')).toBe(html.length - '</script>'.length);
    const json = html.slice(html.indexOf('>') + 1, -'</script>'.length);
    expect(JSON.parse(json)).toEqual(original);
  });
});
