import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { screenOrientationOf } from '@workspace/db/orientation';
import type { DevicePreviewSlide } from '@workspace/api-client-react';
import { DevicePreview } from '@/components/device-preview';
import { tvFrameClass } from '@/components/piece-preview';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface TvPreviewGridProps {
  devices: Array<{ id: number; name: string; orientation?: string }>;
  /** De onde vem a rotação: rota do admin ou do portal, cada uma com seu escopo. */
  loadPreview: (deviceId: number) => Promise<DevicePreviewSlide[]>;
  queryKey: (deviceId: number) => readonly unknown[];
  /** Quando dado, o nome da TV vira link para a página dela. */
  hrefFor?: (deviceId: number) => string;
}

function TvPreviewCard({
  device,
  loadPreview,
  queryKey,
  hrefFor,
}: Omit<TvPreviewGridProps, 'devices'> & { device: { id: number; name: string; orientation?: string } }) {
  // Uma consulta por TV: a falha de uma fica no card dela. Mesmo ritmo do
  // player, que busca a rotação a cada 60s.
  const preview = useQuery({
    queryKey: queryKey(device.id),
    queryFn: () => loadPreview(device.id),
    refetchInterval: 60_000,
  });
  const orientation = screenOrientationOf(device.orientation);

  return (
    <div className="min-w-0 space-y-2">
      {hrefFor ? (
        <Link href={hrefFor(device.id)} className="block truncate text-sm font-medium hover:text-primary">
          {device.name}
        </Link>
      ) : (
        <p className="truncate text-sm font-medium">{device.name}</p>
      )}
      {preview.isLoading ? (
        <Skeleton className={cn('rounded-lg', tvFrameClass(orientation))} />
      ) : preview.isError ? (
        <p className={cn('flex items-center justify-center rounded-lg border text-sm text-muted-foreground', tvFrameClass(orientation))}>
          Não foi possível carregar a prévia.
        </p>
      ) : (
        <DevicePreview slides={preview.data ?? []} compact orientation={orientation} />
      )}
    </div>
  );
}

/**
 * Prévias de todas as TVs de um cliente, lado a lado. Sem TV, não desenha
 * nada — quem usa decide o título da seção e o esconde junto.
 */
export function TvPreviewGrid({ devices, ...rest }: TvPreviewGridProps) {
  if (devices.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {devices.map((device) => (
        <TvPreviewCard key={device.id} device={device} {...rest} />
      ))}
    </div>
  );
}
