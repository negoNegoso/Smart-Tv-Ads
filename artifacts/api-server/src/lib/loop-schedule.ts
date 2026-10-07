/**
 * Um bloco da volta: as peças que tocam juntas (todas as peças de uma
 * campanha, as páginas de um painel, um item da playlist) e quantas vezes o
 * bloco entra em cada volta.
 */
export type LoopBlock<T> = { weight: number; slides: T[] };

/**
 * Peso que a montagem aceita: inteiro ≥ 1. A API já valida; isto é a rede de
 * segurança para nunca ficar sem volta nem girar para sempre.
 */
function safeWeight(weight: number): number {
  return Number.isFinite(weight) && weight >= 1 ? Math.floor(weight) : 1;
}

/**
 * Monta a volta da TV por round-robin ponderado suave (o do balanceador do
 * nginx): a cada passo todo bloco ganha crédito igual ao peso, toca o de
 * maior crédito e ele paga o total. Cada bloco entra exatamente `peso` vezes
 * e as repetições ficam espalhadas, em vez de coladas.
 *
 * Empate vai para o bloco que veio antes: com tudo em 1× a volta é a ordem de
 * entrada, a mesma de antes da frequência existir. Sem aleatoriedade — a TV
 * recomeça a volta quando a lista muda, então duas buscas iguais têm de dar a
 * mesma fila.
 *
 * Pós-passo na virada: a TV repete a volta, e o round-robin começa pelo bloco
 * mais pesado e, para pesos comuns, termina nele também (2,1,1 → A B C A), o
 * que faria a campanha 2× tocar duas vezes seguidas na virada (…A|A…). Se o
 * último bloco é o mesmo do primeiro e o penúltimo e o antepenúltimo são
 * outros, troca os dois últimos de lugar (A B A C). Só vale quando dá para
 * evitar: com peso acima de metade do total (ex.: 3,1,1 ou 2,1) alguma
 * repetição colada é inevitável e a ordem fica como saiu.
 */
export function buildLoop<T>(blocks: LoopBlock<T>[]): T[] {
  const active = blocks
    .filter((block) => block.slides.length > 0)
    .map((block) => ({ weight: safeWeight(block.weight), slides: block.slides }));
  const total = active.reduce((sum, block) => sum + block.weight, 0);
  const credit = active.map(() => 0);
  const order: number[] = [];
  for (let step = 0; step < total; step++) {
    let chosen = 0;
    for (let i = 0; i < active.length; i++) {
      credit[i] += active[i].weight;
      if (credit[i] > credit[chosen]) chosen = i;
    }
    credit[chosen] -= total;
    order.push(chosen);
  }
  const n = order.length;
  if (
    n >= 3 &&
    order[0] === order[n - 1] &&
    order[n - 2] !== order[0] &&
    order[n - 3] !== order[0] &&
    2 * active[order[0]].weight <= total
  ) {
    [order[n - 1], order[n - 2]] = [order[n - 2], order[n - 1]];
  }
  return order.flatMap((index) => active[index].slides);
}
