import { describe, expect, it } from 'vitest';
import { filterFleet, fleetCounts, lastSeenLabel, storageLabel, updateRequestedLabel, versionsInUse, type FleetRow } from '../fleet';

function tv(over: Partial<FleetRow>): FleetRow {
  return {
    id: 1, clientName: 'Padaria Central', name: 'TV', location: null, showcase: false,
    lastSeenAt: '2026-10-02T14:59:00.000Z', isOnline: true, appVersion: '1.9.0', outdated: false,
    updateRequestedAt: null, storage: null,
    ...over,
  };
}

const PARQUE: FleetRow[] = [
  tv({ id: 1, name: 'Balcão', isOnline: true, appVersion: '1.9.0' }),
  tv({ id: 2, name: 'Açougue', isOnline: false, appVersion: '1.8.2', outdated: true }),
  tv({ id: 3, name: 'Caixa', isOnline: true, appVersion: '1.10.0' }),
  tv({ id: 4, name: 'Entrada', isOnline: false, appVersion: null, lastSeenAt: null }),
  tv({ id: 5, name: 'Vitrine', isOnline: true, appVersion: null, showcase: true }),
];

describe('fleetCounts', () => {
  it('conta o parque sem a vitrine da landing', () => {
    expect(fleetCounts(PARQUE)).toEqual({ total: 4, online: 2, offline: 2, outdated: 1, lowStorage: 0 });
  });

  it('parque vazio é tudo zero', () => {
    expect(fleetCounts([])).toEqual({ total: 0, online: 0, offline: 0, outdated: 0, lowStorage: 0 });
  });
});

describe('versionsInUse', () => {
  // Ordenado como texto, "1.10.0" ficaria abaixo de "1.9.0". A ordem tem de
  // ser numérica.
  it('agrupa por versão, a mais nova primeiro, e deixa o navegador por último', () => {
    expect(versionsInUse(PARQUE)).toEqual([
      { version: '1.10.0', count: 1 },
      { version: '1.9.0', count: 1 },
      { version: '1.8.2', count: 1 },
      { version: null, count: 1 },
    ]);
  });

  it('versão fora do padrão entra depois das de release, sem quebrar a ordem', () => {
    const parque = [tv({ id: 1, appVersion: '1.0.1-rc1' }), tv({ id: 2, appVersion: '1.9.0' }), tv({ id: 3, appVersion: '1.9.0' })];
    expect(versionsInUse(parque)).toEqual([
      { version: '1.9.0', count: 2 },
      { version: '1.0.1-rc1', count: 1 },
    ]);
  });

  it('não conta a vitrine', () => {
    expect(versionsInUse([tv({ showcase: true })])).toEqual([]);
  });
});

describe('filterFleet', () => {
  const nomes = (rows: FleetRow[]) => rows.map((r) => r.name);

  it('"todas" põe as offline primeiro e ordena por nome dentro de cada grupo', () => {
    expect(nomes(filterFleet(PARQUE, 'all'))).toEqual(['Açougue', 'Entrada', 'Balcão', 'Caixa', 'Vitrine']);
  });

  it('filtra por online, offline e desatualizadas', () => {
    expect(nomes(filterFleet(PARQUE, 'online'))).toEqual(['Balcão', 'Caixa', 'Vitrine']);
    expect(nomes(filterFleet(PARQUE, 'offline'))).toEqual(['Açougue', 'Entrada']);
    expect(nomes(filterFleet(PARQUE, 'outdated'))).toEqual(['Açougue']);
  });

  it('não altera a lista recebida', () => {
    const antes = nomes(PARQUE);
    filterFleet(PARQUE, 'all');
    expect(nomes(PARQUE)).toEqual(antes);
  });
});

