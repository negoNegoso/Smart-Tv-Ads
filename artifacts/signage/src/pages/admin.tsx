import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
import { GripVertical, Plus, Trash2, Image as ImageIcon, Loader2, Pencil } from 'lucide-react';

import {
  useListAnnouncements,
  useGetAnnouncementStats,
  useReorderAnnouncements,
  useToggleAnnouncement,
  useDeleteAnnouncement,
  getListAnnouncementsQueryKey,
  getGetAnnouncementStatsQueryKey,
  getListActiveAnnouncementsQueryKey,
  Announcement,
} from '@workspace/api-client-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { mediaUrl } from '@/lib/media-url';
import { parseYouTubeUrl } from '@workspace/db/youtube';

const uploadSchema = z
  .object({
    title: z.string().min(1, 'O título é obrigatório'),
    displayText: z.string().default(''),
    showText: z.boolean().default(false),
    duration: z.coerce.number().min(1, 'Deve ser no mínimo 1 segundo').default(10),
    mediaKind: z.enum(['image', 'youtube_video', 'youtube_playlist']).default('image'),
    youtubeUrl: z.string().default(''),
    playbackMode: z.enum(['natural', 'capped']).default('capped'),
    audioMode: z.enum(['muted', 'sound']).default('muted'),
    image: z.any().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mediaKind === 'image') {
      if (!(v.image instanceof FileList) || v.image.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['image'], message: 'Selecione uma imagem' });
      }
    } else {
      const ref = parseYouTubeUrl(v.youtubeUrl);
      if (!ref || ref.kind !== v.mediaKind) {
        ctx.addIssue({ code: 'custom', path: ['youtubeUrl'], message: 'Link do YouTube inválido para o tipo' });
      }
    }
  });

type UploadFormValues = z.infer<typeof uploadSchema>;

const editSchema = z
  .object({
    title: z.string().min(1, 'O título é obrigatório'),
    displayText: z.string().default(''),
    showText: z.boolean().default(false),
    duration: z.coerce.number().min(1, 'Deve ser no mínimo 1 segundo').default(10),
    mediaKind: z.enum(['image', 'youtube_video', 'youtube_playlist']).default('image'),
    youtubeUrl: z.string().default(''),
    playbackMode: z.enum(['natural', 'capped']).default('capped'),
    audioMode: z.enum(['muted', 'sound']).default('muted'),
    image: z.any().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mediaKind !== 'image') {
      const ref = parseYouTubeUrl(v.youtubeUrl);
      if (!ref || ref.kind !== v.mediaKind) {
        ctx.addIssue({ code: 'custom', path: ['youtubeUrl'], message: 'Link do YouTube inválido para o tipo' });
      }
    }
  });

type EditFormValues = z.infer<typeof editSchema>;

const BYTES_PER_MB = 1024 * 1024;
const MAX_FILE_SIZE = 20 * BYTES_PER_MB; // 20MB
const MAX_DIMENSION = 3840; // 4K resolution max to avoid crashes

function validateImageFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (file.size > MAX_FILE_SIZE) {
      return resolve(`A imagem deve ter no máximo ${MAX_FILE_SIZE / BYTES_PER_MB}MB.`);
    }
    
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      if (img.width > MAX_DIMENSION || img.height > MAX_DIMENSION) {
        return resolve(`A imagem é muito grande (${img.width}x${img.height}). O tamanho máximo suportado é ${MAX_DIMENSION}px na maior dimensão para evitar travamentos nas TVs.`);
      }
      
      resolve(null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("Não foi possível ler as dimensões da imagem. O arquivo pode ser inválido ou corrompido.");
    };
    img.src = url;
  });
}

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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
  };

  const posterSrc = item.imageUrl
    ? mediaUrl(item.imageUrl)
    : item.youtubeId
      ? `https://img.youtube.com/vi/${item.youtubeId}/hqdefault.jpg`
      : '';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm transition-all ${
        isDragging ? 'shadow-lg ring-2 ring-primary border-transparent scale-[1.02]' : 'hover:border-primary/40'
      } ${!item.isActive ? 'opacity-60 bg-muted/30' : ''}`}
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground/40 hover:text-foreground focus:outline-none px-1"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md bg-muted flex items-center justify-center border">
        {posterSrc ? (
          <img src={posterSrc} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="truncate font-semibold text-foreground text-lg">
          {item.title}
          {item.mediaKind && item.mediaKind !== 'image' && (
            <span className="ml-2 rounded bg-red-600/10 px-1.5 py-0.5 text-xs font-medium text-red-600">
              ▶ YouTube
            </span>
          )}
        </h4>
        <p className="text-sm text-muted-foreground font-mono mt-0.5">{item.duration}s de duração</p>
      </div>

      <div className="flex items-center gap-6 ml-4">
        <div className="flex items-center gap-2">
          <Label htmlFor={`active-${item.id}`} className="text-sm font-medium text-muted-foreground cursor-pointer select-none">
            {item.isActive ? 'Ativo' : 'Oculto'}
          </Label>
          <Switch
            id={`active-${item.id}`}
            checked={item.isActive}
            onCheckedChange={() => onToggle(item.id)}
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-9 w-9"
          onClick={() => onEdit(item)}
        >
          <Pencil className="h-4 w-4" />
          <span className="sr-only">Editar</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-9 w-9"
          onClick={() => onDelete(item.id)}
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Excluir</span>
        </Button>
      </div>
    </div>
  );
}

export default function Admin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: announcements, isLoading } = useListAnnouncements();
  const { data: stats } = useGetAnnouncementStats();
  
  const [items, setItems] = useState<Announcement[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (announcements) {
      setItems([...announcements].sort((a, b) => a.displayOrder - b.displayOrder));
    }
  }, [announcements]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const reorderMutation = useReorderAnnouncements({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListActiveAnnouncementsQueryKey() });
      },
      onError: () => {
        toast({ title: 'Não foi possível reordenar', variant: 'destructive' });
        if (announcements) setItems([...announcements].sort((a, b) => a.displayOrder - b.displayOrder));
      }
    }
  });

  const toggleMutation = useToggleAnnouncement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAnnouncementStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListActiveAnnouncementsQueryKey() });
      },
      onError: () => {
        toast({ title: 'Não foi possível alterar o status', variant: 'destructive' });
      }
    }
  });

  const deleteMutation = useDeleteAnnouncement({
    mutation: {
      onSuccess: () => {
        toast({ title: 'Anúncio excluído' });
        queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAnnouncementStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListActiveAnnouncementsQueryKey() });
      },
      onError: () => {
        toast({ title: 'Não foi possível excluir', variant: 'destructive' });
      }
    }
  });

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      title: '',
      displayText: '',
      showText: false,
      duration: 10,
      mediaKind: 'image',
      youtubeUrl: '',
      playbackMode: 'capped',
      audioMode: 'muted',
    },
  });

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      title: '',
      displayText: '',
      showText: false,
      duration: 10,
      mediaKind: 'image',
      youtubeUrl: '',
      playbackMode: 'capped',
      audioMode: 'muted',
    },
  });

  async function onUpload(values: UploadFormValues) {
    try {
      setIsUploading(true);

      const fileField = values.image?.[0];
      if (fileField instanceof File) {
        const errorMsg = await validateImageFile(fileField);
        if (errorMsg) {
          toast({ title: 'Imagem inválida', description: errorMsg, variant: 'destructive' });
          setIsUploading(false);
          return;
        }
      }

      const formData = new FormData();
      formData.append('title', values.title);
      formData.append('displayText', values.displayText);
      formData.append('showText', String(values.showText));
      formData.append('duration', String(values.duration));
      formData.append('mediaKind', values.mediaKind);
      formData.append('playbackMode', values.playbackMode);
      formData.append('audioMode', values.audioMode);
      if (values.mediaKind === 'image') {
        formData.append('image', values.image[0]);
      } else {
        formData.append('youtubeUrl', values.youtubeUrl);
        if (values.image instanceof FileList && values.image.length > 0) {
          formData.append('image', values.image[0]); // fallback custom opcional
        }
      }

      const res = await fetch(`${import.meta.env.BASE_URL}api/announcements`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');
      
      toast({ title: 'Anúncio criado com sucesso' });
      setIsUploadOpen(false);
      form.reset();
      
      queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAnnouncementStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListActiveAnnouncementsQueryKey() });
    } catch (error) {
      toast({ title: 'Falha no envio', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  }

  function openEdit(item: Announcement) {
    setEditing(item);
    editForm.reset({
      title: item.title,
      displayText: item.displayText ?? '',
      showText: item.showText,
      duration: item.duration,
      mediaKind: (item.mediaKind as 'image' | 'youtube_video' | 'youtube_playlist') ?? 'image',
      youtubeUrl: item.youtubeId
        ? item.mediaKind === 'youtube_playlist'
          ? `https://www.youtube.com/playlist?list=${item.youtubeId}`
          : `https://www.youtube.com/watch?v=${item.youtubeId}`
        : '',
      playbackMode: (item.playbackMode as 'natural' | 'capped') ?? 'capped',
      audioMode: (item.audioMode as 'muted' | 'sound') ?? 'muted',
    });
  }

  async function onEditSubmit(values: EditFormValues) {
    if (!editing) return;
    try {
      setIsSaving(true);

      const fileField = values.image?.[0];
      if (fileField instanceof File) {
        const errorMsg = await validateImageFile(fileField);
        if (errorMsg) {
          toast({ title: 'Imagem inválida', description: errorMsg, variant: 'destructive' });
          setIsSaving(false);
          return;
        }
      }

      const formData = new FormData();
      formData.append('title', values.title);
      formData.append('displayText', values.displayText);
      formData.append('showText', String(values.showText));
      formData.append('duration', String(values.duration));
      formData.append('mediaKind', values.mediaKind);
      formData.append('playbackMode', values.playbackMode);
      formData.append('audioMode', values.audioMode);
      if (values.mediaKind !== 'image') {
        formData.append('youtubeUrl', values.youtubeUrl);
      }
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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        
        reorderMutation.mutate({ data: { ids: newItems.map(i => i.id) } });
        
        return newItems;
      });
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-8 animate-in fade-in duration-500">
      
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Anúncios</h1>
          <p className="text-muted-foreground mt-1">Gerencie o que aparece nas suas TVs.</p>
        </div>
        
        <div className="flex gap-4">
          <Card className="bg-primary/5 border-primary/20 shadow-none">
            <CardContent className="p-4 flex gap-8">
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Ativos</span>
                <span className="text-2xl font-bold text-primary">{stats?.active ?? '-'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Total</span>
                <span className="text-2xl font-bold text-foreground">{stats?.total ?? '-'}</span>
              </div>
            </CardContent>
          </Card>

          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="h-auto">
                <Plus className="mr-2 h-5 w-5" />
                Novo slide
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Adicionar anúncio</DialogTitle>
                <DialogDescription>
                  Envie uma imagem e defina a duração para entrar na rotação.
                </DialogDescription>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onUpload)} className="space-y-6 mt-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Título interno</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex.: Promoção de inverno" {...field} />
                        </FormControl>
                        <FormDescription>Usado só para identificar a peça no painel.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="displayText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Texto exibido na TV</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex.: Padaria do Zé — Rua 7, 120" {...field} />
                        </FormControl>
                        <FormDescription>Deixe em branco para o slide ficar só com a imagem.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="showText"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5 pr-4">
                          <FormLabel>Mostrar texto no slide</FormLabel>
                          <FormDescription>Desligado, a TV exibe apenas a imagem.</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
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
                    control={form.control}
                    name="mediaKind"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de mídia</FormLabel>
                        <FormControl>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={field.value}
                            onChange={field.onChange}
                          >
                            <option value="image">Imagem</option>
                            <option value="youtube_video">Vídeo do YouTube</option>
                            <option value="youtube_playlist">Playlist do YouTube</option>
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch('mediaKind') !== 'image' && (
                    <>
                      <FormField
                        control={form.control}
                        name="youtubeUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Link do YouTube</FormLabel>
                            <FormControl>
                              <Input placeholder="https://www.youtube.com/..." {...field} />
                            </FormControl>
                            <FormDescription>Cole o link do vídeo ou da playlist.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="playbackMode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Duração do vídeo</FormLabel>
                            <FormControl>
                              <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={field.value}
                                onChange={field.onChange}
                              >
                                <option value="capped">Limitar aos segundos abaixo</option>
                                <option value="natural">Tocar até o fim</option>
                              </select>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="audioMode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Áudio</FormLabel>
                            <FormControl>
                              <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={field.value}
                                onChange={field.onChange}
                              >
                                <option value="muted">Mudo</option>
                                <option value="sound">Com som (se permitido)</option>
                              </select>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  <FormField
                    control={form.control}
                    name="image"
                    render={({ field: { value, onChange, ...fieldProps } }) => (
                      <FormItem>
                        <FormLabel>
                          {form.watch('mediaKind') === 'image'
                            ? 'Arquivo de imagem'
                            : 'Imagem de fallback (opcional)'}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept="image/*"
                            className="cursor-pointer file:cursor-pointer file:bg-primary/10 file:text-primary file:border-0 file:rounded file:px-3 file:py-1 file:mr-4 file:font-medium hover:file:bg-primary/20 transition-colors"
                            onChange={(event) => onChange(event.target.files)}
                            {...fieldProps}
                          />
                        </FormControl>
                        <FormDescription>
                          <span className="block mt-1">Recomendado: <strong>1920x1080</strong> (horizontal) ou <strong>1080x1920</strong> (vertical).</span>
                          <span className="block">Tamanho máximo: 20MB. Resolução máxima: 3840px.</span>
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter className="pt-4">
                    <Button type="submit" disabled={isUploading} className="w-full sm:w-auto">
                      {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isUploading ? 'Enviando...' : 'Salvar e publicar'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border bg-card/50 p-2 shadow-sm">
        {isLoading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold">Nenhum anúncio</h3>
            <p className="text-muted-foreground mt-2 max-w-sm">
              Você ainda não adicionou nenhum anúncio. Envie seu primeiro slide para começar a exibição.
            </p>
            <Button variant="outline" className="mt-6" onClick={() => setIsUploadOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar seu primeiro slide
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map(i => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3 p-2">
                {items.map((item) => (
                  <SortableAnnouncementRow
                    key={item.id}
                    item={item}
                    onToggle={(id) => toggleMutation.mutate({ id })}
                    onDelete={(id) => deleteMutation.mutate({ id })}
                    onEdit={openEdit}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

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
                    <FormLabel>Título interno</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: Promoção de inverno" {...field} />
                    </FormControl>
                    <FormDescription>Usado só para identificar a peça no painel.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="displayText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Texto exibido na TV</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: Padaria do Zé — Rua 7, 120" {...field} />
                    </FormControl>
                    <FormDescription>Deixe em branco para o slide ficar só com a imagem.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="showText"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5 pr-4">
                      <FormLabel>Mostrar texto no slide</FormLabel>
                      <FormDescription>Desligado, a TV exibe apenas a imagem.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
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
                name="mediaKind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de mídia</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={field.value}
                        onChange={field.onChange}
                      >
                        <option value="image">Imagem</option>
                        <option value="youtube_video">Vídeo do YouTube</option>
                        <option value="youtube_playlist">Playlist do YouTube</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {editForm.watch('mediaKind') !== 'image' && (
                <>
                  <FormField
                    control={editForm.control}
                    name="youtubeUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Link do YouTube</FormLabel>
                        <FormControl>
                          <Input placeholder="https://www.youtube.com/..." {...field} />
                        </FormControl>
                        <FormDescription>Cole o link do vídeo ou da playlist.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="playbackMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duração do vídeo</FormLabel>
                        <FormControl>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={field.value}
                            onChange={field.onChange}
                          >
                            <option value="capped">Limitar aos segundos abaixo</option>
                            <option value="natural">Tocar até o fim</option>
                          </select>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="audioMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Áudio</FormLabel>
                        <FormControl>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={field.value}
                            onChange={field.onChange}
                          >
                            <option value="muted">Mudo</option>
                            <option value="sound">Com som (se permitido)</option>
                          </select>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </>
              )}

              <FormField
                control={editForm.control}
                name="image"
                render={({ field: { value, onChange, ...fieldProps } }) => (
                  <FormItem>
                    <FormLabel>
                      {editForm.watch('mediaKind') === 'image'
                        ? 'Substituir imagem (opcional)'
                        : 'Imagem de fallback (opcional)'}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept="image/*"
                        className="cursor-pointer file:cursor-pointer file:bg-primary/10 file:text-primary file:border-0 file:rounded file:px-3 file:py-1 file:mr-4 file:font-medium hover:file:bg-primary/20 transition-colors"
                        onChange={(event) => onChange(event.target.files)}
                        {...fieldProps}
                      />
                    </FormControl>
                    <FormDescription>
                      <span className="block mt-1">Recomendado: <strong>1920x1080</strong> (horizontal) ou <strong>1080x1920</strong> (vertical).</span>
                      <span className="block">Tamanho máximo: 20MB. Resolução máxima: 3840px.</span>
                    </FormDescription>
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
    </div>
  );
}
