import { FormEvent, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useListSegments } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  ApiError,
  STATUS_LABELS,
  createCompany,
  lookupCep,
  updateCompany,
  type CompanyDetail,
  type CompanyStatus,
} from '@/lib/companies-api';

interface FormState {
  name: string;
  email: string;
  phone: string;
  segmentId: string;
  isClient: boolean;
  isAdvertiser: boolean;
  advertiserCompany: string;
  status: CompanyStatus;
  notes: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  cityIbge: string;
  lat: number | null;
  lng: number | null;
}

function initialState(company?: CompanyDetail | null): FormState {
  return {
    name: company?.name ?? '',
    email: company?.email ?? '',
    phone: company?.phone ?? '',
    segmentId: company?.segmentId ? String(company.segmentId) : '',
    isClient: company ? company.clientId !== null : false,
    isAdvertiser: company ? company.advertiserId !== null : false,
    advertiserCompany: company?.advertiserCompany ?? '',
    status: company?.status ?? 'active',
    notes: company?.notes ?? '',
    cep: company?.cep ?? '',
    street: company?.street ?? '',
    number: company?.number ?? '',
    complement: company?.complement ?? '',
    district: company?.district ?? '',
    city: company?.city ?? '',
    state: company?.state ?? '',
    cityIbge: company?.cityIbge ?? '',
    lat: company?.lat ?? null,
    lng: company?.lng ?? null,
  };
}

const orNull = (v: string) => (v.trim() ? v.trim() : null);
const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

