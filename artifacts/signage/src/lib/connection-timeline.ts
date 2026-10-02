/**
 * Linha do tempo de conexão de uma TV. O servidor guarda só os períodos no ar
 * (sessões); os períodos fora do ar são os buracos entre eles, calculados
 * aqui.
 */

export interface SessionSpan {
  startedAt: string;
  lastSeenAt: string;
}

export interface TimelineEntry {
  kind: 'online' | 'offline';
  from: Date;
  to: Date;
  /** O período segue até agora (não tem fim registrado). */
  open: boolean;
}

/**
 * Junta sessões que se sobrepõem ou se encostam. Acontece quando a mesma key
 * está aberta em duas telas; sem isto sairia um "fora do ar" de duração
 * negativa entre as duas.
 */
function mergeSpans(sessions: SessionSpan[]): Array<{ start: number; end: number }> {
  const spans = sessions
    .map((s) => ({ start: new Date(s.startedAt).getTime(), end: new Date(s.lastSeenAt).getTime() }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start)
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/**
 * Do mais recente para o mais antigo. `isOnline` vem do servidor: decide se a
 * sessão mais recente segue em andamento ou se já há uma queda aberta depois
 * dela. Sem sessão registrada não há o que mostrar — nem queda inventada.
 */
export function buildConnectionTimeline(sessions: SessionSpan[], isOnline: boolean, now: Date): TimelineEntry[] {
  const spans = mergeSpans(sessions);
  if (spans.length === 0) return [];

  const nowMs = now.getTime();
  const entries: TimelineEntry[] = [];

  spans.forEach((span, i) => {
    const isLast = i === spans.length - 1;
    const ongoing = isLast && isOnline;
    entries.push({
      kind: 'online',
      from: new Date(span.start),
      // Relógio do navegador atrasado não pode encolher a sessão em andamento.
      to: new Date(ongoing ? Math.max(nowMs, span.end) : span.end),
      open: ongoing,
    });
    if (!isLast) {
      entries.push({ kind: 'offline', from: new Date(span.end), to: new Date(spans[i + 1].start), open: false });
    } else if (!isOnline) {
      entries.push({ kind: 'offline', from: new Date(span.end), to: new Date(Math.max(nowMs, span.end)), open: true });
    }
  });

  return entries.reverse();
}

export function formatSpan(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, '0')}`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "hoje 08:02", "ontem 22:10", "28/09 08:01" — na hora de quem lê. */
export function formatMoment(date: Date, now: Date): string {
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay(date, now)) return `hoje ${time}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(date, yesterday)) return `ontem ${time}`;
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`;
}
