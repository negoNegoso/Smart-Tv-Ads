# Página de Detalhe da Campanha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma página dedicada `/campaigns/:id` com todos os detalhes/ações da campanha e transformar as listas de campanha (em `/advertisers` e `/advertisers/:id`) em linhas clicáveis enxutas.

**Architecture:** Backend ganha `GET /api/campaigns/:id` reutilizando o helper `campaignWithStats`. No frontend, o formulário de campanha vira um componente compartilhado (`CampaignFormDialog`), as linhas de campanha viram um componente reutilizável (`CampaignRow`), e uma nova página `campaign-detail.tsx` concentra métricas, QR codes, período/TVs e ações (toggle/editar/excluir).

**Tech Stack:** Express + Drizzle (api-server), React 19 + wouter + TanStack Query + Tailwind + shadcn/ui (signage).

**Testing note:** O frontend `@workspace/signage` não possui framework de testes (só `typecheck`). O `@workspace/api-server` tem vitest, mas apenas para helpers em `src/lib` — não há testes de integração de rotas (exigiriam DB). Portanto a verificação de cada task é feita com `pnpm --filter <pkg> typecheck` e conferência manual, seguindo o padrão existente do repositório. Não adicionar novo tooling de teste.

**Convenções observadas:** as páginas `advertisers.tsx` e `advertiser-detail.tsx` usam `fetch` + `useState` (não TanStack Query) e o prefixo de API `${import.meta.env.BASE_URL}api...`. Seguir esse mesmo padrão.

---

### Task 1: Endpoint `GET /api/campaigns/:id`

**Files:**
- Modify: `artifacts/api-server/src/routes/advertisers.ts` (adicionar rota após `GET /campaigns`, por volta da linha 197)

O helper `async function campaignWithStats(campaignId: number)` já existe (linha ~100) e retorna o objeto completo da campanha (incluindo `announcementLinks`, `plays`, `scans`, `contractValue`, `deviceIds`, `announcementIds`, `announcementTitles`, `allDevices`, `isActive`, `advertiserId`, `advertiserName`, `company`, `startsAt`, `endsAt`, `devices`) ou `null`.

- [ ] **Step 1: Adicionar a rota**

Localizar o final do handler `router.get("/campaigns", ...)` (termina com `res.json(rows);\n});`) e inserir logo abaixo:

```ts
router.get("/campaigns/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid campaign id" });
    return;
  }
  const campaign = await campaignWithStats(id);
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res.json(campaign);
});
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS (sem erros).

- [ ] **Step 3: Verificação manual rápida (opcional)**

Com o servidor rodando, `curl http://localhost:<porta>/api/campaigns/1` deve retornar o JSON da campanha; um id inexistente retorna `404 {"error":"Campaign not found"}`.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/advertisers.ts
git commit -m "feat(api): endpoint GET /api/campaigns/:id"
```

---

### Task 2: Componente compartilhado `CampaignFormDialog`

Extrai o formulário de criar/editar campanha de `advertisers.tsx` para um componente reutilizável. Este task **cria** o componente; o task 5 passa `advertisers.tsx` a consumi-lo.

**Files:**
- Create: `artifacts/signage/src/components/campaign-form-dialog.tsx`

Referência: a lógica atual está em `advertisers.tsx` (estados `campaignForm`, `selectedAdvertiser`, `selectedDevices`, `selectedAnnouncements`, `announcementDestinations`, `publishedScanCodes`, `allDevices`; funções `openNewCampaign`, `openEditCampaign`, `submitCampaign`; e o JSX do `<Dialog>` de campanha, linhas ~305-330).

- [ ] **Step 1: Criar o componente com tipos e props**

```tsx
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
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: PASS. (O componente ainda não é usado; typecheck garante que compila.)

- [ ] **Step 3: Commit**

```bash
git add artifacts/signage/src/components/campaign-form-dialog.tsx
git commit -m "feat(signage): componente compartilhado CampaignFormDialog"
```

---

### Task 3: Componente `CampaignRow`

Linha enxuta e clicável (nome + status + período + toggle) reutilizada nas duas listas.

