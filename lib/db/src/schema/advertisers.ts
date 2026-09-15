import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const advertisersTable = pgTable("advertisers", {
  id: serial("id").primaryKey(),
  // Perfil de anunciante da empresa. Único: uma empresa, no máximo um perfil.
  companyId: integer("company_id")
    .notNull()
    .unique()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  // Nome comercial exibido nas campanhas; o nome da empresa vem de companies.
  company: text("company"),
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
