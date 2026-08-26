import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Building2, CalendarDays, ChevronRight, DollarSign, Megaphone, Monitor, Pencil, Plus, Radio, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type Advertiser = {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  campaignCount: number;
  totalImpressions: number;
};

type Campaign = {
  id: number;
  advertiserId: number;
  advertiserName: string;
  advertiserNames?: string[];
  advertiserIds?: number[];
  deviceIds?: number[];
  announcementIds: number[];
  announcementTitles: string[];
  name: string;
  contractValue: number;
  startsAt: string;
  endsAt: string;
  allDevices: boolean;
  isActive: boolean;
  impressions: number;
  totalDuration: number;
  impressionsByAnnouncement?: Array<{ announcementId: number; title: string; impressions: number }>;
};

type Announcement = { id: number; title: string };
type Device = { id: number; name: string; location: string | null; clientName: string };

const api = (path: string) => `${import.meta.env.BASE_URL}api${path}`;

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function date(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

export default function Advertisers() {
  const { toast } = useToast();
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [advertiserDialog, setAdvertiserDialog] = useState(false);
  const [campaignDialog, setCampaignDialog] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<number | null>(null);
  const [selectedAdvertisers, setSelectedAdvertisers] = useState<number[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<number[]>([]);
  const [selectedAnnouncements, setSelectedAnnouncements] = useState<number[]>([]);
  const [allDevices, setAllDevices] = useState(true);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "" });
  const [campaignForm, setCampaignForm] = useState({
    name: "", contractValue: "", startsAt: "", endsAt: "",
  });

  async function load() {
    setLoading(true);
    const [a, c, media, d] = await Promise.all([
      fetch(api("/advertisers")).then((r) => r.json()),
      fetch(api("/campaigns")).then((r) => r.json()),
      fetch(api("/announcements")).then((r) => r.json()),
      fetch(api("/devices")).then((r) => r.json()),
    ]);
    setAdvertisers(Array.isArray(a) ? a : []);
    setCampaigns(Array.isArray(c) ? c : []);
    setAnnouncements(Array.isArray(media) ? media : []);
    setDevices(Array.isArray(d) ? d : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createAdvertiser(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch(api("/advertisers"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (!response.ok) {
      toast({ title: "Não foi possível criar o anunciante", variant: "destructive" });
      return;
    }
    setAdvertiserDialog(false);
    setForm({ name: "", company: "", email: "", phone: "" });
    toast({ title: "Anunciante cadastrado" });
    load();
  }

  function openNewCampaign() {
    setEditingCampaignId(null);
    setCampaignForm({ name: "", contractValue: "", startsAt: "", endsAt: "" });
    setSelectedAdvertisers([]);
    setSelectedDevices([]);
    setSelectedAnnouncements([]);
    setAllDevices(true);
    setCampaignDialog(true);
  }

  function openEditCampaign(campaign: Campaign) {
    setEditingCampaignId(campaign.id);
    setCampaignForm({
      name: campaign.name,
      contractValue: String(campaign.contractValue ?? ""),
      startsAt: campaign.startsAt.slice(0, 10),
      endsAt: campaign.endsAt.slice(0, 10),
    });
    setSelectedAdvertisers(campaign.advertiserIds ?? []);
    setSelectedDevices(campaign.deviceIds ?? []);
    setSelectedAnnouncements(campaign.announcementIds ?? []);
    setAllDevices(campaign.allDevices);
    setCampaignDialog(true);
  }

  async function submitCampaign(event: React.FormEvent) {
    event.preventDefault();
    const isEditing = editingCampaignId !== null;
    const response = await fetch(api(isEditing ? `/campaigns/${editingCampaignId}` : "/campaigns"), {
      method: isEditing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...campaignForm,
        advertiserIds: selectedAdvertisers,
        announcementIds: selectedAnnouncements,
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
    setCampaignDialog(false);
    setEditingCampaignId(null);
    setCampaignForm({ name: "", contractValue: "", startsAt: "", endsAt: "" });
    setSelectedDevices([]);
    setSelectedAdvertisers([]);
    setSelectedAnnouncements([]);
    toast({ title: isEditing ? "Campanha atualizada" : "Campanha publicada" });
    load();
  }

  async function toggleCampaign(id: number) {
    await fetch(api(`/campaigns/${id}/toggle`), { method: "PATCH" });
    load();
  }

  async function deleteCampaign(id: number) {
    await fetch(api(`/campaigns/${id}`), { method: "DELETE" });
    toast({ title: "Campanha removida" });
    load();
  }

  const totalValue = useMemo(() => campaigns.reduce((sum, campaign) => sum + Number(campaign.contractValue || 0), 0), [campaigns]);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Anunciantes</h1>
          <p className="mt-1 text-muted-foreground">Clientes que pagam para publicar anúncios na sua rede de TVs.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAdvertiserDialog(true)}><Plus className="mr-2 h-4 w-4" />Novo anunciante</Button>
          <Button onClick={openNewCampaign} disabled={!advertisers.length || !announcements.length}>
            <Radio className="mr-2 h-4 w-4" />Nova campanha
          </Button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric icon={Users} label="Anunciantes" value={advertisers.length} />
        <Metric icon={Megaphone} label="Campanhas" value={campaigns.length} />
        <Metric icon={Monitor} label="Impressões" value={campaigns.reduce((s, c) => s + c.impressions, 0)} />
        <Metric icon={DollarSign} label="Valor contratado" value={money(totalValue)} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" />Anunciantes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p> : advertisers.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Cadastre o primeiro anunciante.</div>
            ) : advertisers.map((advertiser) => (
              <Link key={advertiser.id} href={`/advertisers/${advertiser.id}`}>
                <div className="group flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-muted/30">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{advertiser.company || advertiser.name}</p>
                    <p className="text-xs text-muted-foreground">{advertiser.campaignCount} campanhas · {advertiser.totalImpressions} impressões</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5 text-primary" />Campanhas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {campaigns.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma campanha publicada.</div>
            ) : campaigns.map((campaign) => (
              <div key={campaign.id} className={`group rounded-lg border p-3 transition-colors ${!campaign.isActive ? "opacity-55" : "hover:border-primary/40"}`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Megaphone className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{campaign.name}</p>
                    <p className="text-xs text-muted-foreground">{(campaign.advertiserNames?.length ? campaign.advertiserNames.join(", ") : campaign.advertiserName)} · {campaign.announcementTitles.join(", ")}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{date(campaign.startsAt)} — {date(campaign.endsAt)}</span>
                      <span>{campaign.allDevices ? "Todas as TVs" : "TVs selecionadas"}</span>
                      <span>{campaign.impressions} impressões</span>
                      <span className="font-medium text-foreground">{money(campaign.contractValue)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch checked={campaign.isActive} onCheckedChange={() => toggleCampaign(campaign.id)} aria-label="Ativar campanha" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openEditCampaign(campaign)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteCampaign(campaign.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={advertiserDialog} onOpenChange={setAdvertiserDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo anunciante</DialogTitle></DialogHeader>
          <form onSubmit={createAdvertiser} className="space-y-4">
            <Field label="Nome do responsável" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <Field label="Empresa / marca" value={form.company} onChange={(v) => setForm({ ...form, company: v })} placeholder="Ex.: Padaria Central" />
            <Field label="E-mail" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Field label="Telefone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <DialogFooter><Button type="submit">Cadastrar anunciante</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={campaignDialog} onOpenChange={(open) => { setCampaignDialog(open); if (!open) setEditingCampaignId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingCampaignId !== null ? "Editar campanha" : "Nova campanha publicitária"}</DialogTitle></DialogHeader>
          <form onSubmit={submitCampaign} className="space-y-4">
            <div className="space-y-2"><Label>Anunciantes</Label><div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">{advertisers.map((a) => <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted"><input type="checkbox" checked={selectedAdvertisers.includes(a.id)} onChange={(e) => setSelectedAdvertisers(e.target.checked ? [...selectedAdvertisers, a.id] : selectedAdvertisers.filter((id) => id !== a.id))} />{a.company || a.name}</label>)}</div><p className="text-xs text-muted-foreground">Você pode vincular a mesma campanha a vários anunciantes.</p></div>
            <Field label="Nome da campanha" value={campaignForm.name} onChange={(v) => setCampaignForm({ ...campaignForm, name: v })} placeholder="Ex.: Campanha de inverno" required />
            <div className="space-y-2"><Label>Anúncios / peças</Label><div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">{announcements.map((a) => <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted"><input type="checkbox" checked={selectedAnnouncements.includes(a.id)} onChange={(e) => setSelectedAnnouncements(e.target.checked ? [...selectedAnnouncements, a.id] : selectedAnnouncements.filter((id) => id !== a.id))} />{a.title}</label>)}</div><p className="text-xs text-muted-foreground">Você pode vincular vários anúncios à mesma campanha.</p></div>
            <Field label="Valor contratado (R$)" type="number" value={campaignForm.contractValue} onChange={(v) => setCampaignForm({ ...campaignForm, contractValue: v })} placeholder="0,00" />
            <div className="grid grid-cols-2 gap-3"><Field label="Início" type="date" value={campaignForm.startsAt} onChange={(v) => setCampaignForm({ ...campaignForm, startsAt: v })} required /><Field label="Fim" type="date" value={campaignForm.endsAt} onChange={(v) => setCampaignForm({ ...campaignForm, endsAt: v })} required /></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-medium">Publicar em todas as TVs</p><p className="text-xs text-muted-foreground">A campanha entra automaticamente na programação de toda a rede.</p></div><Switch checked={allDevices} onCheckedChange={setAllDevices} /></div>
            {!allDevices && <div className="space-y-2"><Label>Escolha as TVs</Label><div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">{devices.map((device) => <label key={device.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted"><input type="checkbox" checked={selectedDevices.includes(device.id)} onChange={(e) => setSelectedDevices(e.target.checked ? [...selectedDevices, device.id] : selectedDevices.filter((id) => id !== device.id))} />{device.name}<span className="text-xs text-muted-foreground">· {device.clientName}</span></label>)}</div></div>}
            <DialogFooter><Button type="submit" disabled={!selectedAdvertisers.length || !selectedAnnouncements.length}>{editingCampaignId !== null ? "Salvar alterações" : "Publicar campanha"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return <Card><CardContent className="flex items-center gap-3 pt-5"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div></CardContent></Card>;
}

function Field({ label, value, onChange, type = "text", placeholder, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} required={required} /></div>;
}