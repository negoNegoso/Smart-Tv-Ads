import { eq } from "drizzle-orm";
import { db, advertisersTable, campaignsTable, clientsTable, companiesTable, type PanelItem } from "@workspace/db";
import { flyerValidityLabel, formatStoreAddress, normalizeUnit } from "./flyer-format";
import type { FlyerRenderInput, FlyerRenderItem } from "./flyer-template";

export interface FlyerCompany {
  name: string;
  logoUrl: string | null;
  openingHours: string | null;
  brandColor: string | null;
  brandAccentColor: string | null;
  street: string | null;
  number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
}
export interface FlyerCampaign {
  id: number;
  startsAt: Date;
  endsAt: Date;
}
export interface FlyerContext {
  company: FlyerCompany;
  campaign: FlyerCampaign | null;
}

/** Campanha escolhida não é de anunciante da mesma empresa da loja. */
export class FlyerCampaignMismatchError extends Error {}

/**
 * Empresa dona da loja e, se o encarte vai para uma campanha, as datas dela.
 * A posse da campanha é conferida de novo aqui (a rota já confere no PATCH):
 * a campanha pode ter mudado de anunciante depois de escolhida.
 */
export async function loadFlyerContext(panel: { clientId: number; campaignId: number | null }): Promise<FlyerContext> {
  const [company] = await db
    .select({
      id: companiesTable.id,
      name: companiesTable.name,
      logoUrl: companiesTable.logoUrl,
      openingHours: companiesTable.openingHours,
      brandColor: companiesTable.brandColor,
      brandAccentColor: companiesTable.brandAccentColor,
      street: companiesTable.street,
      number: companiesTable.number,
      district: companiesTable.district,
      city: companiesTable.city,
      state: companiesTable.state,
    })
    .from(clientsTable)
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(eq(clientsTable.id, panel.clientId));
  if (!company) throw new Error("Loja do encarte não encontrada.");

  let campaign: FlyerCampaign | null = null;
  if (panel.campaignId !== null) {
    const [row] = await db
      .select({ id: campaignsTable.id, startsAt: campaignsTable.startsAt, endsAt: campaignsTable.endsAt, companyId: advertisersTable.companyId })
      .from(campaignsTable)
      .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
      .where(eq(campaignsTable.id, panel.campaignId));
    if (!row || row.companyId !== company.id) {
      throw new FlyerCampaignMismatchError("A campanha escolhida não é desta loja.");
    }
    campaign = { id: row.id, startsAt: row.startsAt, endsAt: row.endsAt };
  }
  const { id: _id, ...rest } = company;
  return { company: rest, campaign };
}

export function buildFlyerInput(
  panel: { headline: string | null; body: string | null },
  ctx: FlyerContext,
  logoDataUri: string | null,
): FlyerRenderInput {
  const c = ctx.company;
  return {
    headline: panel.headline,
    body: panel.body,
    validity: ctx.campaign ? flyerValidityLabel(ctx.campaign.startsAt, ctx.campaign.endsAt) : null,
    store: {
      name: c.name,
      logoUrl: logoDataUri,
      openingHours: c.openingHours?.trim() || null,
      address: formatStoreAddress(c),
      brandColor: c.brandColor,
      brandAccentColor: c.brandAccentColor,
    },
  };
}

export function toFlyerItem(item: PanelItem, imageDataUri: string | null): FlyerRenderItem {
  return {
    name: item.name,
    priceCents: item.priceCents,
    oldPriceCents: item.oldPriceCents,
    unit: normalizeUnit(item.unit),
    imageUrl: imageDataUri,
  };
}
