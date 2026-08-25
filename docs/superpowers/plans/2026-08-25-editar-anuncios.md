# Editar anúncios existentes — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar título, duração e substituir a imagem de um anúncio existente na página "Anúncios".

**Architecture:** Estender o endpoint `PATCH /announcements/:id` para aceitar `multipart/form-data` (espelhando o `POST` de criação, com `multer`), persistindo uma nova imagem quando enviada e apagando a antiga. Na UI, adicionar um botão "Editar" em cada linha que abre um diálogo pré-preenchido; o envio usa `fetch` manual com `FormData`, seguindo o padrão já existente do upload.

**Tech Stack:** Express + multer + Drizzle (backend), OpenAPI + orval (client gerado), React + react-hook-form + zod + TanStack Query + shadcn/ui (frontend), pnpm workspace, TypeScript.

---

## Estrutura de arquivos

- **Modificar** `artifacts/api-server/src/routes/announcements.ts` — handler `PATCH /announcements/:id` passa a usar `multer.single("image")`, lê campos do form, persiste nova imagem e remove a antiga. Extrair a limpeza de arquivo local para um helper reutilizável.
- **Modificar** `lib/api-spec/openapi.yaml` — `requestBody` do `patch /announcements/{id}` muda de `application/json` para `multipart/form-data` (espelha o `post`).
- **Gerado (não editar à mão)** `lib/api-zod/src/generated/api.ts` e `lib/api-client-react/src/generated/api.ts` — atualizados via `pnpm --filter @workspace/api-spec run codegen`.
- **Modificar** `artifacts/signage/src/pages/admin.tsx` — botão "Editar" em `SortableAnnouncementRow`, estado de edição, diálogo de edição com imagem opcional e preview, submit via `fetch` `PATCH`.

**Nota sobre testes:** o repositório não possui suíte de testes automatizados para estes módulos. O gate automatizado é `pnpm run typecheck` (e `build`). A verificação funcional é um smoke test manual opcional via `./dev.sh` + `curl` (requer Docker/Postgres) e checagem visual da UI.

---

## Task 1: Backend — PATCH multipart com substituição de imagem

**Files:**
- Modify: `artifacts/api-server/src/routes/announcements.ts`

Contexto atual relevante deste arquivo:
- Já existe `const upload = multer({...})` e `async function persistImage(file)`.
- O handler `DELETE /announcements/:id` remove o arquivo local assim:

```ts
  if (row.imageUrl) {
    const filename = row.imageUrl.split("/").pop();
    if (filename) {
      const filePath = path.join(uploadsDir, filename);
      fs.unlink(filePath, () => {});
    }
  }
```

- O handler `PATCH /announcements/:id` atual é:

```ts
router.patch("/announcements/:id", async (req, res): Promise<void> => {
  const params = UpdateAnnouncementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAnnouncementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(announcementsTable)
    .set(parsed.data)
    .where(eq(announcementsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }
  res.json(UpdateAnnouncementResponse.parse(row));
});
```

- [ ] **Step 1: Extrair helper de limpeza de arquivo local**

Logo após a função `persistImage` (perto do topo, após a definição de `objectStorage`/`persistImage`), adicionar:

```ts
function deleteLocalImage(imageUrl: string | null | undefined): void {
  if (!imageUrl || !imageUrl.startsWith("/api/uploads/")) return;
  const filename = imageUrl.split("/").pop();
  if (!filename) return;
  fs.unlink(path.join(uploadsDir, filename), () => {});
}
```

- [ ] **Step 2: Usar o helper no handler DELETE**

No handler `DELETE /announcements/:id`, substituir o bloco de limpeza inline:

```ts
  // Delete image file from disk
  if (row.imageUrl) {
    const filename = row.imageUrl.split("/").pop();
    if (filename) {
      const filePath = path.join(uploadsDir, filename);
      fs.unlink(filePath, () => {});
    }
  }
  res.sendStatus(204);
```

por:

```ts
  // Delete image file from disk
  deleteLocalImage(row.imageUrl);
  res.sendStatus(204);
```

- [ ] **Step 3: Reescrever o handler PATCH para multipart + troca de imagem**

Substituir o handler `router.patch("/announcements/:id", ...)` inteiro por:

