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
