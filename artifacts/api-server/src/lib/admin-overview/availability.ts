import { BUSINESS_TIME_ZONE } from "../ad-eligibility";
import { startOfBusinessDay } from "../portal/period";

export interface SessionSpan {
  deviceId: number;
  startedAt: Date;
  lastSeenAt: Date;
}

export interface DeviceSince {
  id: number;
  createdAt: Date;
}

export interface AvailabilityPoint {
  date: string;
  /** `null` antes do começo do histórico: "não sei", e não "nenhuma TV". */
  activeDevices: number | null;
  totalDevices: number;
}

/** Dia seguinte no calendário. Meio-dia UTC para a soma nunca escorregar de dia. */
export function nextDayKey(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1, 12)).toISOString().slice(0, 10);
}

/**
 * TVs que funcionaram em cada dia, sobre as TVs que existiam naquele dia.
 *
 * "Funcionou" é ter ao menos uma sessão de conexão tocando o dia — não horas
 * no ar, porque as TVs desligam fora do horário da loja. Sessão que atravessa
 * a meia-noite toca os dois dias. TV cadastrada depois do dia não entra no
 * total dele, para a instalação nova não aparecer como falha no passado.
 *
 * Fica fora do SQL porque é regra que erra em silêncio e os testes do
 * repositório não abrem banco.
 */
export function dailyAvailability(
  keys: string[],
  sessions: SessionSpan[],
  devices: DeviceSince[],
  historyStartKey: string | null,
  timeZone: string = BUSINESS_TIME_ZONE,
): AvailabilityPoint[] {
  return keys.map((date) => {
    const start = startOfBusinessDay(date, timeZone);
    const end = startOfBusinessDay(nextDayKey(date), timeZone);
    const totalDevices = devices.filter((device) => device.createdAt < end).length;

    // Chave YYYY-MM-DD compara certo como texto.
    if (historyStartKey === null || date < historyStartKey) {
      return { date, activeDevices: null, totalDevices };
    }

    const active = new Set<number>();
    for (const session of sessions) {
      if (session.startedAt < end && session.lastSeenAt >= start) active.add(session.deviceId);
    }
    return { date, activeDevices: active.size, totalDevices };
  });
}
