import { render, screen } from '@testing-library/react';
import { Play } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { KpiCard } from '../kpi-card';

describe('KpiCard', () => {
  it('mostra rótulo e valor', () => {
    render(<KpiCard label="Exibições" value="48.210" icon={Play} />);
    expect(screen.getByText('Exibições')).toBeInTheDocument();
    expect(screen.getByText('48.210')).toBeInTheDocument();
  });

  it('mostra o delta quando existe', () => {
    render(
      <KpiCard label="Exibições" value="48.210" icon={Play} delta={{ label: '+12%', direction: 'up' }} />,
    );
    expect(screen.getByText('+12%')).toBeInTheDocument();
  });

  // Sem período anterior o card mostra um traço, não um número inventado.
  it('mostra um traço quando não há delta', () => {
    render(<KpiCard label="Exibições" value="48.210" icon={Play} delta={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
