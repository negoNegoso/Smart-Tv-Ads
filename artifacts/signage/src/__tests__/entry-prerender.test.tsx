// @vitest-environment node
// Ambiente node de propósito: o build roda render() no Node, sem window nem
// document. Um componente da landing que toque o DOM durante o render quebra
// aqui, e não só no build da Vercel.
import { describe, expect, it } from 'vitest';
import { LANDING } from '@/lib/landing-content';
import { render } from '@/entry-prerender';

/** Mesmo escape que o React aplica a texto. */
function escapeHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;');
}

describe('render da home', () => {
  const html = render();

  it('roda sem DOM', () => {
    expect(typeof window).toBe('undefined');
    expect(html.length).toBeGreaterThan(1000);
  });

  it('tem o h1 com a região', () => {
    expect(html).toMatch(/<h1[\s>]/);
    expect(html).toContain(escapeHtml(LANDING.hero.title));
  });

  it('tem as perguntas do FAQ', () => {
    for (const item of LANDING.faq.items) expect(html).toContain(escapeHtml(item.q));
  });
});
