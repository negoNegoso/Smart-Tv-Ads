import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Building2, ChevronRight, DollarSign, Megaphone, Monitor, Plus, Radio, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CampaignFormDialog } from "@/components/campaign-form-dialog";
import { CampaignRow } from "@/components/campaign-row";

type Advertiser = {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  segmentId: number | null;
  segmentName: string | null;
  clientId: number | null;
  clientName: string | null;
  campaignCount: number;
  totalPlays: number;
};

type Segment = { id: number; slug: string; name: string };
type ClientOption = { id: number; name: string };

type Campaign = {
  id: number;
  advertiserId: number;
  advertiserName: string;
  deviceIds?: number[];
  announcementIds: number[];
  announcementTitles: string[];
  name: string;
  contractValue: number;
  startsAt: string;
  endsAt: string;
  targetMode: "all" | "devices" | "segments";
  segmentIds: number[];
  segmentNames: string[];
  isActive: boolean;
  plays: number;
  totalDuration: number;
  playsByAnnouncement?: Array<{ announcementId: number; title: string; plays: number }>;
  scans: number;
  announcementLinks?: Array<{ announcementId: number; title: string; scanCode: string | null; destinationUrl: string | null; plays: number; scans: number }>;
};

type Announcement = { id: number; title: string };
type Device = { id: number; name: string; location: string | null; clientName: string };

const api = (path: string) => `${import.meta.env.BASE_URL}api${path}`;

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export default function Advertisers() {
  const { toast } = useToast();
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [advertiserDialog, setAdvertiserDialog] = useState(false);
  const [campaignDialog, setCampaignDialog] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", segmentId: "", clientId: "" });

  async function load() {
    setLoading(true);
    const [a, c, media, d, seg, cli] = await Promise.all([
      fetch(api("/advertisers")).then((r) => r.json()),
      fetch(api("/campaigns")).then((r) => r.json()),
      fetch(api("/announcements")).then((r) => r.json()),
      fetch(api("/devices")).then((r) => r.json()),
      fetch(api("/segments")).then((r) => r.json()),
      fetch(api("/clients")).then((r) => r.json()),
    ]);
    setAdvertisers(Array.isArray(a) ? a : []);
    setCampaigns(Array.isArray(c) ? c : []);
    setAnnouncements(Array.isArray(media) ? media : []);
    setDevices(Array.isArray(d) ? d : []);
    setSegments(Array.isArray(seg) ? seg : []);
    setClients(Array.isArray(cli) ? cli : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createAdvertiser(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch(api("/advertisers"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        segmentId: form.segmentId ? Number(form.segmentId) : null,
        clientId: form.clientId ? Number(form.clientId) : null,
      }),
    });
    if (!response.ok) {
      toast({ title: "Não foi possível criar o anunciante", variant: "destructive" });
      return;
    }
    setAdvertiserDialog(false);
    setForm({ name: "", company: "", email: "", phone: "", segmentId: "", clientId: "" });
    toast({ title: "Anunciante cadastrado" });
    load();
  }

  async function toggleCampaign(id: number) {
    await fetch(api(`/campaigns/${id}/toggle`), { method: "PATCH" });
    load();
  }

  async function deleteAdvertiser(id: number, label: string) {
    if (!window.confirm(`Excluir o anunciante "${label}"? As campanhas em que ele é o anunciante principal também serão removidas.`)) return;
    await fetch(api(`/advertisers/${id}`), { method: "DELETE" });
    toast({ title: "Anunciante removido" });
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
          <Button onClick={() => setCampaignDialog(true)} disabled={!advertisers.length || !announcements.length}>
            <Radio className="mr-2 h-4 w-4" />Nova campanha
          </Button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric icon={Users} label="Anunciantes" value={advertisers.length} />
        <Metric icon={Megaphone} label="Campanhas" value={campaigns.length} />
        <Metric icon={Monitor} label="Exibições" value={campaigns.reduce((s, c) => s + c.plays, 0)} />
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
                    <p className="text-xs text-muted-foreground">
                      {[advertiser.segmentName, `${advertiser.campaignCount} campanhas`, `${advertiser.totalPlays} exibições`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" aria-label="Excluir anunciante" onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteAdvertiser(advertiser.id, advertiser.company || advertiser.name); }}><Trash2 className="h-4 w-4" /></Button>
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
              <CampaignRow key={campaign.id} campaign={campaign} onToggle={toggleCampaign} />
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
            <SelectField
              label="Segmento"
              value={form.segmentId}
              onChange={(v) => setForm({ ...form, segmentId: v })}
              placeholder="Sem segmento (toca em todas as TVs)"
              options={segments.map((segment) => ({ value: String(segment.id), label: segment.name }))}
              hint="As peças deste anunciante não entram nas TVs de clientes do mesmo segmento."
            />
            <SelectField
              label="Cliente dono (opcional)"
              value={form.clientId}
              onChange={(v) => setForm({ ...form, clientId: v })}
              placeholder="Anunciante externo"
              options={clients.map((client) => ({ value: String(client.id), label: client.name }))}
              hint="Quando a mesma empresa tem TV e anuncia, as peças continuam tocando nas TVs dela."
            />
            <DialogFooter><Button type="submit">Cadastrar anunciante</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CampaignFormDialog
        open={campaignDialog}
        onOpenChange={setCampaignDialog}
        advertisers={advertisers}
        announcements={announcements}
        devices={devices}
        segments={segments}
        onSaved={load}
      />
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return <Card><CardContent className="flex items-center gap-3 pt-5"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div></CardContent></Card>;
}

function SelectField({ label, value, onChange, options, placeholder, hint }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder: string; hint?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} required={required} /></div>;
}