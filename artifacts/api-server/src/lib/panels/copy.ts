import type { Panel, PanelItem } from "@workspace/db";

/**
 * Colunas do painel que a cópia leva para a outra loja. `status` e
 * `publishedAt` ficam de fora de propósito: a cópia nasce rascunho, e o
 * conteúdo de uma loja não entra no ar na TV de outra sem alguém revisar.
 */
export function panelCopyValues(source: Panel, clientId: number) {
  return {
    clientId,
    kind: source.kind,
    name: source.name,
    template: source.template,
    duration: source.duration,
    headline: source.headline,
    body: source.body,
    accentColor: source.accentColor,
    promoStyle: source.promoStyle,
    photoOffset: source.photoOffset,
    photoOffsetX: source.photoOffsetX,
  };
}

/** Itens da origem apontados para o painel novo, sem o id da origem. */
export function itemCopyValues(items: PanelItem[], panelId: number) {
  return items.map(({ id: _id, panelId: _source, ...item }) => ({ ...item, panelId }));
}
