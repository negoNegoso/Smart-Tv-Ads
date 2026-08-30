import { useQuery } from '@tanstack/react-query';

interface PortalCampaign {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  deviceCount: number;
  totalPlays: number;
  totalScans: number;
  uniqueVisitors: number;
}

export default function PortalAdvertiser() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['portal', 'advertiser', 'campaigns'],
    queryFn: async (): Promise<PortalCampaign[]> => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/portal/advertiser/campaigns`);
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Minhas campanhas</h1>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Campanha</th>
              <th className="px-3 py-2">Período</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">TVs</th>
              <th className="px-3 py-2 text-right">Exibições</th>
              <th className="px-3 py-2 text-right">Scans</th>
              <th className="px-3 py-2 text-right">Únicos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2">
                  {new Date(c.startsAt).toLocaleDateString()} – {new Date(c.endsAt).toLocaleDateString()}
                </td>
                <td className="px-3 py-2">{c.isActive ? 'Ativa' : 'Inativa'}</td>
                <td className="px-3 py-2 text-right">{c.deviceCount}</td>
                <td className="px-3 py-2 text-right">{c.totalPlays}</td>
                <td className="px-3 py-2 text-right">{c.totalScans}</td>
                <td className="px-3 py-2 text-right">{c.uniqueVisitors}</td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={7}>
                  Nenhuma campanha encontrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
