import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Plus, Monitor, Trash2, ChevronRight, Loader2, MapPin, Clock, Pencil } from 'lucide-react';
import {
  useGetClient,
  useListDevices,
  useCreateDevice,
  useUpdateClient,
  useListSegments,
  getGetClientQueryKey,
  getListDevicesQueryKey,
  getListClientsQueryKey,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

const newDeviceSchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório'),
  location: z.string().optional(),
});
type NewDeviceForm = z.infer<typeof newDeviceSchema>;

const editClientSchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório'),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  segmentId: z.string().optional(),
});
type EditClientForm = z.infer<typeof editClientSchema>;

export default function ClientDetail() {
  const [, params] = useRoute('/clients/:id');
  const clientId = params ? parseInt(params.id, 10) : 0;

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: client, isLoading: clientLoading } = useGetClient(clientId, {
    query: { enabled: !!clientId, queryKey: getGetClientQueryKey(clientId) },
  });

  const { data: segments = [] } = useListSegments();

  const { data: devices = [], isLoading: devicesLoading } = useListDevices(
    { clientId },
    { query: { enabled: !!clientId, queryKey: getListDevicesQueryKey({ clientId }) } }
  );

  const createDevice = useCreateDevice({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey({ clientId }) });
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(clientId) });
        toast({ title: 'TV cadastrada' });
        setOpen(false);
        form.reset();
      },
      onError: () => toast({ title: 'Não foi possível cadastrar a TV', variant: 'destructive' }),
    },
  });

  const deleteDevice = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/devices/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Delete failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey({ clientId }) });
      queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(clientId) });
      toast({ title: 'TV excluída' });
    },
    onError: () => toast({ title: 'Não foi possível excluir a TV', variant: 'destructive' }),
  });

  const form = useForm<NewDeviceForm>({
    resolver: zodResolver(newDeviceSchema),
    defaultValues: { name: '', location: '' },
  });

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
    defaultValues: { name: '', email: '', phone: '', segmentId: '' },
  });

  function openEdit() {
    editForm.reset({
      name: client?.name ?? '',
      email: client?.email ?? '',
      phone: client?.phone ?? '',
      segmentId: client?.segmentId ? String(client.segmentId) : '',
    });
    setEditOpen(true);
  }

  function onEditSubmit(values: EditClientForm) {
    updateClient.mutate({
      id: clientId,
      data: {
        name: values.name,
        email: values.email || null,
        phone: values.phone || null,
        segmentId: values.segmentId ? Number(values.segmentId) : null,
      },
    });
  }

  function onSubmit(values: NewDeviceForm) {
    createDevice.mutate({
      data: { clientId, name: values.name, location: values.location || undefined },
    });
  }

  if (clientLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl text-center">
        <p className="text-muted-foreground">Cliente não encontrado.</p>
        <Link href="/clients"><Button variant="link" className="mt-2">Voltar para clientes</Button></Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link href="/clients">
        <Button variant="ghost" size="sm" className="mb-6 text-muted-foreground -ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Clientes
        </Button>
      </Link>

      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={openEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          {(client.email || client.phone || client.segmentName) && (
            <p className="text-muted-foreground mt-1">
              {[client.segmentName, client.email, client.phone].filter(Boolean).join(' · ')}
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
              <FormField
                control={editForm.control}
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
                        <option value="">Sem segmento (aceita qualquer anúncio)</option>
                        {segments.map((segment) => (
                          <option key={segment.id} value={String(segment.id)}>{segment.name}</option>
                        ))}
                      </select>
                    </FormControl>
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

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">TVs</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar TV
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar TV</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome</FormLabel>
                      <FormControl><Input placeholder="TV da recepção" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Local (opcional)</FormLabel>
                      <FormControl><Input placeholder="Entrada principal" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createDevice.isPending}>
                    {createDevice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Adicionar TV
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {devicesLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : devices.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Monitor className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Nenhuma TV ainda.</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Adicione uma TV para começar a configurar as playlists.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {devices.map((device) => (
            <div
              key={device.id}
              className="group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm hover:border-primary/40 transition-all"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Monitor className="h-5 w-5 text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                <Link href={`/devices/${device.id}`}>
                  <h3 className="font-semibold hover:text-primary transition-colors cursor-pointer">{device.name}</h3>
                </Link>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  {device.location && (
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{device.location}</span>
                  )}
                  <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{device.deviceKey}</span>
                  {device.lastSeenAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Visto por último em {new Date(device.lastSeenAt).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteDevice.mutate(device.id)}
                  disabled={deleteDevice.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Link href={`/devices/${device.id}`}>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
