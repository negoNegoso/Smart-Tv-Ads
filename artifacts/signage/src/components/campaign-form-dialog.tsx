import { useEffect } from "react";
import { Link } from "wouter";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQuotePreview } from "@/components/use-quote-preview";
import { formatCents } from "@/lib/money";
import { contaDoValor } from "@/lib/pricing-text";
import { useReachPreview, type ReachPreview } from "@/components/use-reach-preview";
import { WEEKDAYS, weekdaysLabel } from "@/lib/weekdays";
import { END_OPTIONS, MAX_TIME_WINDOWS, START_OPTIONS, isValidWindow, minutesToHHMM, timeWindowsLabel } from "@/lib/time-windows";
import {
  useCampaignForm,
  type CampaignFormAdvertiser,
  type CampaignFormAnnouncement,
  type CampaignFormCampaign,
  type CampaignFormDevice,
  type CampaignFormSegment,
} from "@/components/use-campaign-form";

export type { CampaignFormAdvertiser, CampaignFormAnnouncement, CampaignFormCampaign, CampaignFormDevice, CampaignFormSegment };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  advertisers: CampaignFormAdvertiser[];
  announcements: CampaignFormAnnouncement[];
  devices: CampaignFormDevice[];
  segments: CampaignFormSegment[];
  campaign?: CampaignFormCampaign | null;
  lockedAdvertiserId?: number;
  onSaved: () => void;
};

/**
 * Dias em que a campanha roda. Nenhum dia marcado é "todo dia" — é o estado
 * inicial e o de quem nunca mexeu aqui, então o rótulo diz isso em vez de
 * deixar a campanha parecer sem agenda.
 */
