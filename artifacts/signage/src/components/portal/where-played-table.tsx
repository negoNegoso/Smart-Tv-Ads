export interface WherePlayedRow {
  deviceId: number;
  storeName: string;
  deviceName: string;
  location: string | null;
  plays: number;
  firstPlayedAt: string;
  lastPlayedAt: string;
}

/** Data e hora no fuso do negócio: o comprovante não pode mudar com o fuso de quem abre. */
const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

/**
 * "Onde passou": a prova de veiculação. Todas as TVs, sem corte — é o que o
 * anunciante pagou para ter.
 */
export function WherePlayedTable({ items }: { items: WherePlayedRow[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma exibição até agora</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-muted-foreground">
          <tr>
            <th className="py-2 font-medium">Loja</th>
            <th className="py-2 font-medium">TV</th>
            <th className="py-2 font-medium">Local</th>
            <th className="py-2 text-right font-medium">Exibições</th>
            <th className="py-2 font-medium">Primeira</th>
            <th className="py-2 font-medium">Última</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.deviceId} className="break-inside-avoid border-b last:border-0">
              <td className="py-2 font-medium">{row.storeName}</td>
              <td className="py-2">{row.deviceName}</td>
              <td className="py-2 text-muted-foreground">{row.location ?? '—'}</td>
              <td className="py-2 text-right tabular-nums">{row.plays.toLocaleString('pt-BR')}</td>
              <td className="py-2 whitespace-nowrap text-muted-foreground">{when(row.firstPlayedAt)}</td>
              <td className="py-2 whitespace-nowrap text-muted-foreground">{when(row.lastPlayedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
