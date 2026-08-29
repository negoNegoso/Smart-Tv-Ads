# Edição inline e peças unificadas na campanha — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na página `/campaigns/:id`, substituir o modal de edição por um modo de edição inline e unificar cada peça/anúncio com seu QR code em uma única linha.

**Architecture:** Extrair todo o estado + submissão do formulário de campanha para um hook compartilhado `useCampaignForm`. O `CampaignFormDialog` (usado só para criação em `/advertisers`) passa a consumir o hook sem mudar seu layout. `campaign-detail.tsx` ganha um estado `editing` e consome o mesmo hook para editar no lugar, além de renderizar uma linha por peça com QR inline.

**Tech Stack:** React 19, wouter, Tailwind, shadcn/ui, `fetch` + `useState` (padrão do pacote `@workspace/signage`).

---

## Estrutura de arquivos

- **Criar:** `artifacts/signage/src/components/use-campaign-form.ts` — hook com estado do formulário, `reset(campaign?, lockedAdvertiserId?)` e `submit()` (POST/PATCH).
- **Modificar:** `artifacts/signage/src/components/campaign-form-dialog.tsx` — consome o hook; mesmo layout/comportamento de modal.
- **Modificar:** `artifacts/signage/src/pages/campaign-detail.tsx` — peças+QR unificados; modo de edição inline; remove `CampaignFormDialog` e `editOpen`.

## Notas de validação (todas as tasks)

Não há testes de UI no `@workspace/signage`. Validar cada task com:

```bash
pnpm --filter @workspace/signage typecheck
```

**Baseline conhecido:** esse comando FALHA com erros PRÉ-EXISTENTES de Zod SOMENTE em `src/pages/admin.tsx`, `src/pages/client-detail.tsx` e `src/pages/clients.tsx`. Critério de sucesso = **nenhuma linha de erro cita os arquivos que tocamos** (`use-campaign-form.ts`, `campaign-form-dialog.tsx`, `campaign-detail.tsx`). O TypeScript usa `noUnusedLocals`: imports/variáveis não usados viram erro — limpe o que remover.

Os commits devem incluir o trailer:

```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

---

## Task 1: Criar o hook `useCampaignForm`

**Files:**
- Create: `artifacts/signage/src/components/use-campaign-form.ts`

Este hook centraliza o estado e a lógica que hoje vivem dentro de `CampaignFormDialog`. Os tipos `CampaignForm*` continuam sendo exportados por `campaign-form-dialog.tsx` (Task 2 os importará do hook); aqui definimos e exportamos os tipos para evitar dependência circular.

- [ ] **Step 1: Escrever o arquivo completo do hook**

Create `artifacts/signage/src/components/use-campaign-form.ts`:

```ts
import { useState } from "react";

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

export type UseCampaignForm = {
  name: string;
  setName: (value: string) => void;
  contractValue: string;
  setContractValue: (value: string) => void;
  startsAt: string;
  setStartsAt: (value: string) => void;
  endsAt: string;
  setEndsAt: (value: string) => void;
  selectedAdvertiser: number | null;
  setSelectedAdvertiser: (value: number | null) => void;
  allDevices: boolean;
  setAllDevices: (value: boolean) => void;
  selectedDevices: number[];
  setSelectedDevices: (value: number[]) => void;
  selectedAnnouncements: number[];
  setSelectedAnnouncements: (value: number[]) => void;
  announcementDestinations: Record<string, string>;
  setAnnouncementDestinations: (value: Record<string, string>) => void;
  publishedScanCodes: Record<string, boolean>;
  reset: (campaign?: CampaignFormCampaign | null, lockedAdvertiserId?: number) => void;
  submit: () => Promise<{ ok: boolean; error?: string }>;
};

