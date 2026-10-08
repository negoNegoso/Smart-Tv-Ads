import { Badge } from '@/components/ui/badge';
import { lastSeenLabel, storageLabel, type DeviceStorageInfo as StorageInfo } from '@/lib/fleet';

/** Espaço em disco da TV, como o app informou no último feed. */
export function DeviceStorageInfo({ storage, now = new Date() }: { storage: StorageInfo | null | undefined; now?: Date }) {
  return (
    <div className="space-y-1" data-testid="device-storage">
      <p className="text-sm font-medium">Espaço no aparelho</p>
      {storage ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground tabular-nums">
          {storageLabel(storage)}
          {storage.low ? <Badge variant="destructive">Pouco espaço</Badge> : null}
          <span>· lido {lastSeenLabel(storage.reportedAt, now)}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Sem leitura de espaço ainda.</p>
      )}
    </div>
  );
}
