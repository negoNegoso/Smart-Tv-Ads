import { eq } from "drizzle-orm";
import { db, clientsTable, companiesTable } from "@workspace/db";
import { formatStoreAddress } from "./flyer-format";

export interface StoreIdentity {
  clientId: number;
  companyName: string;
  logoUrl: string | null;
  openingHours: string | null;
  brandColor: string | null;
  brandAccentColor: string | null;
  /** Só leitura: vem do cadastro da empresa. */
  address: string | null;
}

async function companyIdOf(clientId: number): Promise<number | null> {
  const [row] = await db.select({ companyId: clientsTable.companyId }).from(clientsTable).where(eq(clientsTable.id, clientId));
  return row?.companyId ?? null;
}

export async function getStoreIdentity(clientId: number): Promise<StoreIdentity | null> {
  const companyId = await companyIdOf(clientId);
  if (companyId === null) return null;
  const [c] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
  if (!c) return null;
  return {
    clientId,
    companyName: c.name,
    logoUrl: c.logoUrl,
    openingHours: c.openingHours,
    brandColor: c.brandColor,
    brandAccentColor: c.brandAccentColor,
    address: formatStoreAddress(c),
  };
}

/** Grava na empresa: vale para todos os encartes da loja (e das outras lojas da mesma empresa). */
export async function updateStoreIdentity(
  clientId: number,
  patch: Partial<Pick<StoreIdentity, "logoUrl" | "openingHours" | "brandColor" | "brandAccentColor">>,
): Promise<StoreIdentity | null> {
  const companyId = await companyIdOf(clientId);
  if (companyId === null) return null;
  if (Object.keys(patch).length > 0) {
    await db.update(companiesTable).set(patch).where(eq(companiesTable.id, companyId));
  }
  return getStoreIdentity(clientId);
}
