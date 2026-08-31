import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Users, Monitor, Trash2, ChevronRight, Loader2 } from 'lucide-react';
import {
  useListClients,
  useCreateClient,
  useListSegments,
  getListClientsQueryKey,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

const newClientSchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório'),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  segmentId: z.string().min(1, 'Escolha o segmento'),
});
type NewClientForm = z.infer<typeof newClientSchema>;

export default function Clients() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: clients = [], isLoading } = useListClients();
  const { data: segments = [] } = useListSegments();

  const createMutation = useCreateClient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        toast({ title: 'Cliente cadastrado' });
        setOpen(false);
        form.reset();
      },
      onError: () => toast({ title: 'Não foi possível cadastrar o cliente', variant: 'destructive' }),
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/clients/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Delete failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
      toast({ title: 'Cliente excluído' });
    },
    onError: () => toast({ title: 'Não foi possível excluir o cliente', variant: 'destructive' }),
  });

  const form = useForm<NewClientForm>({
    resolver: zodResolver(newClientSchema),
    defaultValues: { name: '', email: '', phone: '', segmentId: '' },
  });

  function onSubmit(values: NewClientForm) {
    createMutation.mutate({
      data: {
        name: values.name,
        email: values.email || undefined,
        phone: values.phone || undefined,
        segmentId: Number(values.segmentId),
      },
    });
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-1">Gerencie seus clientes e as TVs de cada um.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo cliente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo cliente</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
                <FormField
                  control={form.control}
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
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail (opcional)</FormLabel>
                      <FormControl><Input type="email" placeholder="contact@acme.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone (opcional)</FormLabel>
                      <FormControl><Input placeholder="+55 11 99999-9999" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="segmentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Segmento</FormLabel>
                      <FormControl>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={field.value}
                          onChange={field.onChange}
                        >
                          <option value="">Selecione o ramo</option>
                          {segments.map((segment) => (
                            <option key={segment.id} value={String(segment.id)}>{segment.name}</option>
                          ))}
                        </select>
                      </FormControl>
                      <FormDescription>
                        Anúncios de concorrentes do mesmo segmento não entram nas TVs deste cliente.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Cadastrar cliente
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : clients.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <Users className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">Nenhum cliente ainda.</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Cadastre seu primeiro cliente para começar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {clients.map((client) => (
            <div
              key={client.id}
              className="group flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm hover:border-primary/40 transition-all"
            >
              <div className="flex-1 min-w-0">
                <Link href={`/clients/${client.id}`}>
                  <h3 className="font-semibold text-lg hover:text-primary transition-colors cursor-pointer">
                    {client.name}
                  </h3>
                </Link>
                {(client.email || client.phone || client.segmentName) && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {[client.segmentName, client.email, client.phone].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Monitor className="h-4 w-4" />
                <span>{client.deviceCount} {client.deviceCount === 1 ? 'TV' : 'TVs'}</span>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteMutation.mutate(client.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Link href={`/clients/${client.id}`}>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {clients.length > 0 && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Resumo</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-8">
              <div>
                <p className="text-2xl font-bold">{clients.length}</p>
                <p className="text-sm text-muted-foreground">Total de clientes</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{clients.reduce((s, c) => s + c.deviceCount, 0)}</p>
                <p className="text-sm text-muted-foreground">Total de TVs</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