export function CampaignWeekdayPicker({ form }: { form: ReturnType<typeof useCampaignForm> }) {
  return (
    <div className="space-y-2">
      <Label>Dias da semana</Label>
      <div className="flex gap-1.5">
        {WEEKDAYS.map((day) => {
          const selected = form.weekdays.includes(day.value);
          return (
            <button
              key={day.value}
              type="button"
              aria-pressed={selected}
              aria-label={day.label}
              onClick={() => form.toggleWeekday(day.value)}
              className={`h-9 w-9 rounded-md border text-sm font-medium transition-colors ${
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              {day.short}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{weekdaysLabel(form.weekdays)}. Sem nenhum dia marcado, roda todos os dias do período.</p>
    </div>
  );
}

const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-2 text-sm";

/**
 * Faixas do dia em que a campanha roda, as mesmas em todos os dias marcados.
 * Sem faixa é "dia todo" — o estado inicial, então a ajuda diz isso. `select`
 * em vez de `<input type="time">`: o passo de 15 minutos fica garantido sem
 * depender do navegador respeitar `step`.
 */
export function CampaignTimeWindowsPicker({ form }: { form: ReturnType<typeof useCampaignForm> }) {
  return (
    <div className="space-y-2">
      <Label>Horários</Label>
      {form.timeWindows.map((window, index) => (
        <div key={index} className="space-y-1">
          <div className="flex items-center gap-2">
            <select
              aria-label={`Início da faixa ${index + 1}`}
              className={SELECT_CLASS}
              value={window.start}
              onChange={(e) => form.updateWindow(index, { start: Number(e.target.value) })}
            >
              {START_OPTIONS.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
            </select>
            <span className="text-sm text-muted-foreground">até</span>
            <select
              aria-label={`Fim da faixa ${index + 1}`}
              className={SELECT_CLASS}
              value={window.end}
              onChange={(e) => form.updateWindow(index, { end: Number(e.target.value) })}
            >
              {END_OPTIONS.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
            </select>
            <Button type="button" variant="ghost" size="icon" aria-label="Remover faixa" onClick={() => form.removeWindow(index)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {!isValidWindow(window) && <p className="text-xs text-red-500">Fim precisa ser depois do início</p>}
        </div>
      ))}
      {form.timeWindows.length < MAX_TIME_WINDOWS && (
        <Button type="button" variant="outline" size="sm" onClick={form.addWindow}>+ faixa</Button>
      )}
      <p className="text-xs text-muted-foreground">{timeWindowsLabel(form.timeWindows)}. Sem faixa, roda o dia inteiro nos dias marcados. Horário de Brasília.</p>
    </div>
  );
}

const LOOP_INSERTION_OPTIONS = [1, 2, 3, 4, 5] as const;

/**
 * Inserções por volta: quantas vezes a campanha toca a cada volta da TV. O
 * teto de 5 vem da API — mais que isso engoliria a TV do lojista.
 */
export function CampaignLoopInsertionsPicker({ form }: { form: ReturnType<typeof useCampaignForm> }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="campaign-loop-insertions">Inserções por volta</Label>
      <select
        id="campaign-loop-insertions"
        className={SELECT_CLASS}
        value={form.loopInsertions}
        onChange={(e) => form.setLoopInsertions(Number(e.target.value))}
      >
        {LOOP_INSERTION_OPTIONS.map((n) => <option key={n} value={n}>{n}×</option>)}
      </select>
      <p className="text-xs text-muted-foreground">Quantas vezes o anúncio aparece a cada volta da programação da TV. 2× = aparece duas vezes por volta, e custa o dobro.</p>
    </div>
  );
}

/** Linha de alcance e alertas da regra do concorrente; some sem prévia. */
function ReachSummary({ preview }: { preview: ReachPreview }) {
  return (
    <div className="space-y-1 text-sm">
      <p data-testid="reach-summary">
        Alcança <strong>{preview.reachedCount}</strong> de <strong>{preview.totalDevices}</strong> TVs
      </p>
      {preview.reachedCount === 0 && <p className="text-amber-500">Nenhuma TV vai exibir esta campanha.</p>}
      {!preview.advertiserHasSegment && (
        <p className="text-amber-500">
          Anunciante sem segmento: a regra do concorrente não vale.{" "}
          {preview.advertiserCompanyId != null && (
            <Link href={`/companies/${preview.advertiserCompanyId}`} className="underline">Completar cadastro</Link>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Alvo da campanha: os três modos são exclusivos, então um radio — não um
 * switch — e só a lista do modo escolhido aparece.
 */
export function CampaignTargetPicker({
  form,
  devices,
  segments,
  preview,
}: {
  form: ReturnType<typeof useCampaignForm>;
  devices: CampaignFormDevice[];
  segments: CampaignFormSegment[];
  preview?: ReachPreview | null;
}) {
  const competitors = new Set(preview?.competitorDeviceIds ?? []);
  const modes = [
    { value: "all" as const, label: "Todas as TVs", hint: "A campanha entra na programação de toda a rede." },
    { value: "devices" as const, label: "TVs escolhidas", hint: "Só as TVs marcadas abaixo." },
    { value: "segments" as const, label: "Por segmento", hint: "Toda TV cujo dono é de um dos ramos marcados, inclusive as cadastradas depois." },
  ];

  function toggle(list: number[], id: number, checked: boolean) {
    return checked ? [...list, id] : list.filter((item) => item !== id);
  }

  return (
    <div className="space-y-2">
      <Label>Onde a campanha vai passar</Label>
      <div className="space-y-1 rounded-lg border p-2">
        {modes.map((mode) => (
          <label key={mode.value} className="flex cursor-pointer items-start gap-2 rounded p-2 text-sm hover:bg-muted">
            <input
              type="radio"
              className="mt-1"
              name="campaign-target-mode"
              checked={form.targetMode === mode.value}
              onChange={() => form.setTargetMode(mode.value)}
            />
            <span>
              <span className="font-medium">{mode.label}</span>
              <span className="block text-xs text-muted-foreground">{mode.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {form.targetMode === "devices" && (
        <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">
          {devices.map((device) => (
            <label key={device.id} className={`flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted${competitors.has(device.id) ? " opacity-60" : ""}`}>
              <input
                type="checkbox"
                checked={form.selectedDevices.includes(device.id)}
                onChange={(e) => form.setSelectedDevices(toggle(form.selectedDevices, device.id, e.target.checked))}
              />
              {device.name}
              <span className="text-xs text-muted-foreground">· {device.clientName}</span>
              {competitors.has(device.id) && <span className="ml-auto text-xs text-amber-500">concorrente · não toca aqui</span>}
            </label>
          ))}
        </div>
      )}

      {form.targetMode === "segments" && (
        <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">
          {segments.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">Nenhum segmento cadastrado.</p>
          ) : segments.map((segment) => (
            <label key={segment.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted">
              <input
                type="checkbox"
                checked={form.selectedSegments.includes(segment.id)}
                onChange={(e) => form.setSelectedSegments(toggle(form.selectedSegments, segment.id, e.target.checked))}
              />
              {segment.name}
              {preview?.advertiserSegmentId === segment.id && (
                <span className="ml-auto text-xs text-amber-500">mesmo ramo do anunciante · só toca nas TVs dele</span>
              )}
            </label>
          ))}
        </div>
      )}

      {preview && <ReachSummary preview={preview} />}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} required={required} /></div>;
}

export function CampaignFormDialog({ open, onOpenChange, advertisers, announcements, devices, segments, campaign, lockedAdvertiserId, onSaved }: Props) {
  const { toast } = useToast();
  const isEditing = campaign != null;
  const form = useCampaignForm();
  const preview = useReachPreview(
    { advertiserId: form.selectedAdvertiser, targetMode: form.targetMode, deviceIds: form.selectedDevices, segmentIds: form.selectedSegments },
    open,
  );
  const tablePrice = useQuotePreview(
    {
      advertiserId: form.selectedAdvertiser,
      targetMode: form.targetMode,
      deviceIds: form.selectedDevices,
      segmentIds: form.selectedSegments,
      loopInsertions: form.loopInsertions,
    },
    open,
  );

  useEffect(() => {
    if (!open) return;
    form.reset(campaign, lockedAdvertiserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaign, lockedAdvertiserId]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = await form.submit();
    if (!result.ok) {
      toast({ title: result.error || (isEditing ? "Não foi possível atualizar a campanha" : "Não foi possível criar a campanha"), variant: "destructive" });
      return;
    }
    onOpenChange(false);
    toast({ title: isEditing ? "Campanha atualizada" : "Campanha publicada" });
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEditing ? "Editar campanha" : "Nova campanha publicitária"}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2"><Label>Anunciante</Label><div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">{advertisers.map((a) => <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted"><input type="radio" name="advertiser" checked={form.selectedAdvertiser === a.id} disabled={lockedAdvertiserId != null} onChange={() => form.setSelectedAdvertiser(a.id)} />{a.company || a.name}</label>)}</div><p className="text-xs text-muted-foreground">Cada campanha pertence a um único anunciante.</p></div>
          <Field label="Nome da campanha" value={form.name} onChange={form.setName} placeholder="Ex.: Campanha de inverno" required />
          <div className="space-y-2">
            <Label>Anúncios / peças</Label>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-2">
              {announcements.map((a) => {
                const checked = form.selectedAnnouncements.includes(a.id);
                const hasPublishedQr = form.publishedScanCodes[String(a.id)] === true;
                return (
                  <div key={a.id} className="rounded p-2 hover:bg-muted">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => form.setSelectedAnnouncements(e.target.checked ? [...form.selectedAnnouncements, a.id] : form.selectedAnnouncements.filter((id) => id !== a.id))}
                      />
                      {a.title}
                    </label>
                    {checked && (
                      <Input
                        className="mt-2"
                        type="url"
                        placeholder="URL de destino do QR code (opcional)"
                        value={form.announcementDestinations[String(a.id)] ?? ""}
                        onChange={(e) => form.setAnnouncementDestinations({ ...form.announcementDestinations, [String(a.id)]: e.target.value })}
                      />
                    )}
                    {checked && hasPublishedQr && (
                      <p className="mt-1 text-xs text-amber-400">
                        Esta peça já tem um QR code publicado. Desmarcá-la apaga o vínculo e invalida esse QR code para sempre.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Peças com URL de destino exibem um QR code rastreável na TV.</p>
          </div>
          <Field label="Valor contratado (R$)" type="number" value={form.contractValue} onChange={form.setContractValue} placeholder="0,00" />
          <div className="grid grid-cols-2 gap-3"><Field label="Início" type="date" value={form.startsAt} onChange={form.setStartsAt} required /><Field label="Fim" type="date" value={form.endsAt} onChange={form.setEndsAt} required /></div>
          <CampaignWeekdayPicker form={form} />
          <CampaignTimeWindowsPicker form={form} />
          <CampaignLoopInsertionsPicker form={form} />
          {/* Alvo vazio (0 TVs) não tem valor a mostrar. */}
          {tablePrice && tablePrice.quote.tvs > 0 ? (
            <div className="space-y-1 text-sm" data-testid="table-price">
              <p>Valor de tabela: <strong>{formatCents(tablePrice.quote.monthlyCents)}/mês</strong></p>
              {/* A conta por extenso, e quais TVs entram: a prévia de alcance conta a vitrine, o orçamento não. */}
              <p className="text-xs text-muted-foreground">
                {contaDoValor(tablePrice.quote)}. São as TVs do alvo que podem exibir a campanha, sem a vitrine e sem as de concorrente.
              </p>
            </div>
          ) : null}
          <CampaignTargetPicker form={form} devices={devices} segments={segments} preview={preview} />
          {/* Sem exigir peça marcada: a campanha pode existir só para receber o encarte do lojista. */}
          <DialogFooter><Button type="submit" disabled={form.selectedAdvertiser === null || !form.timeWindowsValid}>{isEditing ? "Salvar alterações" : "Publicar campanha"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
