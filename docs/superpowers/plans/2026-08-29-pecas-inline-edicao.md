# Peças inline no modo de edição da campanha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No modo de edição da campanha, renderizar as peças como linhas ricas inline (igual à visualização) com URL editável, botão de desvincular e um combobox com busca para adicionar peças.

**Architecture:** Reorganização de renderização em `artifacts/signage/src/pages/campaign-detail.tsx`. A ramificação `editing` do card "Peças / anúncios" passa a mapear `form.selectedAnnouncements` como linhas ricas (dados de QR/stats vêm de `data.announcementLinks`), com um subcomponente `AddPieceCombobox` (shadcn `Popover` + `Command`) para adicionar. Nenhuma mudança de backend nem no hook `use-campaign-form`.

**Tech Stack:** React 19, wouter, Tailwind, shadcn/ui (`command.tsx`, `popover.tsx` já presentes), lucide-react.

---

### Task 1: Substituir a lista de checkboxes por linhas ricas + combobox

**Files:**
- Modify: `artifacts/signage/src/pages/campaign-detail.tsx`

Sem teste automatizado (a app signage não tem harness de teste de componentes); a verificação é `typecheck` + `build` + teste manual.

- [ ] **Step 1: Adicionar imports necessários**

No topo de `campaign-detail.tsx`, adicionar `Plus` ao import do lucide-react (linha do `import { ArrowLeft, ... } from "lucide-react";`), e adicionar os imports dos componentes de combobox após os imports de UI existentes:

```tsx
import { Plus } from "lucide-react"; // adicionar Plus à lista existente do lucide-react
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
```

(Concretamente: incluir `Plus` na desestruturação existente `import { ArrowLeft, CalendarDays, Check, DollarSign, Monitor, Pencil, Radio, Trash2, Users, X } from "lucide-react";` → `... Trash2, Users, X, Plus }`. E adicionar as duas linhas de import de `popover`/`command`.)

- [ ] **Step 2: Substituir a ramificação `editing` do card "Peças / anúncios"**

Localizar, dentro do `<Card>` de "Peças / anúncios", o bloco:

```tsx
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
```

Substituir **apenas** o trecho de `{editing ? (` até logo antes de `) : data.announcementLinks.length === 0 ? (` por:

```tsx
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
```

Não alterar a ramificação de visualização (`data.announcementLinks.length === 0 ?` e a lista rica seguinte).

- [ ] **Step 3: Adicionar o subcomponente `AddPieceCombobox`**

No fim do arquivo, após a função `Metric`, adicionar:

```tsx
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
```

- [ ] **Step 4: Rodar typecheck**

Run: `pnpm --filter @workspace/signage typecheck`
Expected: os erros pré-existentes de Zod em `admin.tsx`, `client-detail.tsx`, `clients.tsx` podem aparecer, mas **nenhuma linha de erro deve referenciar `campaign-detail.tsx`**.

- [ ] **Step 5: Rodar build**

Run: `pnpm --filter @workspace/signage build`
Expected: build conclui com sucesso (exit 0).

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/src/pages/campaign-detail.tsx
git commit -m "feat(campaign-detail): peças inline no modo de edição com combobox de adicionar

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Verificação manual (após implementar)

1. `pnpm --filter @workspace/api-server dev` e `pnpm --filter @workspace/signage dev`, logar.
2. Abrir uma campanha → **Editar**. O card de peças deve mostrar linhas ricas (miniatura do QR quando publicado, título, `exibições · scans`) com input de URL inline e botão de desvincular.
3. Clicar em **Adicionar peça** → combobox abre com busca; digitar filtra por nome; selecionar adiciona a linha e some da lista do combobox.
4. Desvincular uma peça com QR publicado mostra o aviso âmbar; salvar persiste as mudanças.
