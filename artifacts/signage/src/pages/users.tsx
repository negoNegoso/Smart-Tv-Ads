import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface UserAccount {
  id: number;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  clientIds: number[];
  advertiserIds: number[];
}
interface NamedRow {
  id: number;
  name: string;
}

interface UserPatch {
  id: number;
  isActive: boolean;
  clientIds: number[];
  advertiserIds: number[];
}

const api = (path: string) => `${import.meta.env.BASE_URL}api${path}`;

export default function Users() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [clientIds, setClientIds] = useState<number[]>([]);
  const [advertiserIds, setAdvertiserIds] = useState<number[]>([]);
  const [editing, setEditing] = useState<UserAccount | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: async (): Promise<UserAccount[]> => {
      const res = await fetch(api('/users'));
      if (!res.ok) return [];
      return res.json();
    },
  });
  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: async (): Promise<NamedRow[]> => {
      const res = await fetch(api('/clients'));
      if (!res.ok) return [];
      return res.json();
    },
  });
  const advertisersQuery = useQuery({
    queryKey: ['advertisers'],
    queryFn: async (): Promise<NamedRow[]> => {
      const res = await fetch(api('/advertisers'));
      if (!res.ok) return [];
      return res.json();
    },
  });

  const users = usersQuery.data ?? [];
  const clients = clientsQuery.data ?? [];
  const advertisers = advertisersQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(api('/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tempPassword, clientIds, advertiserIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Não foi possível criar a conta.');
      }
    },
    onSuccess: () => {
      setEmail('');
      setTempPassword('');
      setClientIds([]);
      setAdvertiserIds([]);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'Conta criada com sucesso.' });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: UserPatch) => {
      const res = await fetch(api(`/users/${patch.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: patch.isActive,
          clientIds: patch.clientIds,
          advertiserIds: patch.advertiserIds,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Não foi possível salvar as alterações.');
      }
    },
    onSuccess: () => {
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'Conta atualizada.' });
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (u: UserAccount) => {
      const res = await fetch(api(`/users/${u.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      if (!res.ok) throw new Error('Não foi possível atualizar a conta.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  });

  const resetMutation = useMutation({
    mutationFn: async (u: UserAccount) => {
      const senha = window.prompt(`Nova senha temporária para ${u.email} (mín. 8):`);
      if (senha === null) return;
      const res = await fetch(api(`/users/${u.id}/reset-password`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempPassword: senha }),
      });
      if (!res.ok) throw new Error('Não foi possível redefinir a senha.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'Senha temporária redefinida.' });
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (u: UserAccount) => {
      if (!window.confirm(`Remover a conta ${u.email}?`)) return;
      const res = await fetch(api(`/users/${u.id}`), { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Não foi possível remover a conta.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Contas de acesso</h1>

      <Card className="p-4">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-temp-password">Senha temporária (mín. 8)</Label>
              <Input
                id="user-temp-password"
                type="text"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
          </div>
          <MultiSelect label="Clientes" options={clients} value={clientIds} onChange={setClientIds} />
          <MultiSelect
            label="Anunciantes"
            options={advertisers}
            value={advertiserIds}
            onChange={setAdvertiserIds}
          />
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Criando…' : 'Criar conta'}
          </Button>
        </form>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Ativo</th>
              <th className="px-3 py-2">Trocar senha?</th>
              <th className="px-3 py-2">Vínculos</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.isActive ? 'Sim' : 'Não'}</td>
                <td className="px-3 py-2">{u.mustChangePassword ? 'Pendente' : 'OK'}</td>
                <td className="px-3 py-2">
                  <LinkSummary label="Anunciantes" ids={u.advertiserIds} options={advertisers} />
                  <LinkSummary label="Clientes" ids={u.clientIds} options={clients} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleMutation.mutate(u)}>
                      {u.isActive ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => resetMutation.mutate(u)}>
                      Redefinir senha
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(u)}>
                      Remover
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={5}>
                  Nenhuma conta cadastrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => {
        if (!open) setEditing(null);
      }}>
        <DialogContent>
          {editing ? (
            <EditUserForm
              key={editing.id}
              user={editing}
              clients={clients}
              advertisers={advertisers}
              isPending={updateMutation.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={(patch) => updateMutation.mutate(patch)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditUserForm({
  user,
  clients,
  advertisers,
  isPending,
  onCancel,
  onSubmit,
}: {
  user: UserAccount;
  clients: NamedRow[];
  advertisers: NamedRow[];
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (patch: UserPatch) => void;
}) {
  const [isActive, setIsActive] = useState(user.isActive);
  const [clientIds, setClientIds] = useState<number[]>(user.clientIds);
  const [advertiserIds, setAdvertiserIds] = useState<number[]>(user.advertiserIds);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ id: user.id, isActive, clientIds, advertiserIds });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Editar conta</DialogTitle>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="edit-user-email">Email</Label>
        <Input id="edit-user-email" value={user.email} readOnly disabled />
      </div>

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Conta ativa
      </label>

      <MultiSelect label="Clientes" options={clients} value={clientIds} onChange={setClientIds} />
      <MultiSelect
        label="Anunciantes"
        options={advertisers}
        value={advertiserIds}
        onChange={setAdvertiserIds}
      />

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function LinkSummary({
  label,
  ids,
  options,
}: {
  label: string;
  ids: number[];
  options: NamedRow[];
}) {
  if (ids.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {label}: <span>nenhum</span>
      </p>
    );
  }
  const byId = new Map(options.map((o) => [o.id, o.name]));
  const names = ids.map((id) => byId.get(id) ?? `#${id}`);
  const shown = names.slice(0, 2).join(', ');
  const rest = names.length - 2;
  return (
    <p className="text-xs" title={names.join(', ')}>
      <span className="text-muted-foreground">{label}:</span> {shown}
      {rest > 0 ? ` +${rest}` : ''}
    </p>
  );
}

function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: NamedRow[];
  value: number[];
  onChange: (v: number[]) => void;
}) {
  return (
    <fieldset className="rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum disponível.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {options.map((o) => (
            <label key={o.id} className="inline-flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={value.includes(o.id)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))
                }
              />
              {o.name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
