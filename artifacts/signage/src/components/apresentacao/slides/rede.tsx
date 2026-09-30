import { useMemo } from 'react';
import { MapaVale } from '@/components/landing/mapa-vale';
import { usePublicStats } from '@/hooks/use-public-stats';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { LANDING } from '@/lib/landing-content';
import { VALE_MUNICIPIOS } from '@/lib/mapa-vale';
import { SlideShell } from '../slide-shell';

const format = new Intl.NumberFormat('pt-BR');

/**
 * A rede em números, ao vivo. Diferente da landing, o slide nunca some: a
 * reunião segue no roteiro mesmo com a API fora. O que some é o número que
 * não ajuda — telas ativas zeradas (madrugada, queda de internet) e o mapa
 * sem nenhum parceiro. "24 cidades do Vale do Ribeira" fica sempre.
 */
export function SlideRede() {
  const { data } = usePublicStats();

  const parceiras = useMemo(() => {
    // Só conta cidade que está entre as 24 do mapa, mesma regra da landing.
    const doVale = new Set(VALE_MUNICIPIOS.map((m) => m.ibge));
    return new Set((data?.cities ?? []).map((c) => c.ibge).filter((ibge) => doVale.has(ibge)));
  }, [data]);

  const telas = data?.activeScreens ?? 0;

  return (
    <SlideShell eyebrow={APRESENTACAO.rede.eyebrow} titulo={LANDING.cobertura.title}>
      <div className="grid gap-10 md:grid-cols-2 md:items-center">
        <div className="space-y-6">
          {telas > 0 ? (
            <p>
              <span className="block text-6xl font-semibold tracking-tight text-primary sm:text-7xl">
                {format.format(telas)}
              </span>
              <span className="text-xl text-muted-foreground">{LANDING.cobertura.screensLabel}</span>
            </p>
          ) : null}
          {parceiras.size > 0 ? (
            <p>
              <span className="block text-5xl font-semibold tracking-tight text-foreground">
                {format.format(parceiras.size)}
              </span>
              <span className="text-xl text-muted-foreground">{APRESENTACAO.rede.cidadesComParceiros}</span>
            </p>
          ) : null}
          <p className="text-2xl font-semibold text-foreground">{LANDING.cobertura.regionLabel}</p>
        </div>
        {parceiras.size > 0 ? (
          <MapaVale parceiras={parceiras} className="mx-auto h-auto w-full max-w-xl" />
        ) : null}
      </div>
    </SlideShell>
  );
}
