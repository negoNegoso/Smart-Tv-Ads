import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
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
 * Alvo da campanha: os três modos são exclusivos, então um radio — não um
 * switch — e só a lista do modo escolhido aparece.
 */
export function CampaignTargetPicker({
  form,
  devices,
  segments,
}: {
  form: ReturnType<typeof useCampaignForm>;
  devices: CampaignFormDevice[];
  segments: CampaignFormSegment[];
}) {
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
            <label key={device.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted">
              <input
                type="checkbox"
                checked={form.selectedDevices.includes(device.id)}
                onChange={(e) => form.setSelectedDevices(toggle(form.selectedDevices, device.id, e.target.checked))}
              />
              {device.name}
              <span className="text-xs text-muted-foreground">· {device.clientName}</span>
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
            </label>
          ))}
        </div>
      )}
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
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
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
          <CampaignTargetPicker form={form} devices={devices} segments={segments} />
          <DialogFooter><Button type="submit" disabled={form.selectedAdvertiser === null || !form.selectedAnnouncements.length}>{isEditing ? "Salvar alterações" : "Publicar campanha"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
