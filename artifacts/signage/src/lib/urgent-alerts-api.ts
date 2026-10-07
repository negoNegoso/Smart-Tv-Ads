// artifacts/signage/src/lib/urgent-alerts-api.ts
import { request } from '@/lib/companies-api';

export type AlertTargetMode = 'all' | 'segments' | 'companies';

export type UrgentAlert = {
  id: number;
  title: string;
  body: string | null;
  targetMode: AlertTargetMode;
  segmentIds: number[];
  companyIds: number[];
  startsAt: string;
  endsAt: string;
  endedAt: string | null;
  status: 'active' | 'expired' | 'ended';
  reachedDevices: number;
  landscapeImageUrl: string | null;
  portraitImageUrl: string | null;
};

export type NewUrgentAlert = {
  title: string;
  body: string;
  targetMode: AlertTargetMode;
  segmentIds: number[];
  companyIds: number[];
  durationMinutes: number;
};

/** Mesmas durações que a API aceita. */
export const ALERT_DURATIONS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hora' },
  { minutes: 120, label: '2 horas' },
  { minutes: 240, label: '4 horas' },
  { minutes: 480, label: '8 horas' },
  { minutes: 1440, label: '24 horas' },
] as const;

export const urgentAlertsQueryKey = ['urgent-alerts'] as const;

export const listUrgentAlerts = () => request<UrgentAlert[]>('/urgent-alerts');

export const createUrgentAlert = (input: NewUrgentAlert) =>
  request<UrgentAlert>('/urgent-alerts', { method: 'POST', body: JSON.stringify(input) });

export const endUrgentAlert = (id: number) =>
  request<UrgentAlert>(`/urgent-alerts/${id}/end`, { method: 'POST' });