export function useCampaignForm(): UseCampaignForm {
  const [campaignId, setCampaignId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [selectedAdvertiser, setSelectedAdvertiser] = useState<number | null>(null);
  const [allDevices, setAllDevices] = useState(true);
  const [selectedDevices, setSelectedDevices] = useState<number[]>([]);
  const [selectedAnnouncements, setSelectedAnnouncements] = useState<number[]>([]);
  const [announcementDestinations, setAnnouncementDestinations] = useState<Record<string, string>>({});
  const [publishedScanCodes, setPublishedScanCodes] = useState<Record<string, boolean>>({});

  function reset(campaign?: CampaignFormCampaign | null, lockedAdvertiserId?: number) {
    if (campaign) {
      setCampaignId(campaign.id);
      setName(campaign.name);
      setContractValue(String(campaign.contractValue ?? ""));
      setStartsAt(campaign.startsAt.slice(0, 10));
      setEndsAt(campaign.endsAt.slice(0, 10));
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
      setCampaignId(null);
      setName("");
      setContractValue("");
      setStartsAt("");
      setEndsAt("");
      setSelectedAdvertiser(lockedAdvertiserId ?? null);
      setSelectedDevices([]);
      setSelectedAnnouncements([]);
      setAnnouncementDestinations({});
      setPublishedScanCodes({});
      setAllDevices(true);
    }
  }

  async function submit(): Promise<{ ok: boolean; error?: string }> {
    const isEditing = campaignId != null;
    const response = await fetch(api(isEditing ? `/campaigns/${campaignId}` : "/campaigns"), {
      method: isEditing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        startsAt,
        endsAt,
        advertiserId: selectedAdvertiser,
        announcementIds: selectedAnnouncements,
        announcementDestinations,
        contractValue: Number(contractValue || 0),
        allDevices,
        deviceIds: selectedDevices,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      return { ok: false, error: error?.error };
    }
    return { ok: true };
  }

  return {
    name, setName,
    contractValue, setContractValue,
    startsAt, setStartsAt,
    endsAt, setEndsAt,
    selectedAdvertiser, setSelectedAdvertiser,
    allDevices, setAllDevices,
    selectedDevices, setSelectedDevices,
    selectedAnnouncements, setSelectedAnnouncements,
    announcementDestinations, setAnnouncementDestinations,
    publishedScanCodes,
    reset,
    submit,
  };
}
```

- [ ] **Step 2: Verificar o typecheck**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: nenhuma linha de erro cita `use-campaign-form.ts` (o hook ainda não é importado, mas deve compilar isolado). Os erros pré-existentes de Zod permanecem.

- [ ] **Step 3: Commit**

```bash
git add artifacts/signage/src/components/use-campaign-form.ts
git commit -m "feat(signage): extrair hook useCampaignForm

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Refatorar `CampaignFormDialog` para consumir o hook

**Files:**
- Modify: `artifacts/signage/src/components/campaign-form-dialog.tsx`

O modal deve manter EXATAMENTE o mesmo layout e comportamento. Muda só a fonte do estado: o `useState` local e o `useEffect` de sincronização saem; entram o hook e um `useEffect` que chama `reset` quando o modal abre. Os tipos `CampaignForm*` passam a ser reexportados do hook para não quebrar os imports de quem os usa.

- [ ] **Step 1: Reescrever o arquivo completo**

Replace the entire contents of `artifacts/signage/src/components/campaign-form-dialog.tsx` with:

```tsx
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  useCampaignForm,
  type CampaignFormAdvertiser,
  type CampaignFormAnnouncement,
  type CampaignFormCampaign,
  type CampaignFormDevice,
} from "@/components/use-campaign-form";

export type { CampaignFormAdvertiser, CampaignFormAnnouncement, CampaignFormCampaign, CampaignFormDevice };

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
          <div className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-medium">Publicar em todas as TVs</p><p className="text-xs text-muted-foreground">A campanha entra automaticamente na programação de toda a rede.</p></div><Switch checked={form.allDevices} onCheckedChange={form.setAllDevices} /></div>
          {!form.allDevices && <div className="space-y-2"><Label>Escolha as TVs</Label><div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">{devices.map((device) => <label key={device.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted"><input type="checkbox" checked={form.selectedDevices.includes(device.id)} onChange={(e) => form.setSelectedDevices(e.target.checked ? [...form.selectedDevices, device.id] : form.selectedDevices.filter((id) => id !== device.id))} />{device.name}<span className="text-xs text-muted-foreground">· {device.clientName}</span></label>)}</div></div>}
          <DialogFooter><Button type="submit" disabled={form.selectedAdvertiser === null || !form.selectedAnnouncements.length}>{isEditing ? "Salvar alterações" : "Publicar campanha"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verificar o typecheck**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: nenhuma linha de erro cita `campaign-form-dialog.tsx` nem `use-campaign-form.ts`. Os arquivos que importam `CampaignForm*` de `campaign-form-dialog` (ex.: `advertisers.tsx`, `advertiser-detail.tsx`, `campaign-detail.tsx`) continuam válidos porque os tipos são reexportados. Erros pré-existentes de Zod permanecem.

- [ ] **Step 3: Build para garantir que a criação em `/advertisers` continua funcionando**

Run: `pnpm --filter @workspace/signage build`
Expected: build conclui sem erros.

- [ ] **Step 4: Commit**

```bash
git add artifacts/signage/src/components/campaign-form-dialog.tsx
git commit -m "refactor(signage): CampaignFormDialog consome useCampaignForm

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Unificar peças + QR em uma linha por peça (modo visualização)

**Files:**
- Modify: `artifacts/signage/src/pages/campaign-detail.tsx`

Remover a variável `qrLinks` e o segundo `.map`. Cada peça vira uma única linha; quando tem QR publicado (`scanCode` e `destinationUrl`), o QR e as ações aparecem inline na mesma linha.

- [ ] **Step 1: Remover a variável `qrLinks`**

Em `campaign-detail.tsx`, remova a linha:

```tsx
  const qrLinks = data.announcementLinks.filter((link) => link.destinationUrl && link.scanCode);
```

- [ ] **Step 2: Substituir o corpo do card "Peças / anúncios"**

Substitua o `<CardContent className="space-y-3">...</CardContent>` do card de peças (o bloco que hoje mapeia `data.announcementLinks` como linhas simples E depois mapeia `qrLinks`) por:

```tsx
        <CardContent className="space-y-3">
          {data.announcementLinks.length === 0 ? (
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
```

- [ ] **Step 3: Verificar o typecheck**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: nenhuma linha de erro cita `campaign-detail.tsx`. Erros pré-existentes de Zod permanecem.

- [ ] **Step 4: Commit**

```bash
git add artifacts/signage/src/pages/campaign-detail.tsx
git commit -m "feat(signage): unificar peça e QR em uma linha no detalhe da campanha

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Modo de edição inline em `campaign-detail.tsx`

**Files:**
- Modify: `artifacts/signage/src/pages/campaign-detail.tsx`

Substituir o modal por um estado `editing`. Em edição, os campos viram editáveis no lugar; o cabeçalho mostra Salvar/Cancelar; o card de peças lista os anúncios com checkbox + URL. Consome o hook `useCampaignForm`.

- [ ] **Step 1: Ajustar imports**

No topo de `campaign-detail.tsx`, troque o import do `CampaignFormDialog` pelo do hook e adicione os componentes de formulário usados na edição inline. Substitua:

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { CampaignFormDialog } from "@/components/campaign-form-dialog";
```

por:

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useCampaignForm } from "@/components/use-campaign-form";
```

Adicione os ícones `Check` e `X` ao import de `lucide-react` já existente (mantendo os demais):

```tsx
import { ArrowLeft, CalendarDays, Check, DollarSign, Monitor, Pencil, Radio, Trash2, Users, X } from "lucide-react";
```

- [ ] **Step 2: Trocar o estado `editOpen` por `editing` e instanciar o hook**

Substitua:

```tsx
  const [editOpen, setEditOpen] = useState(false);
```

por:

```tsx
  const [editing, setEditing] = useState(false);
  const form = useCampaignForm();
```

- [ ] **Step 3: Substituir `openEdit` pelas ações de edição**

Substitua a função `openEdit`:

```tsx
  function openEdit() {
    loadFormData();
    setEditOpen(true);
  }
```

por:

```tsx
  function startEdit() {
    if (!data) return;
    loadFormData();
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
```

- [ ] **Step 4: Substituir os botões de ação do cabeçalho**

Substitua o bloco de ações do cabeçalho:

```tsx
        <div className="flex shrink-0 items-center gap-2">
          <Switch checked={data.isActive} onCheckedChange={toggle} aria-label="Ativar campanha" />
          <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
          <Button variant="outline" size="sm" className="text-destructive" onClick={remove}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>
        </div>
```

por:

```tsx
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
```

- [ ] **Step 5: Tornar o nome (`<h1>`) editável**

Substitua:

```tsx
          <h1 className="text-3xl font-bold tracking-tight">{data.name}</h1>
```

por:

```tsx
          {editing ? (
            <Input value={form.name} onChange={(e) => form.setName(e.target.value)} className="h-11 text-2xl font-bold" placeholder="Nome da campanha" />
          ) : (
            <h1 className="text-3xl font-bold tracking-tight">{data.name}</h1>
          )}
```

- [ ] **Step 6: Tornar o card "Detalhes" editável**

Substitua o `<CardContent>` do card "Detalhes":

```tsx
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">Anunciante</p><p>{data.company || data.advertiserName}</p></div>
          <div><p className="text-xs text-muted-foreground">Período</p><p className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{date(data.startsAt)} — {date(data.endsAt)}</p></div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">Cobertura de TVs</p>
            <p>{data.allDevices ? "Todas as TVs" : data.devices.map((d) => d.name).join(", ") || "Nenhuma TV selecionada"}</p>
          </div>
        </CardContent>
```

por:

```tsx
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
```

- [ ] **Step 7: Adicionar edição de peças no card "Peças / anúncios"**

No card de peças, envolva a renderização de visualização (feita na Task 3) num condicional de `editing`. Substitua o `<CardContent className="space-y-3">` inteiro (o bloco criado na Task 3) por:

```tsx
        <CardContent className="space-y-3">
          {editing ? (
            <>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border p-2">
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
```

- [ ] **Step 8: Remover o `<CampaignFormDialog>` do fim do componente**

Remova o bloco:

```tsx
      <CampaignFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        advertisers={advertisers}
        announcements={announcements}
        devices={devices}
        campaign={data}
        onSaved={loadCampaign}
      />
```

- [ ] **Step 9: Verificar o typecheck**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: nenhuma linha de erro cita `campaign-detail.tsx`. Confirme que não sobraram imports/variáveis não usados (ex.: se `CampaignFormDialog` foi removido, seu import também). Erros pré-existentes de Zod permanecem.

- [ ] **Step 10: Build**

Run: `pnpm --filter @workspace/signage build`
Expected: build conclui sem erros.

- [ ] **Step 11: Commit**

```bash
git add artifacts/signage/src/pages/campaign-detail.tsx
git commit -m "feat(signage): edição inline na página de detalhe da campanha

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Verificação final

**Files:** nenhum (validação).

- [ ] **Step 1: Typecheck do pacote**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: as ÚNICAS linhas de erro citam `admin.tsx`, `client-detail.tsx`, `clients.tsx` (pré-existentes de Zod). Nada cita `use-campaign-form.ts`, `campaign-form-dialog.tsx` ou `campaign-detail.tsx`.

- [ ] **Step 2: Build do pacote**

Run: `pnpm --filter @workspace/signage build`
Expected: build conclui sem erros.

- [ ] **Step 3: Conferência manual (checklist)**

Rodar o app e verificar:
- `/advertisers`: botão "Nova campanha" abre o modal e cria normalmente.
- `/campaigns/:id`: "Editar" ativa o modo inline (nome, anunciante, valor, datas, TVs e peças editáveis no lugar); "Salvar" persiste e recarrega; "Cancelar" descarta.
- Cada peça aparece em UMA linha; peças com QR mostram QR + URL + Copiar link + Baixar PNG inline; peças sem QR mostram só título e métricas.
- Desmarcar peça com QR publicado exibe o aviso de invalidação.

---

## Self-review (autor do plano)

- **Cobertura do spec:** peças+QR unificados → Task 3; modo de edição inline (cabeçalho Salvar/Cancelar, nome, detalhes, TVs, peças) → Task 4; hook compartilhado → Task 1; modal consome o hook e segue só na criação → Task 2; validação por typecheck/build → Task 5. ✔
- **Sem placeholders:** todo passo de código mostra o código completo. ✔
- **Consistência de tipos:** o hook expõe `name/setName`, `contractValue/setContractValue`, `startsAt/setStartsAt`, `endsAt/setEndsAt`, `selectedAdvertiser/setSelectedAdvertiser`, `allDevices/setAllDevices`, `selectedDevices/setSelectedDevices`, `selectedAnnouncements/setSelectedAnnouncements`, `announcementDestinations/setAnnouncementDestinations`, `publishedScanCodes`, `reset`, `submit` — usados de forma idêntica nas Tasks 2 e 4. Os tipos `CampaignForm*` são definidos no hook (Task 1) e reexportados por `campaign-form-dialog.tsx` (Task 2), preservando os imports existentes. ✔
