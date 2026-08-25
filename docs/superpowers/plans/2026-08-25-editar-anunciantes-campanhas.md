# Editar anunciantes e campanhas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar os dados de um anunciante e todos os valores de uma campanha (nome, anúncio, valor, datas, TVs e anunciantes vinculados) para manutenção.

**Architecture:** Backend adiciona `PATCH /campaigns/:id` (edição completa, reaproveitando a validação `campaignInput` do POST) e expõe `advertiserIds`/`deviceIds` no `GET /campaigns`. Frontend adiciona um diálogo de edição na página de detalhe do anunciante e transforma o diálogo "Nova campanha" em modo criar/editar na lista de campanhas. Tudo com `fetch` cru, seguindo o padrão já existente nesses arquivos (esses endpoints não estão no OpenAPI).

**Tech Stack:** Express, Drizzle ORM, zod (backend); React, TypeScript, wouter, shadcn/ui, lucide-react (frontend).

---

## File Structure

- **Modify:** `artifacts/api-server/src/routes/advertisers.ts` — adiciona a rota `PATCH /campaigns/:id` e acrescenta `advertiserIds`/`deviceIds` ao `GET /campaigns`.
- **Modify:** `artifacts/signage/src/pages/advertiser-detail.tsx` — adiciona botão de lápis + `Dialog` para editar o anunciante.
- **Modify:** `artifacts/signage/src/pages/advertisers.tsx` — adiciona lápis por campanha e transforma o diálogo de campanha em modo criar/editar.

Não há testes automatizados no projeto; a validação é `typecheck` por pacote + verificação manual via `curl`/UI (conforme a spec).

---

## Task 1: Backend — editar campanha e expor vínculos

**Files:**
- Modify: `artifacts/api-server/src/routes/advertisers.ts`

- [ ] **Step 1: Expor `advertiserIds` e `deviceIds` no `GET /campaigns`**

No `router.get("/campaigns", ...)`, dentro do objeto `.select({ ... })`, logo após a linha
`advertiserName: advertisersTable.name,`, adicione estes dois campos:

```ts
      advertiserIds: sql<number[]>`coalesce((select array_agg(ca.advertiser_id order by ca.advertiser_id) from campaign_advertisers ca where ca.campaign_id = ${campaignsTable.id}), array[]::int[])`,
      deviceIds: sql<number[]>`coalesce((select array_agg(cd.device_id order by cd.device_id) from campaign_devices cd where cd.campaign_id = ${campaignsTable.id}), array[]::int[])`,
```

- [ ] **Step 2: Adicionar a rota `PATCH /campaigns/:id`**

Logo **após** o bloco `router.patch("/campaigns/:id/toggle", ...)` (e antes de
`router.delete("/campaigns/:id", ...)`), adicione:

```ts
router.patch("/campaigns/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const parsed = campaignInput.refine((v) => v.endsAt > v.startsAt, { message: "End date must be after start date" }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const advertiserIds = advertiserIdsFor(input);
  if (advertiserIds.length === 0) {
    res.status(400).json({ error: "Selecione pelo menos um anunciante" });
    return;
  }
  if (!input.allDevices && input.deviceIds.length === 0) {
    res.status(400).json({ error: "Select at least one TV or enable all devices" });
    return;
  }
  if ((await db.select({ id: advertisersTable.id }).from(advertisersTable).where(inArray(advertisersTable.id, advertiserIds))).length !== advertiserIds.length) {
    res.status(400).json({ error: "Um ou mais anunciantes não foram encontrados" });
    return;
  }
  await db.update(campaignsTable).set({
    advertiserId: advertiserIds[0],
    announcementId: input.announcementId,
    name: input.name,
    contractValue: input.contractValue,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    allDevices: input.allDevices,
  }).where(eq(campaignsTable.id, id));
  await db.delete(campaignAdvertisersTable).where(eq(campaignAdvertisersTable.campaignId, id));
  await db.insert(campaignAdvertisersTable).values(advertiserIds.map((advertiserId) => ({ campaignId: id, advertiserId }))).onConflictDoNothing();
  await db.delete(campaignDevicesTable).where(eq(campaignDevicesTable.campaignId, id));
  if (!input.allDevices && input.deviceIds.length) {
    await db.insert(campaignDevicesTable).values(input.deviceIds.map((deviceId) => ({ campaignId: id, deviceId }))).onConflictDoNothing();
  }
  res.json(await campaignWithStats(id));
});
```

> Todos os símbolos usados (`db`, `campaignsTable`, `campaignInput`, `advertiserIdsFor`,
> `advertiserIds`, `advertisersTable`, `inArray`, `eq`, `campaignAdvertisersTable`,
> `campaignDevicesTable`, `campaignWithStats`) já estão importados/definidos no topo do arquivo.

