import { ApiError, request } from './companies-api';

/** Igual ao servidor (artifacts/api-server/src/lib/device-key.ts). */
const DEVICE_KEY_PATTERN = /^[0-9A-F]{16}$/;

export function normalizeDeviceKey(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function parseDeviceKey(raw: string): string | null {
  const key = normalizeDeviceKey(raw);
  return DEVICE_KEY_PATTERN.test(key) ? key : null;
}

/** `A1B2C3D4E5F6A7B8` → `A1B2-C3D4-E5F6-A7B8`, como a TV mostra. */
export function formatDeviceKey(key: string): string {
  return key.match(/.{1,4}/g)?.join('-') ?? key;
}

export interface PairedDevice {
  id: number;
  clientId: number;
  clientName: string;
  name: string;
  location: string | null;
  deviceKey: string;
}

export const deviceByKeyQueryKey = (key: string) => ['devices', 'by-key', key] as const;

/** `null` = key livre, a TV ainda não foi vinculada. */
export async function getDeviceByKey(key: string): Promise<PairedDevice | null> {
  try {
    return await request<PairedDevice>(`/devices/by-key/${key}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export const createPairedDevice = (input: {
  clientId: number;
  name: string;
  location?: string;
  deviceKey: string;
}) => request<PairedDevice>('/devices', { method: 'POST', body: JSON.stringify(input) });
