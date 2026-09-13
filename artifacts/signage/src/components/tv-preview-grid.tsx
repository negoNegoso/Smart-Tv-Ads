import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import type { DevicePreviewSlide } from '@workspace/api-client-react';
import { DevicePreview } from '@/components/device-preview';
import { Skeleton } from '@/components/ui/skeleton';

export interface TvPreviewGridProps {
  devices: Array<{ id: number; name: string }>;
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
}: Omit<TvPreviewGridProps, 'devices'> & { device: { id: number; name: string } }) {
  // Uma consulta por TV: a falha de uma fica no card dela. Mesmo ritmo do
  // player, que busca a rotação a cada 60s.
  const preview = useQuery({
    queryKey: queryKey(device.id),
    queryFn: () => loadPreview(device.id),
    refetchInterval: 60_000,
  });

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
        <Skeleton className="aspect-video w-full rounded-lg" />
      ) : preview.isError ? (
        <p className="flex aspect-video w-full items-center justify-center rounded-lg border text-sm text-muted-foreground">
          Não foi possível carregar a prévia.
        </p>
      ) : (
        <DevicePreview slides={preview.data ?? []} compact />
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
