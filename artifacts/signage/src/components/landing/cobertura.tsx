import * as React from 'react';
import { LANDING, whatsappUrl } from '@/lib/landing-content';
import { usePublicStats } from '@/hooks/use-public-stats';
import { VALE_MUNICIPIOS, VALE_VIEW_BOX } from '@/lib/mapa-vale';

const format = new Intl.NumberFormat('pt-BR');

/**
 * Cobertura da rede, cidade a cidade.
 *
 * Herda as duas regras da faixa de números que esta seção substituiu: falha da
 * API não vira mensagem na tela, e número que não ajuda não vai para a tela —
 * sem nenhuma cidade parceira, a seção inteira não existe.
 *
 * O SVG é decoração (aria-hidden): a lista de botões abaixo dele carrega a
 * mesma seleção e é a interface para teclado e leitor de tela. Os dois
 * controlam o mesmo estado, então nunca divergem.
 */
export function Cobertura() {
  const { data } = usePublicStats();
  const [selecionada, setSelecionada] = React.useState<string | null>(null);

  const porCidade = React.useMemo(() => {
    const mapa = new Map<string, number>();
    for (const cidade of data?.cities ?? []) mapa.set(cidade.ibge, cidade.companies);
    return mapa;
  }, [data]);

  // Cidade com mais parceiros; empate pelo código, para o render ser determinístico.
  const padrao = React.useMemo(() => {
    const cidades = [...porCidade.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    return cidades[0]?.[0] ?? null;
  }, [porCidade]);

  if (!data || porCidade.size === 0) return null;

  const ativa = selecionada && porCidade.has(selecionada) ? selecionada : padrao;
  const municipioAtivo = VALE_MUNICIPIOS.find((m) => m.ibge === ativa);
  const parceiros = ativa ? (porCidade.get(ativa) ?? 0) : 0;

  return (
    <section className="border-b border-zinc-200 bg-zinc-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-2 md:items-center md:py-20">
        <div>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-zinc-900 sm:text-4xl">
            {LANDING.cobertura.title}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-600">
            {LANDING.cobertura.subtitle}
          </p>

          <p className="mt-8 text-lg font-semibold text-zinc-900">
            {format.format(data.activeScreens)}{' '}
            <span className="font-normal text-zinc-600">{LANDING.cobertura.screensLabel}</span>
          </p>
          <p className="text-lg font-semibold text-zinc-900">{LANDING.cobertura.regionLabel}</p>

          {municipioAtivo && (
            <div className="mt-8">
              <h3 className="text-xl font-semibold text-zinc-900">{municipioAtivo.nome}</h3>
              <p className="text-3xl font-semibold tracking-tight text-primary">
                {format.format(parceiros)}
              </p>
              <p className="mt-1 text-sm text-zinc-600">{LANDING.cobertura.cityLabel}</p>

              <a
                href={whatsappUrl(`${LANDING.cobertura.ctaMessage} ${municipioAtivo.nome}.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                {LANDING.cobertura.cta}
              </a>
            </div>
          )}
        </div>

        <div>
          <svg
            viewBox={VALE_VIEW_BOX}
            className="mx-auto hidden h-auto w-full max-w-md md:block"
            aria-hidden="true"
          >
            {VALE_MUNICIPIOS.map((municipio) => {
              const temParceiro = porCidade.has(municipio.ibge);
              return (
                <path
                  key={municipio.ibge}
                  d={municipio.path}
                  fill={
                    municipio.ibge === ativa
                      ? 'hsl(var(--primary))'
                      : temParceiro
                        ? 'rgb(191 219 254)'
                        : 'rgb(228 228 231)'
                  }
                  stroke="white"
                  strokeWidth={1.5}
                  style={{ pointerEvents: temParceiro ? 'auto' : 'none', cursor: temParceiro ? 'pointer' : 'default' }}
                  onClick={temParceiro ? () => setSelecionada(municipio.ibge) : undefined}
                />
              );
            })}
          </svg>

          <ul className="mt-6 flex flex-wrap gap-2" aria-label={LANDING.cobertura.listLabel}>
            {VALE_MUNICIPIOS.filter((m) => porCidade.has(m.ibge)).map((municipio) => (
              <li key={municipio.ibge}>
                <button
                  type="button"
                  aria-pressed={municipio.ibge === ativa}
                  onClick={() => setSelecionada(municipio.ibge)}
                  className={
                    municipio.ibge === ativa
                      ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-white'
                      : 'rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:border-primary'
                  }
                >
                  {municipio.nome}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