```ts
router.patch(
  "/announcements/:id",
  upload.single("image"),
  async (req, res): Promise<void> => {
    const params = UpdateAnnouncementParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    // FormData envia todos os campos como string — coage duration antes do Zod
    const body: Record<string, unknown> = {};
    if (req.body.title !== undefined) body.title = req.body.title;
    if (req.body.duration !== undefined && req.body.duration !== "") {
      body.duration = Number(req.body.duration);
    }
    const parsed = UpdateAnnouncementBody.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(announcementsTable)
      .where(eq(announcementsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Announcement not found" });
      return;
    }

    const updates: Record<string, unknown> = { ...parsed.data };

    if (req.file) {
      let imageUrl: string;
      try {
        imageUrl = await persistImage(req.file);
      } catch (error) {
        res.status(502).json({ error: "Could not persist image in object storage" });
        return;
      }
      updates.imageUrl = imageUrl;
    }

    if (Object.keys(updates).length === 0) {
      res.json(UpdateAnnouncementResponse.parse(existing));
      return;
    }

    const [row] = await db
      .update(announcementsTable)
      .set(updates)
      .where(eq(announcementsTable.id, params.data.id))
      .returning();

    if (req.file) {
      deleteLocalImage(existing.imageUrl);
    }

    res.json(UpdateAnnouncementResponse.parse(row));
  }
);
```

- [ ] **Step 4: Type-check do api-server**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: PASS (sem erros de tipo). Se o script não existir, rodar `pnpm run typecheck` na raiz.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/announcements.ts
git commit -m "feat: aceitar troca de imagem ao editar anúncio (PATCH multipart)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: OpenAPI — patch como multipart e regeneração do client

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Regenera (automático): `lib/api-zod/src/generated/api.ts`, `lib/api-client-react/src/generated/api.ts`

O bloco atual do `patch` em `/announcements/{id}` é:

```yaml
    patch:
      operationId: updateAnnouncement
      tags: [announcements]
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/AnnouncementUpdate"
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Announcement"
        "404":
          description: Not found
```

- [ ] **Step 1: Trocar o media type do requestBody para multipart/form-data**

Substituir apenas as linhas do `requestBody` acima por:

```yaml
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              $ref: "#/components/schemas/AnnouncementUpdate"
```

(Espelha o `post /announcements`, que também usa `multipart/form-data`. O campo binário `image` não é modelado no schema — mesma convenção já usada pelo `AnnouncementInput` da criação; ele é lido diretamente pelo backend via `req.file`.)

- [ ] **Step 2: Regenerar o client e rodar o typecheck das libs**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: orval regenera os arquivos e `typecheck:libs` (tsc --build) passa sem erros.

- [ ] **Step 3: Conferir o diff gerado**

Run: `git --no-pager diff --stat lib/api-zod lib/api-client-react`
Expected: mudanças apenas em `generated/api.ts`. A função gerada `updateAnnouncement` deve passar a montar `FormData` (em vez de `JSON.stringify`); `UpdateAnnouncementBody` (zod) permanece com `title`/`isActive`/`displayOrder`/`duration` opcionais. Nenhum uso de `useUpdateAnnouncement` existe em `artifacts/`, então nada quebra.

- [ ] **Step 4: Type-check completo do workspace**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated/api.ts lib/api-client-react/src/generated/api.ts
git commit -m "chore: PATCH de anúncio como multipart no OpenAPI e regenerar client

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: UI — diálogo de edição de anúncio

**Files:**
- Modify: `artifacts/signage/src/pages/admin.tsx`

Contexto: `admin.tsx` já importa `useState`, `z`, `useForm`, `zodResolver`, componentes `Dialog*`, `Form*`, `Input`, `Label`, `Button`, `useToast`, `mediaUrl`, as query keys (`getListAnnouncementsQueryKey`, `getGetAnnouncementStatsQueryKey`, `getListActiveAnnouncementsQueryKey`) e o tipo `Announcement`. Já existe o padrão `onUpload` que faz `fetch` `POST` com `FormData`.

- [ ] **Step 1: Importar o ícone de lápis**

Na linha de import de `lucide-react` (`import { GripVertical, Plus, Trash2, Image as ImageIcon, Loader2 } from 'lucide-react';`), adicionar `Pencil`:

```ts
import { GripVertical, Plus, Trash2, Image as ImageIcon, Loader2, Pencil } from 'lucide-react';
```

- [ ] **Step 2: Adicionar o schema de edição**

Logo após a definição de `uploadSchema`/`UploadFormValues`, adicionar:

```ts
const editSchema = z.object({
  title: z.string().min(1, 'O título é obrigatório'),
  duration: z.coerce.number().min(1, 'Deve ser no mínimo 1 segundo').default(10),
  image: z
    .any()
    .optional()
    .refine(
      (val) => val == null || !(val instanceof FileList) || val.length === 0 || val[0] instanceof File,
      'Arquivo de imagem inválido'
    ),
});

type EditFormValues = z.infer<typeof editSchema>;
```

- [ ] **Step 3: Adicionar botão "Editar" em `SortableAnnouncementRow`**

Na assinatura de props do componente `SortableAnnouncementRow`, adicionar `onEdit`:

```ts
function SortableAnnouncementRow({
  item,
  onToggle,
  onDelete,
  onEdit,
}: {
  item: Announcement;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onEdit: (item: Announcement) => void;
}) {
```