- [ ] **Step 3: Typecheck do backend**

Run: `pnpm -C artifacts/api-server run typecheck`
Expected: sem erros (exit 0).

- [ ] **Step 4: Verificação manual (opcional, requer ambiente rodando)**

Com `./dev.sh` no ar, editar uma campanha existente (ajuste `<ID>` e a porta da API conforme o ambiente):

```bash
curl -s -X PATCH http://localhost:21153/api/campaigns/<ID> \
  -H 'Content-Type: application/json' \
  -d '{"name":"Campanha revisada","announcementId":1,"contractValue":1500,"startsAt":"2026-01-01","endsAt":"2026-02-01","allDevices":true,"advertiserIds":[1]}'
```
Expected: JSON da campanha atualizada com `name` e `contractValue` novos e `isActive` inalterado.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/advertisers.ts
git commit -m "feat: permitir editar campanha (PATCH /campaigns/:id) e expor vínculos no GET

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Frontend — editar anunciante na página de detalhe

**Files:**
- Modify: `artifacts/signage/src/pages/advertiser-detail.tsx`

- [ ] **Step 1: Atualizar imports**

Substitua os imports do topo do arquivo por:

```tsx
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, CalendarDays, Megaphone, Radio, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
```

- [ ] **Step 2: Adicionar `id` ao tipo `Advertiser`**

No `type Advertiser = { ... }`, adicione `id: number;` como primeira propriedade:

```tsx
type Advertiser = {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  campaigns: Campaign[];
};
```

- [ ] **Step 3: Adicionar estado e handlers de edição**

Dentro de `AdvertiserDetail`, logo após a linha `const [loading, setLoading] = useState(true);`,
adicione:

```tsx
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
```

- [ ] **Step 4: Adicionar o botão de lápis no cabeçalho**

Localize o bloco do cabeçalho:

```tsx
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{data.company || data.name}</h1>
        <p className="mt-1 text-muted-foreground">{[data.company && data.name, data.email, data.phone].filter(Boolean).join(" · ")}</p>
      </div>
```

Substitua-o por (envolve o texto num flex e adiciona o botão à direita):

```tsx
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{data.company || data.name}</h1>
          <p className="mt-1 text-muted-foreground">{[data.company && data.name, data.email, data.phone].filter(Boolean).join(" · ")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
      </div>
```

- [ ] **Step 5: Adicionar o `Dialog` de edição**

Imediatamente **antes** do `</div>` que fecha o container raiz (o último `</div>` do `return`,
logo depois do `</Card>`), adicione:

```tsx
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
```

- [ ] **Step 6: Typecheck do frontend**

Run: `pnpm -C artifacts/signage run typecheck`
Expected: sem erros (exit 0).

- [ ] **Step 7: Commit**

```bash
git add artifacts/signage/src/pages/advertiser-detail.tsx
git commit -m "feat: permitir editar dados do anunciante na página de detalhe

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Frontend — editar campanha na lista

**Files:**
- Modify: `artifacts/signage/src/pages/advertisers.tsx`

- [ ] **Step 1: Adicionar o ícone `Pencil` ao import de lucide-react**

Substitua a linha de import de `lucide-react` por:

```tsx
import { Building2, CalendarDays, ChevronRight, DollarSign, Megaphone, Monitor, Pencil, Plus, Radio, Trash2, Users } from "lucide-react";
```

- [ ] **Step 2: Adicionar `advertiserIds` e `deviceIds` ao tipo `Campaign`**

No `type Campaign = { ... }`, logo após `advertiserNames?: string[];`, adicione:

```tsx
  advertiserIds?: number[];
  deviceIds?: number[];
```

- [ ] **Step 3: Adicionar estado do modo de edição**

Logo após a linha `const [campaignDialog, setCampaignDialog] = useState(false);`, adicione:

```tsx
  const [editingCampaignId, setEditingCampaignId] = useState<number | null>(null);
