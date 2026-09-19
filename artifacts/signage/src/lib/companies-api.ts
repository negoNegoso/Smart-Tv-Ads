export type CompanyStatus = 'active' | 'paused' | 'closed';

export const STATUS_LABELS: Record<CompanyStatus, string> = {
  active: 'Ativa',
  paused: 'Pausada',
  closed: 'Encerrada',
};

export interface CompanyDependencies {
  devices: number;
  panels: number;
  campaigns: number;
}

export interface Company {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  segmentId: number | null;
  status: CompanyStatus;
  notes: string | null;
  cep: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  cityIbge: string | null;
  lat: number | null;
  lng: number | null;
  clientId: number | null;
  advertiserId: number | null;
  advertiserCompany: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyDetail extends Company {
  dependencies: CompanyDependencies;
}

export type CompanyPayload = Partial<Omit<Company, 'id' | 'clientId' | 'advertiserId' | 'createdAt' | 'updatedAt'>> & {
  isClient?: boolean;
  isAdvertiser?: boolean;
};

export interface CepResult {
  cep: string;
  street: string | null;
  district: string | null;
  city: string;
  state: string;
  cityIbge: string | null;
  lat: number | null;
  lng: number | null;
}

/** Erro da API com o status e a mensagem em português que o servidor mandou. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const api = (path: string) => `${import.meta.env.BASE_URL}api${path}`;

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(api(path), {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? 'Não foi possível completar a operação.', res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const companiesQueryKey = ['companies'] as const;
export const companyQueryKey = (id: number) => ['companies', id] as const;

export function listCompanies(filter: { status?: CompanyStatus; role?: 'client' | 'advertiser'; q?: string } = {}) {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.role) params.set('role', filter.role);
  if (filter.q) params.set('q', filter.q);
  const qs = params.toString();
  return request<Company[]>(`/companies${qs ? `?${qs}` : ''}`);
}

export const getCompany = (id: number) => request<CompanyDetail>(`/companies/${id}`);

export const createCompany = (payload: CompanyPayload) =>
  request<CompanyDetail>('/companies', { method: 'POST', body: JSON.stringify(payload) });

export const updateCompany = (id: number, payload: CompanyPayload) =>
  request<CompanyDetail>(`/companies/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const deleteCompany = (id: number) => request<void>(`/companies/${id}`, { method: 'DELETE' });

export const lookupCep = (cep: string) => request<CepResult>(`/cep/${cep.replace(/\D/g, '')}`);
