import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, CalendarDays, Megaphone, Radio, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  allDevices: boolean;
  isActive: boolean;
  impressions: number;
  totalDuration: number;
};

type Advertiser = {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  campaigns: Campaign[];
};

export default function AdvertiserDetail() {
  const [, params] = useRoute("/advertisers/:id");
  const [data, setData] = useState<Advertiser | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "" });

  function openEdit() {
    if (!data) return;
    setForm({
      name: data.name ?? "",
      company: data.company ?? "",
      email: data.email ?? "",
      phone: data.phone ?? "",
    });
    setEditOpen(true);
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!params?.id) return;
    const response = await fetch(`${import.meta.env.BASE_URL}api/advertisers/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
            <div key={campaign.id} className={`rounded-lg border p-4 ${!campaign.isActive ? "opacity-55" : ""}`}>
              <div className="flex items-start gap-3">
                <Megaphone className="mt-1 h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="font-medium">{campaign.name}</p>
                  <p className="text-sm text-muted-foreground">{campaign.announcementTitles.join(", ")}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{new Date(campaign.startsAt).toLocaleDateString("pt-BR")} — {new Date(campaign.endsAt).toLocaleDateString("pt-BR")}</span>
                    <span>{campaign.allDevices ? "Todas as TVs" : "TVs selecionadas"}</span>
                    <span>{campaign.impressions} impressões</span>
                    <span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(campaign.contractValue || 0)}</span>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs ${campaign.isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{campaign.isActive ? "Ativa" : "Pausada"}</span>
              </div>
            </div>
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
            <DialogFooter><Button type="submit">Salvar alterações</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}