export function CompanyFormDialog({
  open,
  onOpenChange,
  company,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: CompanyDetail | null;
  onSaved: (company: CompanyDetail) => void;
}) {
  const { toast } = useToast();
  const { data: segments = [] } = useListSegments();
  const [form, setForm] = useState<FormState>(() => initialState(company));
  const [error, setError] = useState<string | null>(null);
  const [cepMessage, setCepMessage] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // CEP já consultado: evita repetir a chamada a cada tecla depois do 8º dígito
  // e não sobrescreve o endereço de uma empresa aberta para edição.
  const lastCep = useRef<string>(company?.cep ?? '');

  useEffect(() => {
    if (open) {
      setForm(initialState(company));
      setError(null);
      setCepMessage(null);
      lastCep.current = company?.cep ?? '';
    }
  }, [open, company]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    const digits = form.cep.replace(/\D/g, '');
    if (digits.length !== 8 || digits === lastCep.current) return;
    lastCep.current = digits;
    // Corrigir o CEP rápido demais pode fazer a resposta do CEP anterior
    // chegar depois da deste — comparar com `lastCep.current` no retorno
    // garante que só o resultado do ÚLTIMO CEP pedido é aplicado ao formulário.
    const requestedCep = digits;
    setCepLoading(true);
    setCepMessage(null);
    lookupCep(digits)
      .then((r) => {
        if (lastCep.current !== requestedCep) return;
        setForm((f) => ({
          ...f,
          street: r.street ?? '',
          district: r.district ?? '',
          city: r.city,
          state: r.state,
          cityIbge: r.cityIbge ?? '',
          lat: r.lat,
          lng: r.lng,
        }));
      })
      .catch((err) => {
        if (lastCep.current !== requestedCep) return;
        // Sem resposta confiável, coordenadas antigas não valem para o CEP novo.
        setForm((f) => ({ ...f, lat: null, lng: null, cityIbge: '' }));
        setCepMessage(err instanceof ApiError ? err.message : 'Serviço de CEP indisponível. Preencha o endereço manualmente.');
      })
      .finally(() => {
        if (lastCep.current === requestedCep) setCepLoading(false);
      });
  }, [form.cep]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('Informe o nome da empresa.');
      return;
    }
    if (!form.isClient && !form.isAdvertiser) {
      setError('Marque cliente e/ou anunciante.');
      return;
    }
    setError(null);
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      email: orNull(form.email),
      phone: orNull(form.phone),
      segmentId: form.segmentId ? Number(form.segmentId) : null,
      isClient: form.isClient,
      isAdvertiser: form.isAdvertiser,
      advertiserCompany: form.isAdvertiser ? orNull(form.advertiserCompany) : null,
      status: form.status,
      notes: orNull(form.notes),
      cep: orNull(form.cep.replace(/\D/g, '')),
      street: orNull(form.street),
      number: orNull(form.number),
      complement: orNull(form.complement),
      district: orNull(form.district),
      city: orNull(form.city),
      state: orNull(form.state),
      cityIbge: orNull(form.cityIbge),
      lat: form.lat,
      lng: form.lng,
    };
    try {
      const saved = company ? await updateCompany(company.id, payload) : await createCompany(payload);
      toast({ title: company ? 'Empresa atualizada' : 'Empresa cadastrada' });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a empresa.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{company ? 'Editar empresa' : 'Nova empresa'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2">
            <TextField id="company-name" label="Nome" value={form.name} onChange={(v) => set('name', v)} className="sm:col-span-2" />
            <TextField id="company-email" label="E-mail" type="email" value={form.email} onChange={(v) => set('email', v)} />
            <TextField id="company-phone" label="Telefone" value={form.phone} onChange={(v) => set('phone', v)} />
            <div className="space-y-2">
              <Label htmlFor="company-segment">Segmento</Label>
              <select id="company-segment" className={selectClass} value={form.segmentId} onChange={(e) => set('segmentId', e.target.value)}>
                <option value="">Sem segmento</option>
                {segments.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-status">Status</Label>
              <select id="company-status" className={selectClass} value={form.status} onChange={(e) => set('status', e.target.value as CompanyStatus)}>
                {(Object.keys(STATUS_LABELS) as CompanyStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </section>

          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Papéis</legend>
            <div className="flex flex-wrap gap-6">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isClient} onChange={(e) => set('isClient', e.target.checked)} />
                Cliente (tem TV)
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isAdvertiser} onChange={(e) => set('isAdvertiser', e.target.checked)} />
                Anunciante
              </label>
            </div>
            {form.isAdvertiser ? (
              <TextField
                id="company-advertiser-name"
                label="Nome comercial nas campanhas"
                value={form.advertiserCompany}
                onChange={(v) => set('advertiserCompany', v)}
              />
            ) : null}
          </fieldset>

          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Endereço</legend>
            <div className="grid gap-4 sm:grid-cols-6">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="company-cep">CEP</Label>
                <div className="relative">
                  <Input id="company-cep" inputMode="numeric" maxLength={9} value={form.cep} onChange={(e) => set('cep', e.target.value)} />
                  {cepLoading ? <Loader2 className="absolute right-2 top-3 h-4 w-4 animate-spin text-muted-foreground" /> : null}
                </div>
              </div>
              <TextField id="company-street" label="Rua" value={form.street} onChange={(v) => set('street', v)} className="sm:col-span-4" />
              <TextField id="company-number" label="Número" value={form.number} onChange={(v) => set('number', v)} className="sm:col-span-2" />
              <TextField id="company-complement" label="Complemento" value={form.complement} onChange={(v) => set('complement', v)} className="sm:col-span-4" />
              <TextField id="company-district" label="Bairro" value={form.district} onChange={(v) => set('district', v)} className="sm:col-span-3" />
              <TextField id="company-city" label="Cidade" value={form.city} onChange={(v) => set('city', v)} className="sm:col-span-2" />
              <TextField id="company-state" label="UF" value={form.state} onChange={(v) => set('state', v.toUpperCase().slice(0, 2))} className="sm:col-span-1" />
            </div>
            {cepMessage ? <p className="text-sm text-amber-400">{cepMessage}</p> : null}
            {form.lat !== null && form.lng !== null ? (
              <p className="text-xs text-muted-foreground">Localização do CEP: {form.lat.toFixed(5)}, {form.lng.toFixed(5)}</p>
            ) : null}
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="company-notes">Observações internas</Label>
            <Textarea id="company-notes" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar empresa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
