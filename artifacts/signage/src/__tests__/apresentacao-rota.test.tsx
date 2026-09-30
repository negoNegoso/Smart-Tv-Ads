import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APRESENTACAO } from '@/lib/apresentacao-content';
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
    const robots = readFileSync(resolve(import.meta.dirname, '../../public/robots.txt'), 'utf8');
    expect(robots).toMatch(/^Disallow: \/apresentacao$/m);
  });
});
