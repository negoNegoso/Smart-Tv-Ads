import { BUSINESS_TIME_ZONE } from "../ad-eligibility";
import { dailyAvailability } from "../admin-overview/availability";

export interface DeviceDay {
  date: string;
  /** `null` antes do cadastro da TV ou do começo do histórico: "não sei". */
  online: boolean | null;
}

/**
 * Se esta TV funcionou em cada dia — a mesma regra da Visão geral do admin,
 * aplicada a uma TV só, para o cliente e o admin nunca verem números
 * diferentes para a mesma TV.
 */
export function deviceOnlineDays(
  keys: string[],
  sessions: Array<{ startedAt: Date; lastSeenAt: Date }>,
  device: { id: number; createdAt: Date },
  historyStartKey: string | null,
  timeZone: string = BUSINESS_TIME_ZONE,
): DeviceDay[] {
  const points = dailyAvailability(
    keys,
    sessions.map((session) => ({ deviceId: device.id, ...session })),
    [device],
    historyStartKey,
    timeZone,
  );
  return points.map((point) => ({
    date: point.date,
    online: point.activeDevices === null || point.totalDevices === 0 ? null : point.activeDevices > 0,
  }));
}

export function countOnlineDays(days: DeviceDay[]): { daysOnline: number; daysWithHistory: number } {
  return {
    daysOnline: days.filter((day) => day.online === true).length,
    daysWithHistory: days.filter((day) => day.online !== null).length,
  };
}
