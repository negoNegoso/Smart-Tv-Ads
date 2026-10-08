/**
 * Contas da página do parque. `isOnline` e `outdated` já chegam calculados
 * pelo servidor; aqui é só agrupar, filtrar e escrever.
 */

import { formatBytes } from './bytes';

export interface DeviceStorageInfo {
  freeBytes: number;
  totalBytes: number;
  cacheBytes: number;
  cacheFiles: number;
  reportedAt: string;
  low: boolean;
}

export interface FleetRow {
  id: number;
  clientName: string;
  name: string;
  location: string | null;
  showcase: boolean;
  lastSeenAt: string | null;
  isOnline: boolean;
  appVersion: string | null;
  outdated: boolean;
  updateRequestedAt: string | null;
  storage: DeviceStorageInfo | null;
}

export type FleetFilter = 'all' | 'online' | 'offline' | 'outdated' | 'lowStorage';

/**
 * A vitrine da landing fica fora das contas: ela aparece online por causa das
 * visitas do site, não por ser uma TV na parede de alguém.
 */
function realTvs(devices: FleetRow[]): FleetRow[] {
  return devices.filter((d) => !d.showcase);
}

export function fleetCounts(devices: FleetRow[]) {
  const tvs = realTvs(devices);
  const online = tvs.filter((d) => d.isOnline).length;
  return {
    total: tvs.length,
    online,
    offline: tvs.length - online,
    outdated: tvs.filter((d) => d.outdated).length,
    lowStorage: tvs.filter((d) => d.storage?.low).length,
  };
}

const RELEASE = /^(\d+)\.(\d+)\.(\d+)$/;

function releaseParts(version: string): number[] | null {
  const match = RELEASE.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Mais nova primeiro; versão fora do padrão X.Y.Z depois das de release. */
function byVersionDesc(a: string, b: string): number {
  const pa = releaseParts(a);
  const pb = releaseParts(b);
  if (pa && pb) {
    for (let i = 0; i < 3; i += 1) {
      if (pa[i] !== pb[i]) return pb[i] - pa[i];
    }
    return 0;
  }
  if (pa) return -1;
  if (pb) return 1;
  return a.localeCompare(b);
}

/** `version: null` = TV sem o app (navegador); sempre por último. */
export function versionsInUse(devices: FleetRow[]): Array<{ version: string | null; count: number }> {
  const counts = new Map<string | null, number>();
  for (const d of realTvs(devices)) {
    counts.set(d.appVersion, (counts.get(d.appVersion) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => {
      if (a.version === null) return 1;
      if (b.version === null) return -1;
      return byVersionDesc(a.version, b.version);
    });
}

/** Offline primeiro: é o que o admin veio procurar. Depois, por nome. */
export function filterFleet(devices: FleetRow[], filter: FleetFilter): FleetRow[] {
  return devices
    .filter((d) => {
      if (filter === 'online') return d.isOnline;
      if (filter === 'offline') return !d.isOnline;
      if (filter === 'outdated') return d.outdated;
      if (filter === 'lowStorage') return !!d.storage?.low;
      return true;
    })
    .sort((a, b) => Number(a.isOnline) - Number(b.isOnline) || a.name.localeCompare(b.name, 'pt-BR'));
}

export function lastSeenLabel(lastSeenAt: string | null, now: Date): string {
  if (!lastSeenAt) return 'nunca conectou';
  const ms = now.getTime() - new Date(lastSeenAt).getTime();
  if (!Number.isFinite(ms)) return 'nunca conectou';
  const minutes = Math.floor(ms / 60000);
  // Inclui contato "no futuro": relógio do banco à frente do navegador.
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

/** Mesmo prazo do servidor (lib/tv-app-update.ts): depois disso ele para de avisar a TV. */
const UPDATE_REQUEST_TTL_MINUTES = 15;

/** Rótulo do pedido de atualização, enquanto ele ainda vale. Nulo = sem rótulo. */
export function updateRequestedLabel(updateRequestedAt: string | null, now: Date): string | null {
  if (!updateRequestedAt) return null;
  const ms = now.getTime() - new Date(updateRequestedAt).getTime();
  if (!Number.isFinite(ms)) return null;
  const minutes = Math.floor(ms / 60000);
  if (minutes >= UPDATE_REQUEST_TTL_MINUTES) return null;
  // Inclui pedido "no futuro": relógio do banco à frente do navegador.
  if (minutes < 1) return 'atualização pedida agora';
  return `atualização pedida há ${minutes} min`;
}

export function storageLabel(s: DeviceStorageInfo): string {
  return `${formatBytes(s.freeBytes)} livres de ${formatBytes(s.totalBytes)} · cache ${formatBytes(s.cacheBytes)}`;
}
