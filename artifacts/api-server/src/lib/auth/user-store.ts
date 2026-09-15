// artifacts/api-server/src/lib/auth/user-store.ts
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  userClientsTable,
  userAdvertisersTable,
  type User,
} from "@workspace/db";
import { removesLastAdmin } from "./admin-guard";

export interface AuthContext {
  userId: number;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  clientIds: number[];
  advertiserIds: number[];
}

/** Recusa tirar do banco o último admin ativo. */
export class LastAdminError extends Error {
  constructor() {
    super("Não dá para remover o último administrador ativo.");
  }
}

async function countActiveAdmins(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(and(eq(usersTable.isAdmin, true), eq(usersTable.isActive, true)));
  return row?.n ?? 0;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function findUserById(id: number): Promise<User | null> {
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function loadAuthContext(userId: number): Promise<AuthContext | null> {
  const user = await findUserById(userId);
  if (!user) return null;
  const clients = await db
    .select({ clientId: userClientsTable.clientId })
    .from(userClientsTable)
    .where(eq(userClientsTable.userId, userId));
  const advertisers = await db
    .select({ advertiserId: userAdvertisersTable.advertiserId })
    .from(userAdvertisersTable)
    .where(eq(userAdvertisersTable.userId, userId));
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    clientIds: clients.map((c) => c.clientId),
    advertiserIds: advertisers.map((a) => a.advertiserId),
  };
}

export async function setPassword(userId: number, passwordHash: string): Promise<void> {
  await db
    .update(usersTable)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(usersTable.id, userId));
}

export interface UserAccountRow {
  id: number;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  clientIds: number[];
  advertiserIds: number[];
}

async function linksFor(userId: number): Promise<{ clientIds: number[]; advertiserIds: number[] }> {
  const clients = await db.select({ clientId: userClientsTable.clientId }).from(userClientsTable).where(eq(userClientsTable.userId, userId));
  const advertisers = await db.select({ advertiserId: userAdvertisersTable.advertiserId }).from(userAdvertisersTable).where(eq(userAdvertisersTable.userId, userId));
  return { clientIds: clients.map((c) => c.clientId), advertiserIds: advertisers.map((a) => a.advertiserId) };
}

function accountRow(u: User, links: { clientIds: number[]; advertiserIds: number[] }): UserAccountRow {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    isAdmin: u.isAdmin,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    ...links,
  };
}

export async function listUsers(): Promise<UserAccountRow[]> {
  const rows = await db.select().from(usersTable).orderBy(usersTable.email);
  const out: UserAccountRow[] = [];
  for (const u of rows) out.push(accountRow(u, await linksFor(u.id)));
  return out;
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  name: string | null;
  isAdmin: boolean;
  clientIds: number[];
  advertiserIds: number[];
}): Promise<UserAccountRow> {
  const [u] = await db
    .insert(usersTable)
    .values({ email: input.email, passwordHash: input.passwordHash, name: input.name, isAdmin: input.isAdmin })
    .returning();
  await replaceLinks(u.id, input.clientIds, input.advertiserIds);
  return accountRow(u, await linksFor(u.id));
}

export async function replaceLinks(userId: number, clientIds: number[], advertiserIds: number[]): Promise<void> {
  await db.delete(userClientsTable).where(eq(userClientsTable.userId, userId));
  await db.delete(userAdvertisersTable).where(eq(userAdvertisersTable.userId, userId));
  if (clientIds.length) await db.insert(userClientsTable).values(clientIds.map((clientId) => ({ userId, clientId })));
  if (advertiserIds.length) await db.insert(userAdvertisersTable).values(advertiserIds.map((advertiserId) => ({ userId, advertiserId })));
}

export async function updateUser(
  id: number,
  patch: { name?: string | null; isAdmin?: boolean; isActive?: boolean; clientIds?: number[]; advertiserIds?: number[] },
): Promise<UserAccountRow | null> {
  const existing = await findUserById(id);
  if (!existing) return null;
  if (removesLastAdmin(existing, patch, await countActiveAdmins())) throw new LastAdminError();
  const set: Partial<Pick<User, "name" | "isAdmin" | "isActive">> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (typeof patch.isAdmin === "boolean") set.isAdmin = patch.isAdmin;
  if (typeof patch.isActive === "boolean") set.isActive = patch.isActive;
  if (Object.keys(set).length) await db.update(usersTable).set(set).where(eq(usersTable.id, id));
  if (patch.clientIds || patch.advertiserIds) {
    const links = await linksFor(id);
    await replaceLinks(id, patch.clientIds ?? links.clientIds, patch.advertiserIds ?? links.advertiserIds);
  }
  const u = await findUserById(id);
  return u ? accountRow(u, await linksFor(id)) : null;
}

export async function resetPassword(id: number, passwordHash: string): Promise<boolean> {
  const [row] = await db.update(usersTable).set({ passwordHash, mustChangePassword: true }).where(eq(usersTable.id, id)).returning();
  return !!row;
}

export async function deleteUser(id: number): Promise<boolean> {
  const existing = await findUserById(id);
  if (!existing) return false;
  if (removesLastAdmin(existing, { deleting: true }, await countActiveAdmins())) throw new LastAdminError();
  const [row] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  return !!row;
}
