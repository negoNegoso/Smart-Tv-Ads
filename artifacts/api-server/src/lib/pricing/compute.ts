import { campaignReachesDevice, previewReach } from "../ad-eligibility";
import { loadAdvertiserIdentity } from "../campaigns/reach";
import { loadPricing, loadQuoteNetwork } from "./store";
import { quote, type Quote, type QuotePeriod } from "./quote";

export type ComputeQuoteInput = {
  targetMode: "all" | "devices" | "segments";
  deviceIds: number[];
  segmentIds: number[];
  advertiserId?: number;
  loopInsertions: number;
  period: QuotePeriod;
};

export type ComputeQuoteResult =
  | { status: "unavailable" }
  | { status: "advertiser-not-found" }
  | { status: "ok"; reach: { tvs: number; blockedByCompetitor: number }; quote: Quote };

/**
 * Calcula alcance e valor de tabela de um alvo. É a conta única compartilhada
 * pela prévia do admin e pelas futuras propostas da landing/portal: assim o
 * valor mostrado não diverge entre telas.
 *
 * - `unavailable`: não há tabela de preço configurada (quem chama esconde o valor).
 * - `advertiser-not-found`: `advertiserId` informado não existe.
 * - `ok`: TVs alcançadas (rede sem a vitrine), quantas ficam de fora por
 *   concorrência dentro do alvo, e o orçamento.
 */
export async function computeQuote(input: ComputeQuoteInput): Promise<ComputeQuoteResult> {
  const { advertiserId, loopInsertions, period, ...target } = input;

  const pricing = await loadPricing();
  if (!pricing) return { status: "unavailable" };

  let identity = { advertiserSegmentId: null as number | null, advertiserCompanyId: null as number | null };
  if (advertiserId !== undefined) {
    const advertiser = await loadAdvertiserIdentity(advertiserId);
    if (!advertiser) return { status: "advertiser-not-found" };
    identity = { advertiserSegmentId: advertiser.segmentId, advertiserCompanyId: advertiser.companyId };
  }

  // Mesma conta da prévia de alcance do formulário de campanha.
  const network = await loadQuoteNetwork();
  const reach = previewReach({ ...target, ...identity }, network);
  // previewReach lista concorrentes da rede inteira (para o formulário marcá-los
  // antes da seleção). No orçamento o número fala do alvo escolhido: só conta
  // a TV de concorrente que o alvo alcançaria.
  const competitors = new Set(reach.competitorDeviceIds);
  const blockedByCompetitor = network.filter((d) => competitors.has(d.id) && campaignReachesDevice(target, d)).length;
  return {
    status: "ok",
    reach: { tvs: reach.reachedCount, blockedByCompetitor },
    quote: quote(pricing, { tvs: reach.reachedCount, loopInsertions, period }),
  };
}
