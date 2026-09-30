import { APRESENTACAO } from '@/lib/apresentacao-content';

const fmt = new Intl.NumberFormat('pt-BR');

/**
 * Relatório de exemplo, no formato do portal do anunciante. Dados fictícios
 * de propósito: print de cliente real expõe o cliente. O selo fica sempre
 * visível para ninguém sair da reunião achando que o número é da rede.
 */
export function RelatorioMock() {
  const { selo, periodo, colunas, pecas } = APRESENTACAO.resultado;
  const maior = Math.max(...pecas.map((p) => p.exibicoes));

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-muted-foreground">{periodo}</p>
        <span className="rounded-full border border-primary px-3 py-1 text-sm font-semibold text-primary">
          {selo}
        </span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="text-sm text-muted-foreground">
            <th scope="col" className="pb-3 font-medium">{colunas.peca}</th>
            <th scope="col" className="pb-3 text-right font-medium">{colunas.exibicoes}</th>
            <th scope="col" className="pb-3 text-right font-medium">{colunas.leituras}</th>
          </tr>
        </thead>
        <tbody>
          {pecas.map((peca) => (
            <tr key={peca.nome} className="border-t border-border">
              <th scope="row" className="py-4 pr-4 font-normal">
                <span className="text-lg text-foreground">{peca.nome}</span>
                <span className="mt-2 block h-2 w-full rounded-full bg-muted">
                  <span
                    data-barra
                    className="block h-2 rounded-full bg-primary"
                    style={{ width: `${Math.round((peca.exibicoes / maior) * 100)}%` }}
                  />
                </span>
              </th>
              <td className="py-4 text-right text-lg font-semibold text-foreground">{fmt.format(peca.exibicoes)}</td>
              <td className="py-4 text-right text-lg font-semibold text-primary">{fmt.format(peca.leituras)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
