import { pgTable, text, serial, integer, boolean, real, smallint, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { advertisersTable } from "./advertisers";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  advertiserId: integer("advertiser_id").notNull().references(() => advertisersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  contractValue: real("contract_value").notNull().default(0),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  // Alvo da campanha: "all" | "devices" | "segments". Fonte da verdade.
  targetMode: text("target_mode").notNull().default("all"),
  // Mantida em sincronia com `targetMode === "all"` só para não quebrar a
  // versão anterior do servidor durante o deploy. Ninguém lê mais daqui;
  // a coluna sai numa migration posterior.
  allDevices: boolean("all_devices").notNull().default(true),
  // Dias da semana em que a campanha vai ao ar (0 = domingo … 6 = sábado).
  // Lista vazia é "todo dia": mantém as campanhas antigas rodando como antes.
  weekdays: smallint("weekdays").array().notNull().default([]),
  // Faixas do dia em que a campanha vai ao ar, em minutos desde 00:00 no fuso
  // do negócio: [{ start: 420, end: 600 }] = 07:00–10:00. Fim exclusivo; 1440
  // = 24:00. Lista vazia é "dia todo": mantém as campanhas antigas como estavam.
  timeWindows: jsonb("time_windows").$type<Array<{ start: number; end: number }>>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;