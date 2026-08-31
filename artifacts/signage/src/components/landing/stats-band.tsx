import { LANDING } from '@/lib/landing-content';
import { usePublicStats } from '@/hooks/use-public-stats';

const format = new Intl.NumberFormat('pt-BR');

/**
 * Prova numérica, vinda do banco.
 *
 * Duas regras decidem se esta faixa ajuda ou atrapalha:
 *
 * 1. Falha da API não derruba a página: sem dado, a faixa inteira não existe.
 *    Nada de spinner ou mensagem de erro — o visitante não precisa saber que
 *    existe uma API.
 * 2. Zero não vai para a tela: "0 telas ativas" numa página que vende rede de
 *    telas é pior que a ausência do número. Enquanto a rede for pequena, a
 *    faixa aparece parcial — é o preço de puxar do banco em vez de fixar
 *    valores no código.
 */
export function StatsBand() {
  const { data } = usePublicStats();
  if (!data) return null;

  const items = [
    { value: data.plays30d, label: LANDING.stats.plays30d },
    { value: data.activeScreens, label: LANDING.stats.activeScreens },
    { value: data.clients, label: LANDING.stats.clients },
    { value: data.segments, label: LANDING.stats.segments },
  ].filter((item) => item.value > 0);

  if (items.length === 0) return null;

  return (
    <section className="border-b border-zinc-200 bg-zinc-50">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-10 md:grid-cols-4">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="sr-only">{item.label}</dt>
            <dd>
              <span className="block text-3xl font-semibold tracking-tight text-primary">
                {format.format(item.value)}
              </span>
              <span className="mt-1 block text-sm text-zinc-600">{item.label}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
