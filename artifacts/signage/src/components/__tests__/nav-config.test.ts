import { describe, expect, it } from 'vitest';
import { adminNav, isNavItemActive, portalHome, portalNav } from '../nav-config';

const hrefs = (groups: ReturnType<typeof portalNav>) => groups.flatMap((g) => g.items.map((i) => i.href));
const labels = (groups: ReturnType<typeof portalNav>) => groups.map((g) => g.label ?? null);

describe('adminNav', () => {
  it('agrupa os itens do admin com Visão geral na raiz', () => {
    expect(labels(adminNav)).toEqual(['Operação', 'Comercial', 'Conteúdo', 'Sistema']);
    expect(hrefs(adminNav)).toEqual(['/', '/parque', '/avisos', '/companies', '/segments', '/admin', '/panels', '/divulgacao', '/users-admin']);
    expect(adminNav[0].items[0].label).toBe('Visão geral');
  });
});

describe('portalNav', () => {
  it('anunciante só vê Desempenho e Minha conta', () => {
    expect(hrefs(portalNav(['advertiser']))).toEqual(['/portal/anunciante', '/portal/conta']);
  });

  it('cliente só vê Minhas TVs, Meus painéis e Minha conta', () => {
    expect(hrefs(portalNav(['client']))).toEqual(['/portal/tvs', '/portal/paineis', '/portal/conta']);
  });

  it('quem tem os dois papéis vê os dois grupos juntos', () => {
    const groups = portalNav(['client', 'advertiser']);
    expect(labels(groups)).toEqual(['Anunciante', 'Cliente', null]);
    expect(hrefs(groups)).toEqual(['/portal/anunciante', '/portal/tvs', '/portal/paineis', '/portal/conta']);
  });

  it('sem papel sobra só Minha conta', () => {
    expect(hrefs(portalNav([]))).toEqual(['/portal/conta']);
  });
});

describe('portalHome', () => {
  it('anunciante (com ou sem cliente) começa no desempenho', () => {
    expect(portalHome(['advertiser'])).toBe('/portal/anunciante');
    expect(portalHome(['client', 'advertiser'])).toBe('/portal/anunciante');
  });

  it('cliente começa nas TVs', () => {
    expect(portalHome(['client'])).toBe('/portal/tvs');
  });
});

describe('isNavItemActive', () => {
  it('ativa na rota exata e nas filhas', () => {
    expect(isNavItemActive('/parque', '/parque')).toBe(true);
    expect(isNavItemActive('/companies/5', '/companies')).toBe(true);
  });

  it('não confunde prefixo de texto com rota filha', () => {
    expect(isNavItemActive('/panelsx', '/panels')).toBe(false);
  });

  it('a raiz só ativa na raiz', () => {
    expect(isNavItemActive('/', '/')).toBe(true);
    expect(isNavItemActive('/parque', '/')).toBe(false);
  });
});
