// artifacts/signage/src/pages/urgent-alerts.tsx
import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useListSegments } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ApiError, companiesQueryKey, listCompanies } from '@/lib/companies-api';
import { mediaUrl } from '@/lib/media-url';
import {
  ALERT_DURATIONS,
  createUrgentAlert,
  endUrgentAlert,
  listUrgentAlerts,
  urgentAlertsQueryKey,
  type AlertTargetMode,
  type UrgentAlert,
} from '@/lib/urgent-alerts-api';

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

/** Hora de quem assiste à TV, não a do navegador do admin. */
function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

const STATUS_LABEL: Record<UrgentAlert['status'], string> = { active: 'No ar', expired: 'Expirado', ended: 'Encerrado' };

function targetLabel(alert: UrgentAlert) {
  if (alert.targetMode === 'segments') return `${alert.segmentIds.length} segmento(s)`;
  if (alert.targetMode === 'companies') return `${alert.companyIds.length} empresa(s)`;
  return 'Todas as TVs';
}

const TARGETS: Array<{ value: AlertTargetMode; label: string }> = [
  { value: 'all', label: 'Todas as TVs' },
  { value: 'segments', label: 'Por segmento' },
  { value: 'companies', label: 'Por empresa' },
];

export default function UrgentAlerts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: alerts = [] } = useQuery({
    queryKey: urgentAlertsQueryKey,
    queryFn: listUrgentAlerts,
    // O aviso expira sozinho no servidor; sem reconsultar, a faixa "No ar" ficaria
    // na tela depois do fim.
    refetchInterval: 60_000,
  });
  const { data: segments = [] } = useListSegments();
  const { data: companies = [] } = useQuery({ queryKey: [...companiesQueryKey, {}], queryFn: () => listCompanies() });

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetMode, setTargetMode] = useState<AlertTargetMode>('all');
  const [segmentIds, setSegmentIds] = useState<number[]>([]);
  const [companyIds, setCompanyIds] = useState<number[]>([]);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [confirming, setConfirming] = useState(false);
  const [ending, setEnding] = useState<UrgentAlert | null>(null);
  // Trava o clique duplo: sem isso, dois cliques rápidos publicariam/encerrariam duas vezes.
  const [submitting, setSubmitting] = useState(false);

  const active = alerts.filter((alert) => alert.status === 'active');
  const targetMissing =
    (targetMode === 'segments' && segmentIds.length === 0) || (targetMode === 'companies' && companyIds.length === 0);
  const canPublish = title.trim().length > 0 && !targetMissing;

  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  function openConfirm(event: FormEvent) {
    event.preventDefault();
    if (canPublish) setConfirming(true);
  }

  async function publish() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await createUrgentAlert({ title: title.trim(), body: body.trim(), targetMode, segmentIds, companyIds, durationMinutes });
      toast({ title: 'Aviso no ar. As TVs mostram em até 1 minuto.' });
      setTitle('');
      setBody('');
      setTargetMode('all');
      setSegmentIds([]);
      setCompanyIds([]);
    } catch (err) {
      toast({ title: errorMessage(err, 'Não foi possível publicar o aviso.'), variant: 'destructive' });
    } finally {
      setSubmitting(false);
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: urgentAlertsQueryKey });
    }
  }

  async function endNow() {
    if (!ending || submitting) return;
    setSubmitting(true);
    try {
      await endUrgentAlert(ending.id);
      toast({ title: 'Aviso encerrado. As TVs voltam à programação em até 1 minuto.' });
    } catch (err) {
      toast({ title: errorMessage(err, 'Não foi possível encerrar o aviso.'), variant: 'destructive' });
    } finally {
      setSubmitting(false);
      setEnding(null);
      await queryClient.invalidateQueries({ queryKey: urgentAlertsQueryKey });
    }
  }

  // Prévia do fim para a confirmação: o servidor conta a partir do envio.
  const endsAtPreview = hhmm(new Date(Date.now() + durationMinutes * 60_000).toISOString());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Avisos urgentes</h1>
        <p className="text-sm text-muted-foreground">
          O aviso toma as TVs escolhidas na hora: elas mostram só ele até o fim do prazo ou até você encerrar.
        </p>
      </div>

      {active.map((alert) => (
        <div key={alert.id} role="status" className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
          <p className="text-sm">
            No ar em {alert.reachedDevices} {alert.reachedDevices === 1 ? 'TV' : 'TVs'} até {hhmm(alert.endsAt)} — <strong>{alert.title}</strong>
          </p>
          <Button variant="destructive" size="sm" onClick={() => setEnding(alert)}>Encerrar agora</Button>
        </div>
      ))}

      <form onSubmit={openConfirm} className="space-y-4 rounded-lg border p-4">
        <div className="space-y-2">
          <Label htmlFor="alert-title">Título</Label>
          <Input id="alert-title" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Hoje fechamos às 18h" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="alert-body">Texto (opcional)</Label>
          <Input id="alert-body" maxLength={140} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">TVs</legend>
          <div className="flex flex-wrap gap-4">
            {TARGETS.map((target) => (
              <label key={target.value} className="flex items-center gap-2 text-sm">
                <input type="radio" name="alert-target" checked={targetMode === target.value} onChange={() => setTargetMode(target.value)} />
                {target.label}
              </label>
            ))}
          </div>
          {targetMode === 'segments' && (
            <div className="flex flex-wrap gap-3">
              {segments.map((segment) => (
                <label key={segment.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={segmentIds.includes(segment.id)} onChange={() => setSegmentIds(toggle(segmentIds, segment.id))} />
                  {segment.name}
                </label>
              ))}
            </div>
          )}
          {targetMode === 'companies' && (
            <div className="flex flex-wrap gap-3">
              {companies.map((company) => (
                <label key={company.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={companyIds.includes(company.id)} onChange={() => setCompanyIds(toggle(companyIds, company.id))} />
                  {company.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="alert-duration">Duração</Label>
          <select id="alert-duration" className={selectClass} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
            {ALERT_DURATIONS.map((option) => (
              <option key={option.minutes} value={option.minutes}>{option.label}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={!canPublish}>Publicar aviso</Button>
      </form>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Histórico</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum aviso publicado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex items-center gap-3 rounded-lg border p-3">
                {alert.landscapeImageUrl && (
                  <img src={mediaUrl(alert.landscapeImageUrl)} alt="" className="h-12 w-20 rounded object-cover" />
                )}
                <div className="flex-1 text-sm">
                  <p className="font-medium">{alert.title}</p>
                  <p className="text-muted-foreground">
                    {targetLabel(alert)} · {day(alert.startsAt)} {hhmm(alert.startsAt)}–{hhmm(alert.endedAt ?? alert.endsAt)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{STATUS_LABEL[alert.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader><DialogTitle>Publicar aviso urgente?</DialogTitle></DialogHeader>
          <p className="text-sm">As TVs escolhidas vão mostrar só este aviso até {endsAtPreview}. Campanhas ficam pausadas nelas.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={submitting} onClick={publish}>Publicar agora</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ending !== null} onOpenChange={(open) => !open && setEnding(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Encerrar o aviso?</DialogTitle></DialogHeader>
          <p className="text-sm">As TVs voltam à programação normal em até 1 minuto.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnding(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={submitting} onClick={endNow}>Encerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
