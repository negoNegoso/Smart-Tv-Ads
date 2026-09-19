import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useRoute } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, listCompanies, type Company } from '@/lib/companies-api';
import {
  createPairedDevice,
  deviceByKeyQueryKey,
  formatDeviceKey,
  getDeviceByKey,
  parseDeviceKey,
  type PairedDevice,
} from '@/lib/pairing-api';

export default function ParearPage() {
  const [, params] = useRoute('/parear/:key');
  return <ParearView rawKey={params?.key ?? ''} />;
}

export function ParearView({ rawKey }: { rawKey: string }) {
  const key = parseDeviceKey(rawKey);
  if (!key) {
    return <Shell><p className="text-destructive">Código de TV inválido.</p></Shell>;
  }
  return <ParearKey deviceKey={key} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md space-y-4 p-4">{children}</div>;
}

function ParearKey({ deviceKey }: { deviceKey: string }) {
  const queryClient = useQueryClient();
  const existing = useQuery({
    queryKey: deviceByKeyQueryKey(deviceKey),
    queryFn: () => getDeviceByKey(deviceKey),
  });
  const [done, setDone] = useState<{ device: PairedDevice; companyId: number } | null>(null);

  if (done) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">Pronto</h1>
        <p>TV vinculada! Ela começa a exibir em alguns segundos.</p>
        <div className="flex flex-col gap-2">
          <Button asChild size="lg"><Link href={`/devices/${done.device.id}`}>Ver TV</Link></Button>
          <Button asChild size="lg" variant="outline"><Link href={`/companies/${done.companyId}`}>Ver empresa</Link></Button>
        </div>
      </Shell>
    );
  }

  if (existing.isLoading) return <Shell><Skeleton className="h-40 w-full" /></Shell>;
  if (existing.isError) return <Shell><p className="text-destructive">Não foi possível consultar a TV.</p></Shell>;

  if (existing.data) {
    const device = existing.data;
    return (
      <Shell>
        <p>
          Esta TV já está vinculada a <strong>{device.clientName}</strong> ({device.name}).
        </p>
        <Button asChild size="lg"><Link href={`/devices/${device.id}`}>Ver TV</Link></Button>
      </Shell>
    );
  }

  return (
    <PairForm
      deviceKey={deviceKey}
      onDone={setDone}
      onConflict={() => queryClient.invalidateQueries({ queryKey: deviceByKeyQueryKey(deviceKey) })}
    />
  );
}

function PairForm({
  deviceKey,
  onDone,
  onConflict,
}: {
  deviceKey: string;
  onDone: (r: { device: PairedDevice; companyId: number }) => void;
  onConflict: () => void;
}) {
  const [search, setSearch] = useState('');
  const [company, setCompany] = useState<Company | null>(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const q = search.trim();

  const companies = useQuery({
    queryKey: ['companies', { role: 'client', q }],
    queryFn: () => listCompanies({ role: 'client', q }),
    enabled: !company && q.length > 0,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createPairedDevice({
        clientId: company!.clientId!,
        name: name.trim(),
        ...(location.trim() ? { location: location.trim() } : {}),
        deviceKey,
      }),
    onSuccess: (device) => onDone({ device, companyId: company!.id }),
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) onConflict();
    },
  });

  const canSubmit = !!company && name.trim().length > 0 && !mutation.isPending;

  return (
    <Shell>
      <h1 className="text-2xl font-semibold">Vincular TV</h1>
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-muted-foreground">Confira com o código na tela da TV</p>
          <p className="font-mono text-2xl tracking-widest">{formatDeviceKey(deviceKey)}</p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label htmlFor="pair-company">Empresa</Label>
        {company ? (
          <div className="flex items-center justify-between rounded-md border p-3">
            <span>{company.name}</span>
            <Button variant="ghost" size="sm" onClick={() => setCompany(null)}>Trocar</Button>
          </div>
        ) : (
          <>
            <Input
              id="pair-company"
              className="h-12"
              placeholder="Buscar pelo nome"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {companies.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma empresa com perfil de TV encontrada. Cadastre em{' '}
                <Link href="/companies" className="underline">Empresas</Link>.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {companies.data?.map((c) => (
                <Button key={c.id} variant="outline" size="lg" className="justify-start" onClick={() => setCompany(c)}>
                  {c.name}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="pair-name">Nome da TV</Label>
        <Input id="pair-name" className="h-12" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="pair-location">Local (opcional)</Label>
        <Input id="pair-location" className="h-12" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>

      {mutation.isError && !(mutation.error instanceof ApiError && mutation.error.status === 409) && (
        <p className="text-destructive">{mutation.error.message}</p>
      )}

      <Button size="lg" className="w-full" disabled={!canSubmit} onClick={() => mutation.mutate()}>
        Vincular TV
      </Button>
    </Shell>
  );
}