describe('espaço em disco', () => {
  const leitura = (low: boolean) => ({
    freeBytes: 100 * 1024 ** 2, totalBytes: 8 * 1024 ** 3, cacheBytes: 50 * 1024 ** 2, cacheFiles: 3,
    reportedAt: '2026-10-08T12:00:00.000Z', low,
  });
  const nomes = (rows: FleetRow[]) => rows.map((r) => r.name);

  it('conta e filtra as TVs com pouco espaço (vitrine fora da conta)', () => {
    const parque = [
      tv({ id: 1, name: 'Apertada', storage: leitura(true) }),
      tv({ id: 2, name: 'Folgada', storage: leitura(false) }),
      tv({ id: 3, name: 'Sem leitura', storage: null }),
      tv({ id: 4, name: 'Vitrine', showcase: true, storage: leitura(true) }),
    ];
    expect(fleetCounts(parque).lowStorage).toBe(1);
    // Como 'outdated', o filtro não tira a vitrine: ela só fica fora das contas.
    expect(nomes(filterFleet(parque, 'lowStorage'))).toEqual(['Apertada', 'Vitrine']);
  });

  it('storageLabel monta livre, total e cache', () => {
    expect(storageLabel({
      freeBytes: 1.2 * 1024 ** 3, totalBytes: 8 * 1024 ** 3, cacheBytes: 340 * 1024 ** 2, cacheFiles: 3,
      reportedAt: '2026-10-08T12:00:00Z', low: false,
    })).toBe('1,2 GB livres de 8 GB · cache 340 MB');
  });
});

describe('lastSeenLabel', () => {
  const NOW = new Date('2026-10-02T15:00:00.000Z');

  it('escreve o tempo desde o último contato', () => {
    expect(lastSeenLabel('2026-10-02T14:59:40.000Z', NOW)).toBe('agora');
    expect(lastSeenLabel('2026-10-02T14:48:00.000Z', NOW)).toBe('há 12 min');
    expect(lastSeenLabel('2026-10-02T12:00:00.000Z', NOW)).toBe('há 3 h');
    expect(lastSeenLabel('2026-10-01T14:00:00.000Z', NOW)).toBe('há 1 dia');
    expect(lastSeenLabel('2026-09-28T15:00:00.000Z', NOW)).toBe('há 4 dias');
  });

  it('TV sem contato nenhum', () => {
    expect(lastSeenLabel(null, NOW)).toBe('nunca conectou');
  });

  // Relógio do banco alguns segundos à frente do navegador.
  it('contato no futuro é "agora", não tempo negativo', () => {
    expect(lastSeenLabel('2026-10-02T15:00:20.000Z', NOW)).toBe('agora');
  });

  it('data inválida não vira "há NaN min"', () => {
    expect(lastSeenLabel('não é data', NOW)).toBe('nunca conectou');
  });
});

describe('updateRequestedLabel', () => {
  const NOW = new Date('2026-10-02T15:00:00.000Z');

  it('TV sem pedido não tem rótulo', () => {
    expect(updateRequestedLabel(null, NOW)).toBeNull();
  });

  it('diz há quanto tempo o admin pediu', () => {
    expect(updateRequestedLabel('2026-10-02T14:59:40.000Z', NOW)).toBe('atualização pedida agora');
    expect(updateRequestedLabel('2026-10-02T14:58:00.000Z', NOW)).toBe('atualização pedida há 2 min');
    expect(updateRequestedLabel('2026-10-02T14:46:00.000Z', NOW)).toBe('atualização pedida há 14 min');
  });

  // O servidor para de avisar a TV depois de 15 minutos; o rótulo some junto,
  // senão o admin acharia que o pedido ainda está valendo.
  it('pedido de 15 minutos ou mais não aparece', () => {
    expect(updateRequestedLabel('2026-10-02T14:45:00.000Z', NOW)).toBeNull();
    expect(updateRequestedLabel('2026-10-01T15:00:00.000Z', NOW)).toBeNull();
  });

  it('pedido alguns segundos no futuro é "agora"', () => {
    expect(updateRequestedLabel('2026-10-02T15:00:20.000Z', NOW)).toBe('atualização pedida agora');
  });

  it('data inválida não tem rótulo', () => {
    expect(updateRequestedLabel('não é data', NOW)).toBeNull();
  });
});
