import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const devicesTable = pgTable(
  "devices",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    location: text("location"),
    deviceKey: text("device_key").notNull().unique(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  // Mesma rota pública: telas ativas nas últimas 24h.
  (t) => [index("devices_last_seen_idx").on(t.lastSeenAt)],
);

export const insertDeviceSchema = createInsertSchema(devicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devicesTable.$inferSelect;
