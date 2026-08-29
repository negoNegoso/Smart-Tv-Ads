import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { ArrowLeft, Monitor, MapPin, Copy, Check, GripVertical, Trash2, Plus, Power, Loader2, Image as ImageIcon } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useGetDevice,
  useGetDevicePlaylist,
  useListAnnouncements,
  useAddToDevicePlaylist,
  useRemoveFromDevicePlaylist,
  useReorderDevicePlaylist,
  useTogglePlaylistItem,
  useGetDeviceAnalytics,
  getGetDeviceQueryKey,
  getGetDevicePlaylistQueryKey,
  getGetDeviceAnalyticsQueryKey,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { mediaUrl } from '@/lib/media-url';

async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy fallback (e.g. permission denied)
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

type PlaylistItem = {
  id: number;
  deviceId: number;
  announcementId: number;
  displayOrder: number;
  isActive: boolean;
  title: string;
  imageUrl: string;
  duration: number;
};

function SortablePlaylistItem({
  item,
  onToggle,
  onRemove,
}: {
  item: PlaylistItem;
  onToggle: (announcementId: number) => void;
  onRemove: (announcementId: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.announcementId });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : 0 };
  const imgUrl = mediaUrl(item.imageUrl);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-all ${
        isDragging ? 'shadow-lg ring-2 ring-primary' : 'hover:border-primary/40'
      } ${!item.isActive ? 'opacity-50' : ''}`}
    >
      <button type="button" className="cursor-grab text-muted-foreground/40 hover:text-foreground px-1" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="h-12 w-20 shrink-0 overflow-hidden rounded-md bg-muted border flex items-center justify-center">
        {item.imageUrl ? (
          <img src={imgUrl} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate text-sm">{item.title}</p>
        <p className="text-xs text-muted-foreground font-mono">{item.duration}s</p>
      </div>
      <div className="flex items-center gap-1 ml-2">
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 ${item.isActive ? 'text-primary' : 'text-muted-foreground/40'} hover:text-primary`}
          onClick={() => onToggle(item.announcementId)}
        >
          <Power className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onRemove(item.announcementId)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function PlaylistTab({ deviceId }: { deviceId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);

  const { data: playlist = [], isLoading } = useGetDevicePlaylist(deviceId, {
    query: { enabled: !!deviceId, queryKey: getGetDevicePlaylistQueryKey(deviceId) },
  });
  const { data: allAnnouncements = [] } = useListAnnouncements();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const addMutation = useAddToDevicePlaylist({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDevicePlaylistQueryKey(deviceId) });
        setAddOpen(false);
      },
      onError: () => toast({ title: 'Já está na playlist ou falhou', variant: 'destructive' }),
    },
  });

  const removeMutation = useRemoveFromDevicePlaylist({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetDevicePlaylistQueryKey(deviceId) }),
      onError: () => toast({ title: 'Não foi possível remover', variant: 'destructive' }),
    },
  });

  const reorderMutation = useReorderDevicePlaylist({
    mutation: {
      onError: () => {
        queryClient.invalidateQueries({ queryKey: getGetDevicePlaylistQueryKey(deviceId) });
        toast({ title: 'Não foi possível reordenar', variant: 'destructive' });
      },
    },
  });

  const toggleMutation = useTogglePlaylistItem({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetDevicePlaylistQueryKey(deviceId) }),
      onError: () => toast({ title: 'Não foi possível alterar o status', variant: 'destructive' }),
    },
  });

  const [localPlaylist, setLocalPlaylist] = useState<typeof playlist>([]);
  // Sync server state to local when it changes
  if (playlist.length !== localPlaylist.length || playlist.some((p, i) => p.id !== localPlaylist[i]?.id)) {
    setLocalPlaylist([...playlist]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localPlaylist.findIndex((p) => p.announcementId === active.id);
    const newIndex = localPlaylist.findIndex((p) => p.announcementId === over.id);
    const reordered = arrayMove(localPlaylist, oldIndex, newIndex);
    setLocalPlaylist(reordered);
    reorderMutation.mutate({
      id: deviceId,
      data: { ids: reordered.map((p) => p.announcementId) },
    });
  }

  const playlistIds = new Set(playlist.map((p) => p.announcementId));
  const available = allAnnouncements.filter((a) => !playlistIds.has(a.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{playlist.length} itens na playlist</p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar anúncio
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar à playlist</DialogTitle>
            </DialogHeader>
            {available.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">Todos os anúncios já estão na playlist.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {available.map((a) => {
                  const imgUrl = mediaUrl(a.imageUrl);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className="w-full flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors text-left"
                      onClick={() => addMutation.mutate({ id: deviceId, data: { announcementId: a.id } })}
                    >
                      <div className="h-10 w-16 shrink-0 rounded-md bg-muted overflow-hidden border flex items-center justify-center">
                        {a.imageUrl ? (
                          <img src={imgUrl} alt={a.title} className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{a.title}</p>
                        <p className="text-xs text-muted-foreground font-mono">{a.duration}s</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : localPlaylist.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm border rounded-xl bg-muted/20">
          Nenhum anúncio na playlist. Adicione um acima.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localPlaylist.map((p) => p.announcementId)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {localPlaylist.map((item) => (
                <SortablePlaylistItem
                  key={item.id}
                  item={item}
                  onToggle={(announcementId) => toggleMutation.mutate({ id: deviceId, announcementId })}
                  onRemove={(announcementId) => removeMutation.mutate({ deviceId, announcementId })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function AnalyticsTab({ deviceId }: { deviceId: number }) {
  const { data, isLoading } = useGetDeviceAnalytics(deviceId, {
    query: { enabled: !!deviceId, queryKey: getGetDeviceAnalyticsQueryKey(deviceId) },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Total de exibições</p>
            {isLoading ? <Skeleton className="h-8 w-20 mt-1" /> : (
              <p className="text-2xl font-bold mt-1">{data?.totalPlays ?? 0}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Tempo total de exibição</p>
            {isLoading ? <Skeleton className="h-8 w-20 mt-1" /> : (
              <p className="text-2xl font-bold mt-1">{formatDuration(data?.totalDuration ?? 0)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : !data?.byAnnouncement?.length ? (
        <p className="text-sm text-muted-foreground text-center py-6 border rounded-xl bg-muted/20">Nenhuma exibição registrada ainda.</p>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Por anúncio</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 font-medium">Anúncio</th>
                  <th className="text-right py-2 font-medium">Exibições</th>
                  <th className="text-right py-2 font-medium">Tempo</th>
                </tr>
              </thead>
              <tbody>
                {data.byAnnouncement.map((row) => (
                  <tr key={row.announcementId} className="border-b last:border-0">
                    <td className="py-2 font-medium">{row.title}</td>
                    <td className="py-2 text-right tabular-nums">{row.plays}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{formatDuration(row.totalDuration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function DeviceDetail() {
  const [, params] = useRoute('/devices/:id');
  const deviceId = params ? parseInt(params.id, 10) : 0;
  const { toast } = useToast();
  const [tab, setTab] = useState<'playlist' | 'analytics'>('playlist');
  const [copied, setCopied] = useState(false);

  const { data: device, isLoading } = useGetDevice(deviceId, {
    query: { enabled: !!deviceId, queryKey: getGetDeviceQueryKey(deviceId) },
  });

  function copyUrl() {
    if (!device) return;
    const url = `${window.location.origin}${import.meta.env.BASE_URL}tv.html?key=${device.deviceKey}`;
    copyToClipboard(url).then((ok) => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        toast({ title: 'Não foi possível copiar', variant: 'destructive' });
      }
    });
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!device) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl text-center">
        <p className="text-muted-foreground">Dispositivo não encontrado.</p>
        <Link href="/clients"><Button variant="link" className="mt-2">Voltar para clientes</Button></Link>
      </div>
    );
  }

  const displayUrl = `${window.location.origin}${import.meta.env.BASE_URL}tv.html?key=${device.deviceKey}`;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Link href={`/clients/${device.clientId}`}>
        <Button variant="ghost" size="sm" className="mb-6 text-muted-foreground -ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          {device.clientName}
        </Button>
      </Link>

      <div className="flex items-start gap-4 mb-6">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Monitor className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{device.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
            {device.location && (
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{device.location}</span>
            )}
            <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{device.deviceKey}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 mb-6">
        <span className="text-xs text-muted-foreground font-medium shrink-0">URL da TV:</span>
        <code className="text-xs flex-1 truncate font-mono">{displayUrl}</code>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copyUrl}>
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <div className="flex border-b mb-6">
        {(['playlist', 'analytics'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'playlist' ? 'Playlist' : 'Análises'}
          </button>
        ))}
      </div>

      {tab === 'playlist' ? <PlaylistTab deviceId={deviceId} /> : <AnalyticsTab deviceId={deviceId} />}
    </div>
  );
}