**Files:**
- Create: `artifacts/signage/src/components/campaign-row.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
import { Link } from "wouter";
import { CalendarDays, Megaphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export type CampaignRowData = {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

function date(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function CampaignRow({ campaign, onToggle }: { campaign: CampaignRowData; onToggle: (id: number) => void }) {
  return (
    <Link href={`/campaigns/${campaign.id}`}>
      <div className={`group flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-muted/30 ${!campaign.isActive ? "opacity-55" : ""}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Megaphone className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{campaign.name}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3 w-3" />{date(campaign.startsAt)} — {date(campaign.endsAt)}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${campaign.isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{campaign.isActive ? "Ativa" : "Pausada"}</span>
        <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} className="shrink-0">
          <Switch checked={campaign.isActive} onCheckedChange={() => onToggle(campaign.id)} aria-label="Ativar campanha" />
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/signage/src/components/campaign-row.tsx
git commit -m "feat(signage): componente CampaignRow"
```

---

### Task 4: Página `campaign-detail.tsx` + rota

**Files:**
- Create: `artifacts/signage/src/pages/campaign-detail.tsx`
- Modify: `artifacts/signage/src/App.tsx` (import + `<Route path="/campaigns/:id">`)

- [ ] **Step 1: Criar a página**

```tsx
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
```

- [ ] **Step 2: Registrar a rota em `App.tsx`**

Adicionar o import junto aos demais imports de páginas:

```tsx
import CampaignDetail from './pages/campaign-detail';
```

Dentro de `AdminRoutes`, adicionar a rota logo após o bloco `<Route path="/advertisers/:id">...</Route>`:

```tsx
      <Route path="/campaigns/:id">
        <Layout><CampaignDetail /></Layout>
      </Route>
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: PASS.

- [ ] **Step 4: Verificação manual**

Rodar o dev do signage e acessar `/campaigns/<id>`: deve exibir cabeçalho, métricas, detalhes, peças e QR codes; toggle/editar/excluir funcionam; excluir volta para o anunciante.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/pages/campaign-detail.tsx artifacts/signage/src/App.tsx
git commit -m "feat(signage): página de detalhe da campanha /campaigns/:id"
```

---

### Task 5: Simplificar `advertisers.tsx` (linhas + reuso do dialog)

Substitui a lista detalhada de campanhas por `CampaignRow` e move a criação de campanha para o `CampaignFormDialog` compartilhado, removendo o formulário embutido.

**Files:**
- Modify: `artifacts/signage/src/pages/advertisers.tsx`

- [ ] **Step 1: Ajustar imports**

Adicionar no topo:

```tsx
import { CampaignFormDialog } from "@/components/campaign-form-dialog";
import { CampaignRow } from "@/components/campaign-row";
```

Remover do import de `lucide-react` os ícones que deixam de ser usados nas linhas (`CalendarDays`, `Pencil`) **apenas se** não forem mais referenciados após as edições — conferir com o typecheck no Step 6 e remover os que sobrarem como não usados.

- [ ] **Step 2: Remover estados e funções do formulário embutido**

Excluir estes trechos de `advertisers.tsx` (agora vivem no `CampaignFormDialog`):

- Estados: `campaignDialog`, `editingCampaignId`, `selectedAdvertiser`, `selectedDevices`, `selectedAnnouncements`, `announcementDestinations`, `publishedScanCodes`, `allDevices`, `campaignForm`.
- Funções: `openNewCampaign`, `openEditCampaign`, `submitCampaign`.

Adicionar no lugar um estado simples para controlar o dialog de criação:

```tsx
const [campaignDialog, setCampaignDialog] = useState(false);
```

Manter `toggleCampaign` (usado pelas linhas). As funções `deleteCampaign` e `openEditCampaign` **não** são mais necessárias aqui (edição/exclusão migraram para a página de detalhe) — remover `deleteCampaign` e `openEditCampaign`.

- [ ] **Step 3: Trocar o botão "Nova campanha"**

Onde há `<Button onClick={openNewCampaign} ...>`, trocar por:

```tsx
<Button onClick={() => setCampaignDialog(true)} disabled={!advertisers.length || !announcements.length}>
  <Radio className="mr-2 h-4 w-4" />Nova campanha
