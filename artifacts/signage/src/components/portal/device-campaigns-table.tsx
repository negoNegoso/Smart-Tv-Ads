export interface DeviceCampaignRow {
  campaignId: number | null;
  campaignName: string | null;
  advertiserName: string | null;
  plays: number;
}

/** O que passou nesta TV. O que não tem campanha é da própria loja (playlist e encartes). */
export function DeviceCampaignsTable({ items }: { items: DeviceCampaignRow[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma exibição no período</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-muted-foreground">
          <tr>
            <th className="py-2 font-medium">Campanha</th>
            <th className="py-2 font-medium">Anunciante</th>
            <th className="py-2 text-right font-medium">Exibições</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.campaignId ?? 'loja'} className="break-inside-avoid border-b last:border-0">
              <td className="py-2 font-medium">{row.campaignName ?? 'Conteúdo da loja'}</td>
              <td className="py-2 text-muted-foreground">{row.advertiserName ?? '—'}</td>
              <td className="py-2 text-right tabular-nums">{row.plays.toLocaleString('pt-BR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
