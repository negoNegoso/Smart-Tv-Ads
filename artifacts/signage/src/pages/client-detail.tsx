import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Plus, Monitor, Trash2, ChevronRight, Loader2, MapPin, Clock } from 'lucide-react';
import {
  useGetClient,
  useListDevices,
  useCreateDevice,
  getGetClientQueryKey,
  getListDevicesQueryKey,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

const newDeviceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  location: z.string().optional(),
});
type NewDeviceForm = z.infer<typeof newDeviceSchema>;

export default function ClientDetail() {
  const [, params] = useRoute('/clients/:id');
  const clientId = params ? parseInt(params.id, 10) : 0;

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: client, isLoading: clientLoading } = useGetClient(clientId, {
    query: { enabled: !!clientId, queryKey: getGetClientQueryKey(clientId) },
  });

  const { data: devices = [], isLoading: devicesLoading } = useListDevices(
    { clientId },
    { query: { enabled: !!clientId, queryKey: getListDevicesQueryKey({ clientId }) } }
  );

  const createDevice = useCreateDevice({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey({ clientId }) });
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(clientId) });
        toast({ title: 'Device created' });
        setOpen(false);
        form.reset();
      },
      onError: () => toast({ title: 'Failed to create device', variant: 'destructive' }),
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
      toast({ title: 'Device deleted' });
    },
    onError: () => toast({ title: 'Failed to delete device', variant: 'destructive' }),
  });

  const form = useForm<NewDeviceForm>({
    resolver: zodResolver(newDeviceSchema),
    defaultValues: { name: '', location: '' },
  });

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
        <p className="text-muted-foreground">Client not found.</p>
        <Link href="/clients"><Button variant="link" className="mt-2">Back to clients</Button></Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link href="/clients">
        <Button variant="ghost" size="sm" className="mb-6 text-muted-foreground -ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Clients
        </Button>
      </Link>

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
          <span>{client.deviceCount} {client.deviceCount === 1 ? 'device' : 'devices'}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Devices</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Device
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Device</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl><Input placeholder="Reception TV" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location (optional)</FormLabel>
                      <FormControl><Input placeholder="Main entrance" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createDevice.isPending}>
                    {createDevice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Device
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
            <p className="text-muted-foreground font-medium">No devices yet.</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Add a device to start configuring playlists.</p>
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
                      Last seen {new Date(device.lastSeenAt).toLocaleDateString()}
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
