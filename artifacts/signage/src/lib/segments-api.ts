import { request } from '@/lib/companies-api';

export type SegmentWithUsage = { id: number; slug: string; name: string; companyCount: number; campaignCount: number };

// Mesmo `request` das empresas: o erro chega como ApiError com a mensagem em
// português do servidor (409 de nome repetido, segmento em uso…).
export const createSegment = (name: string) =>
  request<SegmentWithUsage>('/segments', { method: 'POST', body: JSON.stringify({ name }) });

export const renameSegment = (id: number, name: string) =>
  request<SegmentWithUsage>(`/segments/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });

export const deleteSegment = (id: number) => request<void>(`/segments/${id}`, { method: 'DELETE' });

export const mergeSegment = (id: number, targetId: number) =>
  request<SegmentWithUsage>(`/segments/${id}/merge`, { method: 'POST', body: JSON.stringify({ targetId }) });
