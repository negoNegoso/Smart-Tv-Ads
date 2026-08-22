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
import { GripVertical, Plus, Trash2, Image as ImageIcon, Loader2 } from 'lucide-react';

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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { mediaUrl } from '@/lib/media-url';

const uploadSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  duration: z.coerce.number().min(1, 'Must be at least 1 second').default(10),
  image: z.any().refine((val) => val instanceof FileList && val.length > 0, 'Image is required'),
});

type UploadFormValues = z.infer<typeof uploadSchema>;

function SortableAnnouncementRow({
  item,
  onToggle,
  onDelete,
}: {
  item: Announcement;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
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

  const imageUrl = mediaUrl(item.imageUrl);

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
        {item.imageUrl ? (
          <img src={imageUrl} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="truncate font-semibold text-foreground text-lg">{item.title}</h4>
        <p className="text-sm text-muted-foreground font-mono mt-0.5">{item.duration}s duration</p>
      </div>

      <div className="flex items-center gap-6 ml-4">
        <div className="flex items-center gap-2">
          <Label htmlFor={`active-${item.id}`} className="text-sm font-medium text-muted-foreground cursor-pointer select-none">
            {item.isActive ? 'Active' : 'Hidden'}
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
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-9 w-9"
          onClick={() => onDelete(item.id)}
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Delete</span>
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
        toast({ title: 'Failed to reorder', variant: 'destructive' });
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
        toast({ title: 'Failed to toggle status', variant: 'destructive' });
      }
    }
  });

  const deleteMutation = useDeleteAnnouncement({
    mutation: {
      onSuccess: () => {
        toast({ title: 'Announcement deleted' });
        queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAnnouncementStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListActiveAnnouncementsQueryKey() });
      },
      onError: () => {
        toast({ title: 'Failed to delete', variant: 'destructive' });
      }
    }
  });

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      title: '',
      duration: 10,
    },
  });

  async function onUpload(values: UploadFormValues) {
    try {
      setIsUploading(true);
      const file = values.image[0];
      const formData = new FormData();
      formData.append('title', values.title);
      formData.append('duration', String(values.duration));
      formData.append('image', file);

      const res = await fetch(`${import.meta.env.BASE_URL}api/announcements`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');
      
      toast({ title: 'Announcement created successfully' });
      setIsUploadOpen(false);
      form.reset();
      
      queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAnnouncementStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListActiveAnnouncementsQueryKey() });
    } catch (error) {
      toast({ title: 'Upload failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Announcements</h1>
          <p className="text-muted-foreground mt-1">Manage what plays on your digital displays.</p>
        </div>
        
        <div className="flex gap-4">
          <Card className="bg-primary/5 border-primary/20 shadow-none">
            <CardContent className="p-4 flex gap-8">
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Active</span>
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
                New Slide
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add Announcement</DialogTitle>
                <DialogDescription>
                  Upload an image and set its duration to appear in the rotation.
                </DialogDescription>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onUpload)} className="space-y-6 mt-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="E.g., Winter Promo" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duration (seconds)</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="image"
                    render={({ field: { value, onChange, ...fieldProps } }) => (
                      <FormItem>
                        <FormLabel>Image File</FormLabel>
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
                    <Button type="submit" disabled={isUploading} className="w-full sm:w-auto">
                      {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isUploading ? 'Uploading...' : 'Save & Publish'}
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
            <h3 className="text-xl font-semibold">No announcements</h3>
            <p className="text-muted-foreground mt-2 max-w-sm">
              You haven't added any announcements yet. Upload your first slide to start the broadcast.
            </p>
            <Button variant="outline" className="mt-6" onClick={() => setIsUploadOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add your first slide
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
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
