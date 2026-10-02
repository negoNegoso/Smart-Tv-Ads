import { describe, expect, it } from 'vitest';
import { buildConnectionTimeline, formatMoment, formatSpan } from '../connection-timeline';

const NOW = new Date('2026-10-02T15:00:00.000Z');
const iso = (s: string) => new Date(s).toISOString();

// Ontem das 08:00 às 22:00 e hoje das 08:00 até agora há pouco (UTC, só para
// o teste: a função trabalha com instantes, não com hora de parede).
const ONTEM = { startedAt: iso('2026-10-01T08:00:00Z'), lastSeenAt: iso('2026-10-01T22:00:00Z') };
const HOJE = { startedAt: iso('2026-10-02T08:00:00Z'), lastSeenAt: iso('2026-10-02T14:59:30Z') };

function resumo(entries: ReturnType<typeof buildConnectionTimeline>) {
  return entries.map((e) => [e.kind, e.from.toISOString(), e.to.toISOString(), e.open]);
}

describe('buildConnectionTimeline', () => {
  it('sem sessões não há linha do tempo', () => {
    expect(buildConnectionTimeline([], false, NOW)).toEqual([]);
  });

  // Vitrine, TV vista antes do deploy ou gravação de sessão que falhou: a TV
  // está online mas não há o que mostrar. Não inventa queda.
  it('TV online sem sessão registrada segue sem linha do tempo', () => {
    expect(buildConnectionTimeline([], true, NOW)).toEqual([]);
  });

  it('TV online: a sessão mais recente vai até agora', () => {
    expect(resumo(buildConnectionTimeline([HOJE, ONTEM], true, NOW))).toEqual([
      ['online', HOJE.startedAt, NOW.toISOString(), true],
      ['offline', ONTEM.lastSeenAt, HOJE.startedAt, false],
      ['online', ONTEM.startedAt, ONTEM.lastSeenAt, false],
    ]);
  });

  it('TV offline: abre um "fora do ar" do último contato até agora', () => {
    expect(resumo(buildConnectionTimeline([ONTEM], false, NOW))).toEqual([
      ['offline', ONTEM.lastSeenAt, NOW.toISOString(), true],
      ['online', ONTEM.startedAt, ONTEM.lastSeenAt, false],
    ]);
  });

  it('a ordem de entrada não importa', () => {
    expect(resumo(buildConnectionTimeline([ONTEM, HOJE], true, NOW))).toEqual(
      resumo(buildConnectionTimeline([HOJE, ONTEM], true, NOW)),
    );
  });

  // Mesma key em duas telas: duas sessões ao mesmo tempo. Sem juntar, sairia
  // um "fora do ar" de duração negativa entre elas.
  it('sessões sobrepostas viram um período só', () => {
    const a = { startedAt: iso('2026-10-02T08:00:00Z'), lastSeenAt: iso('2026-10-02T12:00:00Z') };
    const b = { startedAt: iso('2026-10-02T11:00:00Z'), lastSeenAt: iso('2026-10-02T13:00:00Z') };
    expect(resumo(buildConnectionTimeline([a, b], false, NOW))).toEqual([
      ['offline', b.lastSeenAt, NOW.toISOString(), true],
      ['online', a.startedAt, b.lastSeenAt, false],
    ]);
  });

  it('sessão inteira dentro de outra não encurta o período', () => {
    const fora = { startedAt: iso('2026-10-02T08:00:00Z'), lastSeenAt: iso('2026-10-02T13:00:00Z') };
    const dentro = { startedAt: iso('2026-10-02T09:00:00Z'), lastSeenAt: iso('2026-10-02T10:00:00Z') };
    expect(resumo(buildConnectionTimeline([dentro, fora], false, NOW))).toEqual([
      ['offline', fora.lastSeenAt, NOW.toISOString(), true],
      ['online', fora.startedAt, fora.lastSeenAt, false],
    ]);
  });

  it('nenhum período tem duração negativa', () => {
    const entries = buildConnectionTimeline([HOJE, ONTEM, { ...ONTEM }], true, NOW);
    for (const e of entries) expect(e.to.getTime()).toBeGreaterThanOrEqual(e.from.getTime());
  });

  it('sessão com data inválida é descartada', () => {
    const ruim = { startedAt: 'não é data', lastSeenAt: ONTEM.lastSeenAt };
    expect(resumo(buildConnectionTimeline([ruim, ONTEM], false, NOW))).toEqual(
      resumo(buildConnectionTimeline([ONTEM], false, NOW)),
    );
  });
});

describe('formatSpan', () => {
  it('escreve a duração do jeito que se fala', () => {
    expect(formatSpan(20 * 1000)).toBe('menos de 1 min');
    expect(formatSpan(45 * 60 * 1000)).toBe('45 min');
    expect(formatSpan((14 * 60 + 9) * 60 * 1000)).toBe('14h09');
    expect(formatSpan((2 * 24 + 3) * 60 * 60 * 1000)).toBe('2d 3h');
  });

  it('duração negativa vira "menos de 1 min", não número negativo', () => {
    expect(formatSpan(-5000)).toBe('menos de 1 min');
  });
});

describe('formatMoment', () => {
  // Datas montadas na hora local de propósito: o rótulo é na hora de quem lê.
  const agora = new Date(2026, 9, 2, 15, 0);

  it('hoje, ontem e dias anteriores', () => {
    expect(formatMoment(new Date(2026, 9, 2, 8, 2), agora)).toBe('hoje 08:02');
    expect(formatMoment(new Date(2026, 9, 1, 22, 10), agora)).toBe('ontem 22:10');
    expect(formatMoment(new Date(2026, 8, 28, 8, 1), agora)).toBe('28/09 08:01');
  });
});
