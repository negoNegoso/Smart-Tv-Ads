import { useQuery } from '@tanstack/react-query';

interface PortalDevice {
  id: number;
  name: string;
  location: string | null;
  lastSeenAt: string | null;
  totalPlays: number;
}

export default function PortalClient() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['portal', 'client', 'devices'],
    queryFn: async (): Promise<PortalDevice[]> => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/portal/client/devices`);
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Meus dispositivos</h1>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2">TV</th>
              <th className="px-3 py-2">Local</th>
              <th className="px-3 py-2">Última atividade</th>
              <th className="px-3 py-2 text-right">Exibições</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="px-3 py-2">{d.name}</td>
                <td className="px-3 py-2">{d.location ?? '—'}</td>
                <td className="px-3 py-2">
                  {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : '—'}
                </td>
                <td className="px-3 py-2 text-right">{d.totalPlays}</td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={4}>
                  Nenhum dispositivo encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