Dentro do `div` de ações (o bloco `<div className="flex items-center gap-6 ml-4">`), imediatamente antes do `Button` de excluir (o que tem `Trash2`), inserir:

```tsx
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-9 w-9"
          onClick={() => onEdit(item)}
        >
          <Pencil className="h-4 w-4" />
          <span className="sr-only">Editar</span>
        </Button>
```

- [ ] **Step 4: Adicionar estado e formulário de edição no componente `Admin`**

No corpo do componente `Admin`, junto aos outros `useState` (perto de `const [isUploadOpen, setIsUploadOpen] = useState(false);`), adicionar:

```ts
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
```

E logo após a definição de `const form = useForm<UploadFormValues>({...})`, adicionar um segundo formulário:

```ts
  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { title: '', duration: 10 },
  });
```

- [ ] **Step 5: Adicionar o handler que abre o diálogo pré-preenchido**

Após a função `onUpload`, adicionar:

```ts
  function openEdit(item: Announcement) {
    setEditing(item);
    editForm.reset({ title: item.title, duration: item.duration });
  }

  async function onEditSubmit(values: EditFormValues) {
    if (!editing) return;
    try {
      setIsSaving(true);
      const formData = new FormData();
      formData.append('title', values.title);
      formData.append('duration', String(values.duration));
      if (values.image instanceof FileList && values.image.length > 0) {
        formData.append('image', values.image[0]);
      }

      const res = await fetch(`${import.meta.env.BASE_URL}api/announcements/${editing.id}`, {
        method: 'PATCH',
        body: formData,
      });

      if (!res.ok) throw new Error('Update failed');

      toast({ title: 'Anúncio atualizado' });
      setEditing(null);
      editForm.reset();

      queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAnnouncementStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListActiveAnnouncementsQueryKey() });
    } catch (error) {
      toast({ title: 'Falha ao atualizar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }
```

- [ ] **Step 6: Passar `onEdit` para cada linha na lista**

No `.map` que renderiza `SortableAnnouncementRow` (dentro do `SortableContext`), adicionar a prop `onEdit`:

```tsx
                {items.map((item) => (
                  <SortableAnnouncementRow
                    key={item.id}
                    item={item}
                    onToggle={(id) => toggleMutation.mutate({ id })}
                    onDelete={(id) => deleteMutation.mutate({ id })}
                    onEdit={openEdit}
                  />
                ))}
```

- [ ] **Step 7: Adicionar o diálogo de edição**

Imediatamente antes do fechamento do `div` raiz do return (antes da última linha `</div>` que fecha `container mx-auto p-6 ...`), adicionar o diálogo controlado por `editing`:

```tsx
      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) { setEditing(null); editForm.reset(); } }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar anúncio</DialogTitle>
            <DialogDescription>
              Atualize o título, a duração ou substitua a imagem.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
              <div className="h-14 w-20 shrink-0 overflow-hidden rounded bg-muted flex items-center justify-center border">
                {editing.imageUrl ? (
                  <img src={mediaUrl(editing.imageUrl)} alt={editing.title} className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                )}
              </div>
              <span className="text-sm text-muted-foreground">Imagem atual</span>
            </div>
          )}

          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-6 mt-4">
              <FormField
                control={editForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: Promoção de inverno" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duração (segundos)</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="image"
                render={({ field: { value, onChange, ...fieldProps } }) => (
                  <FormItem>
                    <FormLabel>Substituir imagem (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept="image/*"
                        className="cursor-pointer file:cursor-pointer file:bg-primary/10 file:text-primary file:border-0 file:rounded file:px-3 file:py-1 file:mr-4 file:font-medium hover:file:bg-primary/20 transition-colors"
                        onChange={(event) => onChange(event.target.files)}
                        {...fieldProps}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="pt-4">
                <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSaving ? 'Salvando...' : 'Salvar alterações'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 8: Type-check do frontend**

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: PASS. Se o script não existir, rodar `pnpm run typecheck` na raiz.

- [ ] **Step 9: Smoke test manual (opcional — requer Docker)**

Run: `./dev.sh` e abrir `http://localhost:21153/admin`.
Expected: cada anúncio tem um botão de lápis. Clicar abre o diálogo pré-preenchido com título e duração; a "Imagem atual" aparece. Salvar só com título/duração alterados atualiza sem trocar a imagem; escolher um arquivo novo substitui a imagem (a antiga some da rotação em `/display`). Encerrar com `Ctrl+C` e `./dev.sh --stop`.

- [ ] **Step 10: Commit**

```bash
git add artifacts/signage/src/pages/admin.tsx
git commit -m "feat: permitir editar anúncio (título, duração e imagem) na Biblioteca de Mídia

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Verificação final

- [ ] **Step 1: Build completo do workspace**

Run: `pnpm run build`
Expected: PASS (typecheck + build de todos os pacotes com `build`).
