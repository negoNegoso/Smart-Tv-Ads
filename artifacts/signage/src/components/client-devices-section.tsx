import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight, Clock, Loader2, MapPin, Monitor, Plus, Trash2 } from 'lucide-react';
import {
  useCreateDevice,
  useListDevices,
  getListDevicesQueryKey,
  getDevicePreview,
  getGetDevicePreviewQueryKey,
} from '@workspace/api-client-react';
import { TvPreviewGrid } from '@/components/tv-preview-grid';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { companiesQueryKey } from '@/lib/companies-api';

const newDeviceSchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório'),
  location: z.string().optional(),
});
type NewDeviceForm = z.infer<typeof newDeviceSchema>;

/** TVs do perfil de cliente de uma empresa: lista, cadastro, exclusão e prévias. */
export function ClientDevicesSection({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: devices = [], isLoading } = useListDevices(
    { clientId },
    { query: { enabled: !!clientId, queryKey: getListDevicesQueryKey({ clientId }) } },
  );

  // A contagem de TVs mora no detalhe da empresa (bloqueio de papel/exclusão).
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey({ clientId }) });
    queryClient.invalidateQueries({ queryKey: companiesQueryKey });
  };

  const form = useForm<NewDeviceForm>({
    resolver: zodResolver(newDeviceSchema),
    defaultValues: { name: '', location: '' },
  });

  const createDevice = useCreateDevice({
    mutation: {
      onSuccess: () => {
        refresh();
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
      refresh();
      toast({ title: 'TV excluída' });
    },
    onError: () => toast({ title: 'Não foi possível excluir a TV', variant: 'destructive' }),
  });

  function onSubmit(values: NewDeviceForm) {
    createDevice.mutate({ data: { clientId, name: values.name, location: values.location || undefined } });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">TVs</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" />Adicionar TV</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Adicionar TV</DialogTitle></DialogHeader>
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

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : devices.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <Monitor className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">Nenhuma TV ainda.</p>
            <p className="mt-1 text-sm text-muted-foreground/60">Adicione uma TV para começar a configurar as playlists.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {devices.map((device) => (
            <div key={device.id} className="group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm transition-all hover:border-primary/40">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Monitor className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/devices/${device.id}`}>
                  <h3 className="cursor-pointer font-semibold transition-colors hover:text-primary">{device.name}</h3>
                </Link>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                  {device.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{device.location}</span>}
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{device.deviceKey}</span>
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
                  className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  onClick={() => deleteDevice.mutate(device.id)}
                  disabled={deleteDevice.isPending}
                  aria-label="Excluir TV"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Link href={`/devices/${device.id}`}>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><ChevronRight className="h-4 w-4" /></Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Só aparece com pelo menos uma TV: sem TV não há o que prever. */}
      {devices.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-semibold">Prévias das TVs</h2>
          <TvPreviewGrid
            devices={devices}
            loadPreview={(id) => getDevicePreview(id)}
            queryKey={getGetDevicePreviewQueryKey}
            hrefFor={(id) => `/devices/${id}`}
          />
        </section>
      ) : null}
    </div>
  );
}
