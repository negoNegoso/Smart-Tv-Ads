// artifacts/api-server/src/lib/auth/user-store.ts
import { eq } from "drizzle-orm";
import {
  db,
  usersTable,
  userClientsTable,
  userAdvertisersTable,
  type User,
} from "@workspace/db";

export interface AuthContext {
  userId: number;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  clientIds: number[];
  advertiserIds: number[];
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

export async function listUsers(): Promise<UserAccountRow[]> {
  const rows = await db.select().from(usersTable).orderBy(usersTable.email);
  const out: UserAccountRow[] = [];
  for (const u of rows) {
    const links = await linksFor(u.id);
    out.push({ id: u.id, email: u.email, isActive: u.isActive, mustChangePassword: u.mustChangePassword, ...links });
  }
  return out;
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  clientIds: number[];
  advertiserIds: number[];
}): Promise<UserAccountRow> {
  const [u] = await db.insert(usersTable).values({ email: input.email, passwordHash: input.passwordHash }).returning();
  await replaceLinks(u.id, input.clientIds, input.advertiserIds);
  const links = await linksFor(u.id);
  return { id: u.id, email: u.email, isActive: u.isActive, mustChangePassword: u.mustChangePassword, ...links };
}

export async function replaceLinks(userId: number, clientIds: number[], advertiserIds: number[]): Promise<void> {
  await db.delete(userClientsTable).where(eq(userClientsTable.userId, userId));
  await db.delete(userAdvertisersTable).where(eq(userAdvertisersTable.userId, userId));
  if (clientIds.length) await db.insert(userClientsTable).values(clientIds.map((clientId) => ({ userId, clientId })));
  if (advertiserIds.length) await db.insert(userAdvertisersTable).values(advertiserIds.map((advertiserId) => ({ userId, advertiserId })));
}

export async function updateUser(id: number, patch: { isActive?: boolean; clientIds?: number[]; advertiserIds?: number[] }): Promise<UserAccountRow | null> {
  const existing = await findUserById(id);
  if (!existing) return null;
  if (typeof patch.isActive === "boolean") {
    await db.update(usersTable).set({ isActive: patch.isActive }).where(eq(usersTable.id, id));
  }
  if (patch.clientIds || patch.advertiserIds) {
    const links = await linksFor(id);
    await replaceLinks(id, patch.clientIds ?? links.clientIds, patch.advertiserIds ?? links.advertiserIds);
  }
  const u = await findUserById(id);
  if (!u) return null;
  const links = await linksFor(id);
  return { id: u.id, email: u.email, isActive: u.isActive, mustChangePassword: u.mustChangePassword, ...links };
}

export async function resetPassword(id: number, passwordHash: string): Promise<boolean> {
  const [row] = await db.update(usersTable).set({ passwordHash, mustChangePassword: true }).where(eq(usersTable.id, id)).returning();
  return !!row;
}

export async function deleteUser(id: number): Promise<boolean> {
  const [row] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  return !!row;
}
