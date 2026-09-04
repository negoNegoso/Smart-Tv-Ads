import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Radio, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignRow } from "@/components/campaign-row";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Campaign = {
  id: number;
  name: string;
  announcementTitles: string[];
  contractValue: number;
  startsAt: string;
  endsAt: string;
  targetMode: "all" | "devices" | "segments";
  weekdays: number[];
  segmentNames: string[];
  isActive: boolean;
  plays: number;
  totalDuration: number;
  scans: number;
  announcementLinks?: Array<{ announcementId: number; title: string; scanCode: string | null; destinationUrl: string | null; plays: number; scans: number }>;
};

type Advertiser = {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  segmentId: number | null;
  clientId: number | null;
  campaigns: Campaign[];
};

type Segment = { id: number; slug: string; name: string };
type ClientOption = { id: number; name: string };

export default function AdvertiserDetail() {
  const [, params] = useRoute("/advertisers/:id");
  const [data, setData] = useState<Advertiser | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", segmentId: "", clientId: "" });
  const [segments, setSegments] = useState<Segment[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);

  function openEdit() {
    if (!data) return;
    setForm({
      name: data.name ?? "",
      company: data.company ?? "",
      email: data.email ?? "",
      phone: data.phone ?? "",
      segmentId: data.segmentId ? String(data.segmentId) : "",
      clientId: data.clientId ? String(data.clientId) : "",
    });
    setEditOpen(true);
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!params?.id) return;
    const response = await fetch(`${import.meta.env.BASE_URL}api/advertisers/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        segmentId: form.segmentId ? Number(form.segmentId) : null,
        clientId: form.clientId ? Number(form.clientId) : null,
      }),
    });
    if (!response.ok) {
      toast({ title: "Não foi possível atualizar o anunciante", variant: "destructive" });
      return;
    }
    const updated = await response.json();
    setData((prev) => (prev ? { ...prev, ...updated } : prev));
    setEditOpen(false);
    toast({ title: "Anunciante atualizado" });
  }

  async function toggleCampaign(id: number) {
    await fetch(`${import.meta.env.BASE_URL}api/campaigns/${id}/toggle`, { method: "PATCH" });
    if (!params?.id) return;
    const r = await fetch(`${import.meta.env.BASE_URL}api/advertisers/${params.id}`);
    if (r.ok) setData(await r.json());
  }

  useEffect(() => {
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}api/segments`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${import.meta.env.BASE_URL}api/clients`).then((r) => (r.ok ? r.json() : [])),
    ]).then(([seg, cli]) => {
      setSegments(Array.isArray(seg) ? seg : []);
      setClients(Array.isArray(cli) ? cli : []);
    });
  }, []);

  useEffect(() => {
    if (!params?.id) return;
    fetch(`${import.meta.env.BASE_URL}api/advertisers/${params.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setData)
      .finally(() => setLoading(false));
  }, [params?.id]);

  if (loading) return <div className="container mx-auto max-w-4xl px-4 py-8 text-sm text-muted-foreground">Carregando...</div>;
  if (!data) return <div className="container mx-auto max-w-4xl px-4 py-8">Anunciante não encontrado.</div>;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Link href="/advertisers"><Button variant="ghost" size="sm" className="-ml-2 mb-6"><ArrowLeft className="mr-1 h-4 w-4" />Anunciantes</Button></Link>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{data.company || data.name}</h1>
          <p className="mt-1 text-muted-foreground">{[data.company && data.name, data.email, data.phone].filter(Boolean).join(" · ")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5 text-primary" />Campanhas deste anunciante</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!data.campaigns.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma campanha cadastrada.</p> : data.campaigns.map((campaign) => (
            <CampaignRow key={campaign.id} campaign={campaign} onToggle={toggleCampaign} />
          ))}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar anunciante</DialogTitle></DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="space-y-2"><Label>Nome do responsável</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Empresa / marca</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div className="space-y-2"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-2"><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Segmento</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.segmentId}
                onChange={(e) => setForm({ ...form, segmentId: e.target.value })}
              >
                <option value="">Sem segmento (toca em todas as TVs)</option>
                {segments.map((segment) => (
                  <option key={segment.id} value={String(segment.id)}>{segment.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">As peças não entram nas TVs de clientes do mesmo segmento.</p>
            </div>
            <div className="space-y-2">
              <Label>Cliente dono (opcional)</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              >
                <option value="">Anunciante externo</option>
                {clients.map((client) => (
                  <option key={client.id} value={String(client.id)}>{client.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">A loja continua anunciando nas TVs dela mesma.</p>
            </div>
            <DialogFooter><Button type="submit">Salvar alterações</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}