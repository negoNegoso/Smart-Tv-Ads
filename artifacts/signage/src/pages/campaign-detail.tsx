import { useEffect, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { ArrowLeft, CalendarDays, Check, DollarSign, Monitor, Pencil, Plus, Radio, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { useCampaignForm } from "@/components/use-campaign-form";

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
  const [editing, setEditing] = useState(false);
  const form = useCampaignForm();
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

  async function loadFormData(): Promise<boolean> {
    try {
      const [a, media, d] = await Promise.all([
        fetch(api("/advertisers")),
        fetch(api("/announcements")),
        fetch(api("/devices")),
      ]);
      if (!a.ok || !media.ok || !d.ok) throw new Error("Falha ao carregar dados");
      const [aj, mediaj, dj] = await Promise.all([a.json(), media.json(), d.json()]);
      setAdvertisers(Array.isArray(aj) ? aj : []);
      setAnnouncements(Array.isArray(mediaj) ? mediaj : []);
      setDevices(Array.isArray(dj) ? dj : []);
      return true;
    } catch {
      return false;
    }
  }

  async function startEdit() {
    if (!data) return;
    const ok = await loadFormData();
    if (!ok) {
      toast({ title: "Não foi possível carregar os dados para edição. Tente novamente.", variant: "destructive" });
      return;
    }
    form.reset(data);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function save() {
    const result = await form.submit();
    if (!result.ok) {
      toast({ title: result.error || "Não foi possível atualizar a campanha", variant: "destructive" });
      return;
    }
    toast({ title: "Campanha atualizada" });
    setEditing(false);
    await loadCampaign();
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

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Link href={`/advertisers/${data.advertiserId}`}><Button variant="ghost" size="sm" className="-ml-2 mb-6"><ArrowLeft className="mr-1 h-4 w-4" />{data.company || data.advertiserName}</Button></Link>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="flex flex-1 items-center gap-3">
          {editing ? (
            <Input value={form.name} onChange={(e) => form.setName(e.target.value)} className="h-11 text-2xl font-bold" placeholder="Nome da campanha" />
          ) : (
            <>
              <h1 className="text-3xl font-bold tracking-tight">{data.name}</h1>
              <span className={`rounded-full px-2 py-1 text-xs ${data.isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{data.isActive ? "Ativa" : "Pausada"}</span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" onClick={save}><Check className="mr-2 h-4 w-4" />Salvar</Button>
              <Button variant="outline" size="sm" onClick={cancelEdit}><X className="mr-2 h-4 w-4" />Cancelar</Button>
            </>
          ) : (
            <>
              <Switch checked={data.isActive} onCheckedChange={toggle} aria-label="Ativar campanha" />
              <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
              <Button variant="outline" size="sm" className="text-destructive" onClick={remove}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>
            </>
          )}
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
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          {editing ? (
            <>
              <div className="space-y-2">
                <Label>Anunciante</Label>
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">
                  {advertisers.map((a) => (
                    <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted">
                      <input type="radio" name="advertiser" checked={form.selectedAdvertiser === a.id} onChange={() => form.setSelectedAdvertiser(a.id)} />
                      {a.company || a.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Valor contratado (R$)</Label>
                <Input type="number" value={form.contractValue} onChange={(e) => form.setContractValue(e.target.value)} placeholder="0,00" />
              </div>
              <div className="space-y-2">
                <Label>Início</Label>
                <Input type="date" value={form.startsAt} onChange={(e) => form.setStartsAt(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Fim</Label>
                <Input type="date" value={form.endsAt} onChange={(e) => form.setEndsAt(e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Publicar em todas as TVs</p>
                    <p className="text-xs text-muted-foreground">A campanha entra automaticamente na programação de toda a rede.</p>
                  </div>
                  <Switch checked={form.allDevices} onCheckedChange={form.setAllDevices} />
                </div>
                {!form.allDevices && (
                  <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">
                    {devices.map((device) => (
                      <label key={device.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted">
                        <input type="checkbox" checked={form.selectedDevices.includes(device.id)} onChange={(e) => form.setSelectedDevices(e.target.checked ? [...form.selectedDevices, device.id] : form.selectedDevices.filter((id) => id !== device.id))} />
                        {device.name}<span className="text-xs text-muted-foreground">· {device.clientName}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div><p className="text-xs text-muted-foreground">Anunciante</p><p>{data.company || data.advertiserName}</p></div>
              <div><p className="text-xs text-muted-foreground">Período</p><p className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{date(data.startsAt)} — {date(data.endsAt)}</p></div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Cobertura de TVs</p>
                <p>{data.allDevices ? "Todas as TVs" : data.devices.map((d) => d.name).join(", ") || "Nenhuma TV selecionada"}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5 text-primary" />Peças / anúncios</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {editing ? (
            <>
              {form.selectedAnnouncements.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma peça vinculada. Adicione uma abaixo.</p>
              ) : (
                form.selectedAnnouncements.map((id) => {
                  const link = data.announcementLinks.find((l) => l.announcementId === id);
                  const title = link?.title ?? announcements.find((a) => a.id === id)?.title ?? `Peça #${id}`;
                  const hasPublishedQr = form.publishedScanCodes[String(id)] === true;
                  return (
                    <div key={id} className="flex items-start gap-3 rounded-lg border p-3">
                      {link?.scanCode && link?.destinationUrl && (
                        <img src={`${import.meta.env.BASE_URL}api/qr/${link.scanCode}.png`} alt="" className="h-14 w-14 shrink-0 rounded bg-white p-1" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{title}</p>
                        {link && <p className="text-xs text-muted-foreground">{link.plays} exibições · {link.scans} scans</p>}
                        <Input
                          className="mt-2"
                          type="url"
                          placeholder="URL de destino do QR code (opcional)"
                          value={form.announcementDestinations[String(id)] ?? ""}
                          onChange={(e) => form.setAnnouncementDestinations({ ...form.announcementDestinations, [String(id)]: e.target.value })}
                        />
                        {hasPublishedQr && (
                          <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                            Esta peça já tem um QR code publicado. Desvinculá-la apaga o vínculo e invalida esse QR code para sempre.
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-destructive"
                        aria-label="Desvincular peça"
                        onClick={() => form.setSelectedAnnouncements(form.selectedAnnouncements.filter((x) => x !== id))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })
              )}
              <AddPieceCombobox
                announcements={announcements}
                selectedIds={form.selectedAnnouncements}
                onAdd={(id) => form.setSelectedAnnouncements([...form.selectedAnnouncements, id])}
              />
              <p className="text-xs text-muted-foreground">Peças com URL de destino exibem um QR code rastreável na TV.</p>
            </>
          ) : data.announcementLinks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma peça vinculada.</p>
          ) : (
            data.announcementLinks.map((link) => {
              const hasQr = Boolean(link.scanCode && link.destinationUrl);
              return (
                <div key={link.announcementId} className="flex items-start gap-3 rounded-lg border p-3">
                  {hasQr && (
                    <img src={`${import.meta.env.BASE_URL}api/qr/${link.scanCode}.png`} alt="" className="h-14 w-14 shrink-0 rounded bg-white p-1" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{link.title}</p>
                    {hasQr && <p className="truncate text-xs text-muted-foreground">{link.destinationUrl}</p>}
                    <p className="text-xs text-muted-foreground">{link.plays} exibições · {link.scans} scans</p>
                  </div>
                  {hasQr && (
                    <div className="flex shrink-0 gap-1">
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
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return <Card><CardContent className="flex items-center gap-3 pt-5"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div></CardContent></Card>;
}

function AddPieceCombobox({ announcements, selectedIds, onAdd }: { announcements: Announcement[]; selectedIds: number[]; onAdd: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const available = announcements.filter((a) => !selectedIds.includes(a.id));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-full justify-start" disabled={available.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          {available.length === 0 ? "Todas as peças já vinculadas" : "Adicionar peça"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar peça..." />
          <CommandList>
            <CommandEmpty>Nenhuma peça encontrada.</CommandEmpty>
            <CommandGroup>
              {available.map((a) => (
                <CommandItem key={a.id} value={a.title} onSelect={() => { onAdd(a.id); setOpen(false); }}>
                  {a.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