</Button>
```

- [ ] **Step 4: Substituir o card de campanhas detalhado por linhas**

Localizar o segundo `<Card>` (o de "Campanhas", com o `.map` que renderiza QR inline, editar/excluir/toggle e métricas). Substituir todo o corpo do `.map` por linhas `CampaignRow`:

```tsx
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
```

- [ ] **Step 5: Substituir o `<Dialog>` de campanha embutido**

Remover todo o bloco `<Dialog open={campaignDialog} ...> ... </Dialog>` que continha o formulário de campanha e, no seu lugar, usar o componente compartilhado (modo criação):

```tsx
<CampaignFormDialog
  open={campaignDialog}
  onOpenChange={setCampaignDialog}
  advertisers={advertisers}
  announcements={announcements}
  devices={devices}
  onSaved={load}
/>
```

Manter o `<Dialog>` de "Novo anunciante" inalterado. Remover o componente local `Field` se ele tiver ficado sem uso após a remoção do formulário (conferir no typecheck).

- [ ] **Step 6: Verificar tipos**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: PASS. Corrigir quaisquer imports/símbolos não utilizados que o compilador apontar (ícones, `Field`, `useMemo` se aplicável — manter `totalValue`/`useMemo` que ainda são usados pelas métricas).

- [ ] **Step 7: Verificação manual**

Em `/advertisers`: a lista de campanhas mostra apenas linhas (nome + status + período + toggle); clicar abre `/campaigns/:id`; o toggle alterna sem navegar; "Nova campanha" cria via dialog.

- [ ] **Step 8: Commit**

```bash
git add artifacts/signage/src/pages/advertisers.tsx
git commit -m "refactor(signage): campanhas como linhas em /advertisers e reuso do dialog"
```

---

### Task 6: Simplificar `advertiser-detail.tsx` (linhas clicáveis)

**Files:**
- Modify: `artifacts/signage/src/pages/advertiser-detail.tsx`

- [ ] **Step 1: Ajustar imports**

Adicionar:

```tsx
import { CampaignRow } from "@/components/campaign-row";
```

O `toggle` de campanha precisa recarregar os dados do anunciante. Adicionar uma função dentro do componente:

```tsx
async function toggleCampaign(id: number) {
  await fetch(`${import.meta.env.BASE_URL}api/campaigns/${id}/toggle`, { method: "PATCH" });
  if (!params?.id) return;
  const r = await fetch(`${import.meta.env.BASE_URL}api/advertisers/${params.id}`);
  if (r.ok) setData(await r.json());
}
```

- [ ] **Step 2: Substituir os cards de campanha por linhas**

No `<CardContent>` de "Campanhas deste anunciante", trocar o `.map` atual (que renderiza cards expandidos com Megaphone, métricas e status) por:

```tsx
{!data.campaigns.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma campanha cadastrada.</p> : data.campaigns.map((campaign) => (
  <CampaignRow key={campaign.id} campaign={campaign} onToggle={toggleCampaign} />
))}
```

- [ ] **Step 3: Remover ícones não usados**

Após a substituição, remover do import de `lucide-react` os ícones que deixaram de ser referenciados (provavelmente `CalendarDays`, `Megaphone`; manter `ArrowLeft`, `Radio`, `Pencil` que seguem em uso). Confirmar com o typecheck.

- [ ] **Step 4: Verificar tipos**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: PASS.

- [ ] **Step 5: Verificação manual**

Em `/advertisers/:id`: as campanhas do anunciante aparecem como linhas; clicar abre `/campaigns/:id`; o toggle alterna e a lista reflete o novo status.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/src/pages/advertiser-detail.tsx
git commit -m "refactor(signage): campanhas como linhas em /advertisers/:id"
```

---

### Task 7: Verificação final

- [ ] **Step 1: Typecheck de todo o workspace**

Run: `pnpm typecheck`
Expected: PASS (libs + api-server + signage).

- [ ] **Step 2: Testes existentes do api-server**

Run: `pnpm --filter @workspace/api-server test`
Expected: PASS (nenhuma regressão — não alteramos helpers de `src/lib`).

- [ ] **Step 3: Conferência de fluxo end-to-end (manual)**

`/advertisers` → linha de campanha → `/campaigns/:id` → editar (dialog) salva e recarrega → toggle → excluir volta ao anunciante. Repetir a navegação por linha a partir de `/advertisers/:id`.
