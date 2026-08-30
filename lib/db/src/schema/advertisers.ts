import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { segmentsTable } from "./segments";
import { clientsTable } from "./clients";

export const advertisersTable = pgTable("advertisers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  // Ramo do anunciante. Nulo mantém o comportamento antigo: nenhum bloqueio.
  segmentId: integer("segment_id").references(() => segmentsTable.id, { onDelete: "set null" }),
  // Cliente dono deste anunciante, quando a mesma empresa tem TV e anuncia.
  // É a exceção da regra de concorrência: a peça toca na TV da própria loja.
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAdvertiserSchema = createInsertSchema(advertisersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAdvertiser = z.infer<typeof insertAdvertiserSchema>;
export type Advertiser = typeof advertisersTable.$inferSelect;
