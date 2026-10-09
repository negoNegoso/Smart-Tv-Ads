import { request } from '@/lib/companies-api';
import type { Pricing, Quote, QuotePeriod } from '@/lib/pricing';

export type PricingRow = Pricing & { updatedAt: string };

export type QuotePreview =
  | { available: false }
  | { available: true; reach: { tvs: number; blockedByCompetitor: number }; quote: Quote };

export type QuotePreviewInput = {
  targetMode: 'all' | 'devices' | 'segments';
  deviceIds: number[];
  segmentIds: number[];
  advertiserId?: number;
  loopInsertions: number;
  period: QuotePeriod;
};

export const pricingQueryKey = ['pricing'] as const;

export const getPricing = () => request<PricingRow | null>('/pricing');

export const savePricing = (p: Pricing) =>
  request<PricingRow>('/pricing', { method: 'PUT', body: JSON.stringify(p) });

export const previewQuote = (body: QuotePreviewInput, signal?: AbortSignal) =>
  request<QuotePreview>('/quotes/preview', { method: 'POST', body: JSON.stringify(body), signal });
