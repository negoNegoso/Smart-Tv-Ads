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

  // Municípios dos 24 do Vale que têm parceiro — única fonte da guarda da
  // seção e da lista de botões. Ancorar em VALE_MUNICIPIOS (não em porCidade
  // diretamente) garante que um ibge fora dos 24 vindo da API não conta como
  // parceiro: sem isso a seção renderizaria com título e mapa vazios.
  const parceiras = VALE_MUNICIPIOS.filter((m) => porCidade.has(m.ibge));

  if (!data || parceiras.length === 0) return null;

  const ativa = selecionada && porCidade.has(selecionada) ? selecionada : padrao;
  const municipioAtivo = VALE_MUNICIPIOS.find((m) => m.ibge === ativa);
  const parceiros = ativa ? (porCidade.get(ativa) ?? 0) : 0;

  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-2 md:items-center md:py-20">
        <div>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
            {LANDING.cobertura.title}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            {LANDING.cobertura.subtitle}
          </p>

          <div className="mt-8">
            {/*
              Regra herdada da StatsBand que esta seção substituiu: "0 telas
              ativas" numa página que vende rede de telas é pior que a ausência
              do número. De madrugada, com queda de internet ou em manutenção,
              nenhum device manda sinal nas últimas 24h e o dado zera sem a
              rede ter sumido — então o número some, não a frase "0 telas".
            */}
            {data.activeScreens > 0 && (
              <p className="text-lg font-semibold text-foreground">
                {format.format(data.activeScreens)}{' '}
                <span className="font-normal text-muted-foreground">{LANDING.cobertura.screensLabel}</span>
              </p>
            )}
            <p className="text-lg font-semibold text-foreground">{LANDING.cobertura.regionLabel}</p>
          </div>

          {municipioAtivo && (
            <div className="mt-8">
              <h3 className="text-xl font-semibold text-foreground">{municipioAtivo.nome}</h3>
              <p className="text-3xl font-semibold tracking-tight text-primary">
                {format.format(parceiros)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{LANDING.cobertura.cityLabel}</p>

              <a
                href={whatsappUrl(`${LANDING.cobertura.ctaMessage} ${municipioAtivo.nome}.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
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
                        ? 'hsl(var(--primary) / 0.35)'
                        : 'hsl(var(--muted-foreground) / 0.3)'
                  }
                  stroke="hsl(var(--background))"
                  strokeWidth={1.5}
                  style={{ pointerEvents: temParceiro ? 'auto' : 'none', cursor: temParceiro ? 'pointer' : 'default' }}
                  onClick={temParceiro ? () => setSelecionada(municipio.ibge) : undefined}
                />
              );
            })}
          </svg>

          <ul className="mt-6 flex flex-wrap gap-2" aria-label={LANDING.cobertura.listLabel}>
            {parceiras.map((municipio) => (
              <li key={municipio.ibge}>
                <button
                  type="button"
                  aria-pressed={municipio.ibge === ativa}
                  onClick={() => setSelecionada(municipio.ibge)}
                  className={
                    municipio.ibge === ativa
                      ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground'
                      : 'rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-foreground'
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
