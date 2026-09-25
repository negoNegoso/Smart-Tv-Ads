import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlyerDestinationField } from '../flyer-destination-field';

function mockOptions(options: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(options), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
}

function renderField(campaignId: number | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FlyerDestinationField panelId={1} campaignId={campaignId} onChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('FlyerDestinationField', () => {
  it('mostra o período da campanha no próprio dia (datas só-dia, em UTC)', async () => {
    mockOptions([{ id: 5, name: 'Semana', startsAt: '2026-09-20', endsAt: '2026-09-27' }]);
    renderField(5);
    expect(await screen.findByRole('option', { name: 'Semana — 20/09 a 27/09' })).toBeInTheDocument();
  });
});