```

- [ ] **Step 4: Adicionar handlers para abrir o diálogo em modo criar/editar**

Logo **antes** da função `async function createCampaign(event: React.FormEvent) {`, adicione:

```tsx
  function openNewCampaign() {
    setEditingCampaignId(null);
    setCampaignForm({ name: "", announcementId: "", contractValue: "", startsAt: "", endsAt: "" });
    setSelectedAdvertisers([]);
    setSelectedDevices([]);
    setAllDevices(true);
    setCampaignDialog(true);
  }

  function openEditCampaign(campaign: Campaign) {
    setEditingCampaignId(campaign.id);
    setCampaignForm({
      name: campaign.name,
      announcementId: String(campaign.announcementId),
      contractValue: String(campaign.contractValue ?? ""),
      startsAt: campaign.startsAt.slice(0, 10),
      endsAt: campaign.endsAt.slice(0, 10),
    });
    setSelectedAdvertisers(campaign.advertiserIds ?? []);
    setSelectedDevices(campaign.deviceIds ?? []);
    setAllDevices(campaign.allDevices);
    setCampaignDialog(true);
  }
```

- [ ] **Step 5: Transformar `createCampaign` em submit que cria ou edita**

Substitua **toda** a função `createCampaign` por:

```tsx
  async function submitCampaign(event: React.FormEvent) {
    event.preventDefault();
    const isEditing = editingCampaignId !== null;
    const response = await fetch(api(isEditing ? `/campaigns/${editingCampaignId}` : "/campaigns"), {
      method: isEditing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...campaignForm,
        advertiserIds: selectedAdvertisers,
        announcementId: Number(campaignForm.announcementId),
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
    setCampaignForm({ name: "", announcementId: "", contractValue: "", startsAt: "", endsAt: "" });
    setSelectedDevices([]);
    setSelectedAdvertisers([]);
    toast({ title: isEditing ? "Campanha atualizada" : "Campanha publicada" });
    load();
  }
```

- [ ] **Step 6: Apontar o botão "Nova campanha" para `openNewCampaign`**

Localize:

```tsx
          <Button onClick={() => setCampaignDialog(true)} disabled={!advertisers.length || !announcements.length}>
```

Substitua o `onClick` por `openNewCampaign`:

```tsx
          <Button onClick={openNewCampaign} disabled={!advertisers.length || !announcements.length}>
```

- [ ] **Step 7: Adicionar o botão de lápis em cada card de campanha**

Localize o bloco de ações do card de campanha:

```tsx
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch checked={campaign.isActive} onCheckedChange={() => toggleCampaign(campaign.id)} aria-label="Ativar campanha" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteCampaign(campaign.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
```

Substitua-o por (adiciona o lápis antes da lixeira):

```tsx
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch checked={campaign.isActive} onCheckedChange={() => toggleCampaign(campaign.id)} aria-label="Ativar campanha" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openEditCampaign(campaign)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteCampaign(campaign.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
```

- [ ] **Step 8: Ajustar o `Dialog` de campanha (título, submit e reset ao fechar)**

Localize a abertura do diálogo de campanha:

```tsx
      <Dialog open={campaignDialog} onOpenChange={setCampaignDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova campanha publicitária</DialogTitle></DialogHeader>
          <form onSubmit={createCampaign} className="space-y-4">
```

Substitua por (fecha resetando o modo de edição, título dinâmico e `onSubmit={submitCampaign}`):

```tsx
      <Dialog open={campaignDialog} onOpenChange={(open) => { setCampaignDialog(open); if (!open) setEditingCampaignId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingCampaignId !== null ? "Editar campanha" : "Nova campanha publicitária"}</DialogTitle></DialogHeader>
          <form onSubmit={submitCampaign} className="space-y-4">
```

- [ ] **Step 9: Ajustar o label do botão de submit do diálogo**

Localize o rodapé do formulário de campanha:

```tsx
            <DialogFooter><Button type="submit" disabled={!selectedAdvertisers.length || !campaignForm.announcementId}>Publicar campanha</Button></DialogFooter>
```

Substitua por:

```tsx
            <DialogFooter><Button type="submit" disabled={!selectedAdvertisers.length || !campaignForm.announcementId}>{editingCampaignId !== null ? "Salvar alterações" : "Publicar campanha"}</Button></DialogFooter>
```

- [ ] **Step 10: Typecheck do frontend**

Run: `pnpm -C artifacts/signage run typecheck`
Expected: sem erros (exit 0).

- [ ] **Step 11: Verificação manual (opcional, requer ambiente rodando)**

Com `./dev.sh` no ar, na página **Anunciantes**: clicar no lápis de uma campanha, alterar valor e
datas, salvar, e confirmar que o card reflete as mudanças e a campanha continua ativa. Trocar
anunciantes/TVs e reabrir o diálogo para confirmar que os checkboxes vêm pré-marcados.

- [ ] **Step 12: Commit**

```bash
git add artifacts/signage/src/pages/advertisers.tsx
git commit -m "feat: permitir editar campanha (valor, datas, anúncio, TVs e anunciantes) na lista

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Notas de verificação final

Após as três tasks, rode os dois typechecks juntos para garantir que nada quebrou:

```bash
pnpm -C artifacts/api-server run typecheck && pnpm -C artifacts/signage run typecheck
```
Expected: ambos sem erros (exit 0).
