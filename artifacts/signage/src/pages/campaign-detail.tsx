import { useEffect, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { ArrowLeft, CalendarDays, DollarSign, Monitor, Pencil, Radio, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { CampaignFormDialog } from "@/components/campaign-form-dialog";

const api = (path: string) => `${import.meta.env.BASE_URL}api${path}`;

type AnnouncementLink = { announcementId: number; title: string; scanCode: string | null; destinationUrl: string | null; plays: number; scans: number };

type Campaign = {
  id: number;
  advertiserId: number;
  advertiserName: string;
  company: string | null;
  name: string;
  contractValue: number;
  startsAt: string;
  endsAt: string;
  allDevices: boolean;
  isActive: boolean;
  plays: number;
  scans: number;
  totalDuration: number;
  deviceIds: number[];
  announcementIds: number[];
  announcementTitles: string[];
  announcementLinks: AnnouncementLink[];
  devices: Array<{ id: number; name: string; location: string | null }>;
};

type Advertiser = { id: number; name: string; company: string | null };
type Announcement = { id: number; title: string };
type Device = { id: number; name: string; location: string | null; clientName: string };

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}
function date(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default function CampaignDetail() {
  const [, params] = useRoute("/campaigns/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [data, setData] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);

  async function loadCampaign() {
    if (!params?.id) return;
    const res = await fetch(api(`/campaigns/${params.id}`));
    setData(res.ok ? await res.json() : null);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    loadCampaign();
  }, [params?.id]);

  async function loadFormData() {
    const [a, media, d] = await Promise.all([
      fetch(api("/advertisers")).then((r) => r.json()),
      fetch(api("/announcements")).then((r) => r.json()),
      fetch(api("/devices")).then((r) => r.json()),
    ]);
    setAdvertisers(Array.isArray(a) ? a : []);
    setAnnouncements(Array.isArray(media) ? media : []);
    setDevices(Array.isArray(d) ? d : []);
  }

  function openEdit() {
    loadFormData();
    setEditOpen(true);
  }

  async function toggle() {
    if (!data) return;
    await fetch(api(`/campaigns/${data.id}/toggle`), { method: "PATCH" });
    loadCampaign();
  }

  async function remove() {
    if (!data) return;
    if (!window.confirm(`Excluir a campanha "${data.name}"?`)) return;
    await fetch(api(`/campaigns/${data.id}`), { method: "DELETE" });
    toast({ title: "Campanha removida" });
    navigate(`/advertisers/${data.advertiserId}`);
  }

  if (loading) return <div className="container mx-auto max-w-4xl px-4 py-8 text-sm text-muted-foreground">Carregando...</div>;
  if (!data) return <div className="container mx-auto max-w-4xl px-4 py-8">Campanha não encontrada.</div>;

  const scanRate = data.plays > 0 ? (data.scans / data.plays) * 100 : 0;
  const qrLinks = data.announcementLinks.filter((link) => link.destinationUrl && link.scanCode);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Link href={`/advertisers/${data.advertiserId}`}><Button variant="ghost" size="sm" className="-ml-2 mb-6"><ArrowLeft className="mr-1 h-4 w-4" />{data.company || data.advertiserName}</Button></Link>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{data.name}</h1>
          <span className={`rounded-full px-2 py-1 text-xs ${data.isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{data.isActive ? "Ativa" : "Pausada"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Switch checked={data.isActive} onCheckedChange={toggle} aria-label="Ativar campanha" />
          <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
          <Button variant="outline" size="sm" className="text-destructive" onClick={remove}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric icon={Monitor} label="Exibições" value={data.plays} />
        <Metric icon={Radio} label="Scans" value={data.scans} />
        <Metric icon={Users} label="Taxa" value={`${scanRate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`} />
        <Metric icon={DollarSign} label="Valor contratado" value={money(data.contractValue)} />
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Detalhes</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">Anunciante</p><p>{data.company || data.advertiserName}</p></div>
          <div><p className="text-xs text-muted-foreground">Período</p><p className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{date(data.startsAt)} — {date(data.endsAt)}</p></div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">Cobertura de TVs</p>
            <p>{data.allDevices ? "Todas as TVs" : data.devices.map((d) => d.name).join(", ") || "Nenhuma TV selecionada"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5 text-primary" />Peças / anúncios</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {data.announcementLinks.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma peça vinculada.</p> : data.announcementLinks.map((link) => (
            <div key={link.announcementId} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{link.title}</p>
                  <p className="text-xs text-muted-foreground">{link.plays} exibições · {link.scans} scans</p>
                </div>
              </div>
            </div>
          ))}
          {qrLinks.map((link) => (
            <div key={`qr-${link.announcementId}`} className="flex items-center gap-3 rounded-lg border p-2">
              <img src={`${import.meta.env.BASE_URL}api/qr/${link.scanCode}.png`} alt="" className="h-14 w-14 rounded bg-white p-1" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{link.title}</p>
                <p className="truncate text-xs text-muted-foreground">{link.destinationUrl}</p>
                <p className="text-xs text-muted-foreground">{link.plays} exibições · {link.scans} scans</p>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/r/${link.scanCode}`)
                      .then(() => toast({ title: "Link copiado" }))
                      .catch(() => toast({ title: "Não foi possível copiar o link", variant: "destructive" }));
                  }}
                >
                  Copiar link
                </Button>
                <a href={`${import.meta.env.BASE_URL}api/qr/${link.scanCode}.png`} download={`qr-${link.scanCode}.png`}>
                  <Button type="button" variant="outline" size="sm">Baixar PNG</Button>
                </a>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <CampaignFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        advertisers={advertisers}
        announcements={announcements}
        devices={devices}
        campaign={data}
        onSaved={loadCampaign}
      />
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return <Card><CardContent className="flex items-center gap-3 pt-5"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div></CardContent></Card>;
}
