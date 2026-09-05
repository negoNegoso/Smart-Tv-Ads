// artifacts/signage/src/components/portal/print-header.tsx
import { MonitorPlay } from 'lucide-react';

function longDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  // Meio-dia UTC: a data já é local do negócio, e só queremos formatá-la por
  // extenso sem que o fuso do navegador a empurre para o dia anterior.
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Cabeçalho que só existe no papel. Na tela essa informação já está no shell e
 * no filtro; impressa, ela é o que transforma a página num comprovante — sem
 * período e sem data de emissão, o PDF não prova nada.
 */
export function PrintHeader({
  subject,
  period,
}: {
  subject: string;
  period: { from: string; to: string };
}) {
  return (
    <header className="mb-6 hidden border-b pb-4 print:block">
      <div className="flex items-center gap-2 font-bold tracking-tight">
        <MonitorPlay className="h-5 w-5" aria-hidden />
        <span>Painel de Anúncios</span>
      </div>
      <h1 className="mt-2 text-xl font-semibold">{subject}</h1>
      <p className="text-sm text-muted-foreground">
        Período de {longDate(period.from)} a {longDate(period.to)}
      </p>
      <p className="text-xs text-muted-foreground">
        Emitido em {new Date().toLocaleDateString('pt-BR')}
      </p>
    </header>
  );
}
