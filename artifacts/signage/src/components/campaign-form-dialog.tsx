import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const api = (path: string) => `${import.meta.env.BASE_URL}api${path}`;

export type CampaignFormAdvertiser = { id: number; name: string; company: string | null };
export type CampaignFormAnnouncement = { id: number; title: string };
export type CampaignFormDevice = { id: number; name: string; location: string | null; clientName: string };

export type CampaignFormCampaign = {
  id: number;
  advertiserId: number;
  name: string;
  contractValue: number;
  startsAt: string;
  endsAt: string;
  allDevices: boolean;
  deviceIds?: number[];
  announcementIds?: number[];
  announcementLinks?: Array<{ announcementId: number; scanCode: string | null; destinationUrl: string | null }>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  advertisers: CampaignFormAdvertiser[];
  announcements: CampaignFormAnnouncement[];
  devices: CampaignFormDevice[];
  campaign?: CampaignFormCampaign | null;
  lockedAdvertiserId?: number;
  onSaved: () => void;
};

function Field({ label, value, onChange, type = "text", placeholder, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} required={required} /></div>;
}

export function CampaignFormDialog({ open, onOpenChange, advertisers, announcements, devices, campaign, lockedAdvertiserId, onSaved }: Props) {
  const { toast } = useToast();
  const isEditing = campaign != null;
  const [selectedAdvertiser, setSelectedAdvertiser] = useState<number | null>(null);
  const [selectedDevices, setSelectedDevices] = useState<number[]>([]);
  const [selectedAnnouncements, setSelectedAnnouncements] = useState<number[]>([]);
  const [announcementDestinations, setAnnouncementDestinations] = useState<Record<string, string>>({});
  const [publishedScanCodes, setPublishedScanCodes] = useState<Record<string, boolean>>({});
  const [allDevices, setAllDevices] = useState(true);
  const [campaignForm, setCampaignForm] = useState({ name: "", contractValue: "", startsAt: "", endsAt: "" });

  useEffect(() => {
    if (!open) return;
    if (campaign) {
      setCampaignForm({
        name: campaign.name,
        contractValue: String(campaign.contractValue ?? ""),
        startsAt: campaign.startsAt.slice(0, 10),
        endsAt: campaign.endsAt.slice(0, 10),
      });
      setSelectedAdvertiser(campaign.advertiserId);
      setSelectedDevices(campaign.deviceIds ?? []);
      setSelectedAnnouncements(campaign.announcementIds ?? []);
      setAnnouncementDestinations(
        Object.fromEntries((campaign.announcementLinks ?? []).map((link) => [String(link.announcementId), link.destinationUrl ?? ""])),
      );
      setPublishedScanCodes(
        Object.fromEntries(
          (campaign.announcementLinks ?? [])
            .filter((link) => link.scanCode && link.destinationUrl)
            .map((link) => [String(link.announcementId), true]),
        ),
      );
      setAllDevices(campaign.allDevices);
    } else {
      setCampaignForm({ name: "", contractValue: "", startsAt: "", endsAt: "" });
      setSelectedAdvertiser(lockedAdvertiserId ?? null);
      setSelectedDevices([]);
      setSelectedAnnouncements([]);
      setAnnouncementDestinations({});
      setPublishedScanCodes({});
      setAllDevices(true);
    }
  }, [open, campaign, lockedAdvertiserId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch(api(isEditing ? `/campaigns/${campaign!.id}` : "/campaigns"), {
      method: isEditing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...campaignForm,
        advertiserId: selectedAdvertiser,
        announcementIds: selectedAnnouncements,
        announcementDestinations,
        contractValue: Number(campaignForm.contractValue || 0),
        allDevices,
        deviceIds: selectedDevices,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      toast({ title: error?.error || (isEditing ? "Não foi possível atualizar a campanha" : "Não foi possível criar a campanha"), variant: "destructive" });
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
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label>Anunciante</Label><div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">{advertisers.map((a) => <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted"><input type="radio" name="advertiser" checked={selectedAdvertiser === a.id} disabled={lockedAdvertiserId != null} onChange={() => setSelectedAdvertiser(a.id)} />{a.company || a.name}</label>)}</div><p className="text-xs text-muted-foreground">Cada campanha pertence a um único anunciante.</p></div>
          <Field label="Nome da campanha" value={campaignForm.name} onChange={(v) => setCampaignForm({ ...campaignForm, name: v })} placeholder="Ex.: Campanha de inverno" required />
          <div className="space-y-2">
            <Label>Anúncios / peças</Label>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-2">
              {announcements.map((a) => {
                const checked = selectedAnnouncements.includes(a.id);
                const hasPublishedQr = publishedScanCodes[String(a.id)] === true;
                return (
                  <div key={a.id} className="rounded p-2 hover:bg-muted">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setSelectedAnnouncements(e.target.checked ? [...selectedAnnouncements, a.id] : selectedAnnouncements.filter((id) => id !== a.id))}
                      />
                      {a.title}
                    </label>
                    {checked && (
                      <Input
                        className="mt-2"
                        type="url"
                        placeholder="URL de destino do QR code (opcional)"
                        value={announcementDestinations[String(a.id)] ?? ""}
                        onChange={(e) => setAnnouncementDestinations({ ...announcementDestinations, [String(a.id)]: e.target.value })}
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
          <Field label="Valor contratado (R$)" type="number" value={campaignForm.contractValue} onChange={(v) => setCampaignForm({ ...campaignForm, contractValue: v })} placeholder="0,00" />
          <div className="grid grid-cols-2 gap-3"><Field label="Início" type="date" value={campaignForm.startsAt} onChange={(v) => setCampaignForm({ ...campaignForm, startsAt: v })} required /><Field label="Fim" type="date" value={campaignForm.endsAt} onChange={(v) => setCampaignForm({ ...campaignForm, endsAt: v })} required /></div>
          <div className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-medium">Publicar em todas as TVs</p><p className="text-xs text-muted-foreground">A campanha entra automaticamente na programação de toda a rede.</p></div><Switch checked={allDevices} onCheckedChange={setAllDevices} /></div>
          {!allDevices && <div className="space-y-2"><Label>Escolha as TVs</Label><div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">{devices.map((device) => <label key={device.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted"><input type="checkbox" checked={selectedDevices.includes(device.id)} onChange={(e) => setSelectedDevices(e.target.checked ? [...selectedDevices, device.id] : selectedDevices.filter((id) => id !== device.id))} />{device.name}<span className="text-xs text-muted-foreground">· {device.clientName}</span></label>)}</div></div>}
          <DialogFooter><Button type="submit" disabled={selectedAdvertiser === null || !selectedAnnouncements.length}>{isEditing ? "Salvar alterações" : "Publicar campanha"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
