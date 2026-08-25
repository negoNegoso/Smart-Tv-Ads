# Editar dados do cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar nome, e-mail e telefone de um cliente na página de detalhe, via modal.

**Architecture:** Mudança exclusivamente de frontend em `artifacts/signage/src/pages/client-detail.tsx`. O backend (`PATCH /clients/:id`) e o hook `useUpdateClient` já existem. Adiciona-se um segundo formulário react-hook-form (`editForm`) e um `Dialog` "Editar cliente", disparado por um botão "Editar" no cabeçalho.

**Tech Stack:** React, TypeScript, wouter, @tanstack/react-query, react-hook-form, zod, shadcn/ui, lucide-react.

---

## File Structure

- **Modify:** `artifacts/signage/src/pages/client-detail.tsx` — única alteração. Adiciona import de `useUpdateClient`, `getListClientsQueryKey` e do ícone `Pencil`; adiciona schema `editClientSchema`, estado `editOpen`, `editForm`, mutação `updateClient`, botão "Editar" e o `Dialog` de edição.

Não há testes de UI automatizados no projeto; a validação é `typecheck` + verificação manual (conforme a spec).

---

### Task 1: Adicionar edição de cliente na página de detalhe

**Files:**
- Modify: `artifacts/signage/src/pages/client-detail.tsx`

- [ ] **Step 1: Atualizar os imports**

No topo do arquivo, adicione o ícone `Pencil` à importação existente de `lucide-react`:

```tsx
import { ArrowLeft, Plus, Monitor, Trash2, ChevronRight, Loader2, MapPin, Clock, Pencil } from 'lucide-react';
```

E adicione `useUpdateClient` e `getListClientsQueryKey` à importação de `@workspace/api-client-react`:

```tsx
import {
  useGetClient,
  useListDevices,
  useCreateDevice,
  useUpdateClient,
  getGetClientQueryKey,
  getListDevicesQueryKey,
  getListClientsQueryKey,
} from '@workspace/api-client-react';
```

- [ ] **Step 2: Adicionar o schema do formulário de edição**

Logo após o bloco `const newDeviceSchema = ...` e seu `type NewDeviceForm`, adicione:

```tsx
const editClientSchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório'),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
});
type EditClientForm = z.infer<typeof editClientSchema>;
```

- [ ] **Step 3: Adicionar estado, form e mutação de edição**

Dentro do componente `ClientDetail`, após a linha `const [open, setOpen] = useState(false);`, adicione o estado do modal de edição:

```tsx
  const [editOpen, setEditOpen] = useState(false);
```

Depois do bloco `const deleteDevice = useMutation({ ... });` (antes de `const form = useForm<NewDeviceForm>(...)`), adicione a mutação e o formulário de edição:

```tsx
  const updateClient = useUpdateClient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(clientId) });
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        toast({ title: 'Cliente atualizado' });
        setEditOpen(false);
      },
      onError: () => toast({ title: 'Não foi possível atualizar o cliente', variant: 'destructive' }),
    },
  });

  const editForm = useForm<EditClientForm>({
    resolver: zodResolver(editClientSchema),
    defaultValues: { name: '', email: '', phone: '' },
  });

  function openEdit() {
    editForm.reset({
      name: client?.name ?? '',
      email: client?.email ?? '',
      phone: client?.phone ?? '',
    });
    setEditOpen(true);
  }

  function onEditSubmit(values: EditClientForm) {
    updateClient.mutate({
      id: clientId,
      data: {
        name: values.name,
        email: values.email || undefined,
        phone: values.phone || undefined,
      },
    });
  }
```

- [ ] **Step 4: Adicionar o botão "Editar" e o Dialog no cabeçalho**

Localize o bloco do cabeçalho:

```tsx
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
          {(client.email || client.phone) && (
            <p className="text-muted-foreground mt-1">
              {[client.email, client.phone].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-lg px-3 py-2">
          <Monitor className="h-4 w-4" />
          <span>{client.deviceCount} {client.deviceCount === 1 ? 'TV' : 'TVs'}</span>
        </div>
      </div>
```

Substitua o `<div>` que contém o `<h1>` (o primeiro filho) para incluir o botão "Editar" ao lado do nome, e adicione o `Dialog` de edição. O bloco completo passa a ser:

```tsx
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={openEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          {(client.email || client.phone) && (
            <p className="text-muted-foreground mt-1">
              {[client.email, client.phone].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-lg px-3 py-2">
          <Monitor className="h-4 w-4" />
          <span>{client.deviceCount} {client.deviceCount === 1 ? 'TV' : 'TVs'}</span>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 pt-2">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl><Input placeholder="Acme Corp" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail (opcional)</FormLabel>
                    <FormControl><Input type="email" placeholder="contato@acme.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone (opcional)</FormLabel>
                    <FormControl><Input placeholder="+55 11 99999-9999" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={updateClient.isPending}>
                  {updateClient.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar alterações
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
```

> Observação: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `Input` e `Button` já estão importados no arquivo (usados pelo diálogo "Adicionar TV"). Não é necessário reimportá-los.

- [ ] **Step 5: Rodar o typecheck**

Run: `pnpm run typecheck`
Expected: PASS (sem erros de tipo). Se houver erro de import não usado (`MapPin`/`Clock` já existiam), ignore — não altere imports pré-existentes.

- [ ] **Step 6: Verificação manual**

Suba o stack local (`./dev.sh` ou o comando de dev do projeto), abra a página de um cliente (`/clients/:id`), clique no ícone de lápis ao lado do nome, altere nome/e-mail/telefone e clique em "Salvar alterações".
Expected: toast "Cliente atualizado", modal fecha, e o cabeçalho e a lista de clientes refletem os novos dados.

- [ ] **Step 7: Commit**

```bash
git add artifacts/signage/src/pages/client-detail.tsx
git commit -m "feat: permitir editar dados do cliente na página de detalhe" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-Review

- **Cobertura da spec:** botão "Editar" (Step 4), modal reaproveitando padrão do cadastro (Step 4), schema com name obrigatório e email/phone opcionais (Step 2), defaultValues preenchidos + reset ao abrir (Step 3, `openEdit`), envio via `useUpdateClient` com `{ id, data }` (Step 3), email vazio → undefined (Step 3, `onEditSubmit`), invalidação das duas query keys + toast + fechar (Step 3), erro com toast destrutivo (Step 3), estado de loading no botão (Step 4, `updateClient.isPending`). Todos cobertos.
- **Placeholders:** nenhum.
- **Consistência de tipos:** `EditClientForm` definido no Step 2 e usado no Step 3/4; `useUpdateClient` recebe `{ id: number; data: ClientUpdate }` conforme a assinatura gerada; `editForm`/`editOpen`/`openEdit`/`onEditSubmit` nomeados de forma única para não colidir com `form`/`open` existentes.
