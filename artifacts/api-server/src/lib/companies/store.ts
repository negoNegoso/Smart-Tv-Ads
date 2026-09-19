import { and, asc, eq, ilike, isNotNull, sql, type SQL } from "drizzle-orm";
import {
  db,
  companiesTable,
  clientsTable,
  advertisersTable,
  devicesTable,
  panelsTable,
  campaignsTable,
} from "@workspace/db";
import type { CompanyFields, CreateCompanyInput } from "./input";
import type { CompanyDependencies, RolePlan } from "./roles";
import { isUniqueViolation } from "../pg-errors";

export type { CompanyDependencies } from "./roles";

export type CompanyRow = typeof companiesTable.$inferSelect & {
  clientId: number | null;
  advertiserId: number | null;
  advertiserCompany: string | null;
};

export interface CompanyDetail extends CompanyRow {
  dependencies: CompanyDependencies;
}

/** Corrida criando o mesmo perfil duas vezes: o UNIQUE(company_id) barra. */
export class CompanyConflictError extends Error {}

function rowQuery() {
  return db
    .select({
      company: companiesTable,
      clientId: clientsTable.id,
      advertiserId: advertisersTable.id,
      advertiserCompany: advertisersTable.company,
    })
    .from(companiesTable)
    .leftJoin(clientsTable, eq(clientsTable.companyId, companiesTable.id))
    .leftJoin(advertisersTable, eq(advertisersTable.companyId, companiesTable.id));
}

type RawRow = Awaited<ReturnType<typeof rowQuery>>[number];

function flatten(r: RawRow): CompanyRow {
  return { ...r.company, clientId: r.clientId, advertiserId: r.advertiserId, advertiserCompany: r.advertiserCompany };
}

export async function listCompanies(filter: {
  status?: string;
  role?: "client" | "advertiser";
  q?: string;
}): Promise<CompanyRow[]> {
  const conditions: SQL[] = [];
  if (filter.status) conditions.push(eq(companiesTable.status, filter.status));
  if (filter.role === "client") conditions.push(isNotNull(clientsTable.id));
  if (filter.role === "advertiser") conditions.push(isNotNull(advertisersTable.id));
  if (filter.q) conditions.push(ilike(companiesTable.name, `%${filter.q}%`));
  const rows = await rowQuery()
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(companiesTable.name));
  return rows.map(flatten);
}

async function dependenciesOf(clientId: number | null, advertiserId: number | null): Promise<CompanyDependencies> {
  const count = sql<number>`count(*)::int`;
  const [devices] = clientId
    ? await db.select({ n: count }).from(devicesTable).where(eq(devicesTable.clientId, clientId))
    : [{ n: 0 }];
  const [panels] = clientId
    ? await db.select({ n: count }).from(panelsTable).where(eq(panelsTable.clientId, clientId))
    : [{ n: 0 }];
  const [campaigns] = advertiserId
    ? await db.select({ n: count }).from(campaignsTable).where(eq(campaignsTable.advertiserId, advertiserId))
    : [{ n: 0 }];
  return { devices: devices.n, panels: panels.n, campaigns: campaigns.n };
}

export async function getCompany(id: number): Promise<CompanyDetail | null> {
  const [raw] = await rowQuery().where(eq(companiesTable.id, id));
  if (!raw) return null;
  const row = flatten(raw);
  return { ...row, dependencies: await dependenciesOf(row.clientId, row.advertiserId) };
}

function rethrowConflict(err: unknown): never {
  // drizzle-orm@0.45.2 embrulha o erro do driver `pg` em `DrizzleQueryError`
  // (node_modules/drizzle-orm/pg-core/session.js, `queryWithCache`): o código
  // do pg (ex.: "23505") não sobrevive em `.code` do erro relançado, só em
  // `.cause.code`. `isUniqueViolation` cobre os dois formatos.
  if (isUniqueViolation(err)) {
    throw new CompanyConflictError("A empresa já tem esse papel.");
  }
  throw err;
}

export async function createCompany(input: CreateCompanyInput): Promise<CompanyDetail> {
  const { isClient, isAdvertiser, advertiserCompany, ...fields } = input;
  const id = await db
    .transaction(async (tx) => {
      const [company] = await tx.insert(companiesTable).values(fields).returning({ id: companiesTable.id });
      if (isClient) await tx.insert(clientsTable).values({ companyId: company.id });
      if (isAdvertiser) await tx.insert(advertisersTable).values({ companyId: company.id, company: advertiserCompany });
      return company.id;
    })
    .catch(rethrowConflict);
  return (await getCompany(id))!;
}

export async function updateCompany(
  id: number,
  fields: Partial<CompanyFields>,
  plan: RolePlan,
  advertiserCompany: string | null | undefined,
): Promise<CompanyDetail> {
  await db
    .transaction(async (tx) => {
      if (Object.keys(fields).length) {
        await tx.update(companiesTable).set(fields).where(eq(companiesTable.id, id));
      }
      if (plan.createClient) await tx.insert(clientsTable).values({ companyId: id });
      if (plan.removeClient) await tx.delete(clientsTable).where(eq(clientsTable.companyId, id));
      if (plan.createAdvertiser) {
        await tx.insert(advertisersTable).values({ companyId: id, company: advertiserCompany ?? null });
      } else if (advertiserCompany !== undefined && !plan.removeAdvertiser) {
        await tx.update(advertisersTable).set({ company: advertiserCompany }).where(eq(advertisersTable.companyId, id));
      }
      if (plan.removeAdvertiser) await tx.delete(advertisersTable).where(eq(advertisersTable.companyId, id));
    })
    .catch(rethrowConflict);
  return (await getCompany(id))!;
}

export async function deleteCompany(id: number): Promise<void> {
  // Cascata remove perfis e vínculos de usuário; TVs/painéis/campanhas já
  // foram barrados pela rota.
  await db.delete(companiesTable).where(eq(companiesTable.id, id));
}
