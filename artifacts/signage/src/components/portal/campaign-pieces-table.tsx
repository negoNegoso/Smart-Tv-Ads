export interface PieceRow {
  announcementId: number;
  title: string;
  plays: number;
  scans: number;
  scanRate: number;
}

const rate = (n: number) =>
  `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Qual arte funcionou: a resposta por peça, que o anunciante usa na próxima campanha. */
export function CampaignPiecesTable({ items }: { items: PieceRow[] }) {
  return (
    <div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma peça nesta campanha</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Peça</th>
                <th className="py-2 text-right font-medium">Exibições</th>
                <th className="py-2 text-right font-medium">Scans</th>
                <th className="py-2 text-right font-medium">Taxa</th>
              </tr>
            </thead>
            <tbody>
              {items.map((piece) => (
                <tr key={piece.announcementId} className="break-inside-avoid border-b last:border-0">
                  <td className="py-2 font-medium">{piece.title}</td>
                  <td className="py-2 text-right tabular-nums">{piece.plays.toLocaleString('pt-BR')}</td>
                  <td className="py-2 text-right tabular-nums">{piece.scans.toLocaleString('pt-BR')}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{rate(piece.scanRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Scan mede resposta, não alcance. Um scan não é atribuível a uma exibição específica, e múltiplos scans da
        mesma pessoa contam no número bruto — use a taxa para comparar peças entre si.
      </p>
    </div>
  );
}
