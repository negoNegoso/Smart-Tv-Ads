import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Ramo de atuação (padaria, farmácia, mercado...). Serve de chave para a regra
// de concorrência: anunciante e dono da TV com o mesmo segmento não se cruzam.
export const segmentsTable = pgTable("segments", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSegmentSchema = createInsertSchema(segmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSegment = z.infer<typeof insertSegmentSchema>;
export type Segment = typeof segmentsTable.$inferSelect;
