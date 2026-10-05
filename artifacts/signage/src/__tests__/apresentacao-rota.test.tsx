import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { buildRobots } from '@/lib/prerender-html';
import App from '../App';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('rota /apresentacao', () => {
  it('abre sem sessão e sem consultar o login', async () => {
    const fetch = vi.fn(() => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }));
    vi.stubGlobal('fetch', fetch);
    window.history.replaceState(null, '', '/apresentacao');
    render(<App />);
    expect(await screen.findByText(APRESENTACAO.capa.tagline)).toBeInTheDocument();
    const urls = fetch.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls.some((u) => u.includes('api/auth/me'))).toBe(false);
  });

  it('robots.txt tira a apresentação dos buscadores', () => {
    // O robots.txt agora é gerado no build (scripts/prerender.mjs) por buildRobots.
    const robots = buildRobots('');
    expect(robots).toMatch(/^Disallow: \/apresentacao$/m);
  });
});
