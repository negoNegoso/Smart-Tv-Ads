import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { LANDING } from '@/lib/landing-content';
import { SlideCapa } from '../slides/capa';
import { SlideProblema } from '../slides/problema';
import { SlideComoFunciona } from '../slides/como-funciona';
import { SlideDiferenciais } from '../slides/diferenciais';
import { SlidePlanoAnunciante } from '../slides/plano-anunciante';
import { SlidePlanoPonto } from '../slides/plano-ponto';

describe('slides de conteúdo', () => {
  it('capa mostra o logo e a frase', () => {
    render(<SlideCapa />);
    expect(screen.getByRole('img', { name: 'Smart Vale TV' })).toBeInTheDocument();
    expect(screen.getByText(APRESENTACAO.capa.tagline)).toBeInTheDocument();
  });

  it('problema lista as três dores', () => {
    render(<SlideProblema />);
    expect(screen.getByRole('heading', { level: 2, name: APRESENTACAO.problema.titulo })).toBeInTheDocument();
    for (const item of APRESENTACAO.problema.itens) {
      expect(screen.getByText(item.titulo)).toBeInTheDocument();
    }
  });

  it('como funciona mostra as duas trilhas com todos os passos', () => {
    render(<SlideComoFunciona />);
    for (const trilha of LANDING.howItWorks.tracks) {
      expect(screen.getByRole('heading', { level: 3, name: trilha.title })).toBeInTheDocument();
      for (const passo of trilha.steps) expect(screen.getByText(passo.title)).toBeInTheDocument();
    }
  });

  it('diferenciais mostra os quatro itens', () => {
    render(<SlideDiferenciais />);
    for (const item of LANDING.differentials.items) {
      expect(screen.getByText(item.title)).toBeInTheDocument();
    }
  });

  it('plano do anunciante mostra preço, prazos e o que inclui', () => {
    render(<SlidePlanoAnunciante />);
    const plano = LANDING.plans.advertiser;
    expect(screen.getByText(plano.price)).toBeInTheDocument();
    for (const termo of plano.terms) expect(screen.getByText(termo.value)).toBeInTheDocument();
    for (const f of plano.features) expect(screen.getByText(f)).toBeInTheDocument();
  });

  it('plano do ponto mostra que é grátis e o que o ponto ganha', () => {
    render(<SlidePlanoPonto />);
    const plano = LANDING.plans.host;
    expect(screen.getByText(plano.price)).toBeInTheDocument();
    for (const f of plano.features) expect(screen.getByText(f)).toBeInTheDocument();
  });
});
