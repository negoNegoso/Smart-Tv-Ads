import { pgTable, text, serial, timestamp, integer, index, boolean } from "drizzle-orm/pg-core";
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
    // "landscape" | "portrait_right" | "portrait_left". Retrato = TV comum
    // girada na parede; o sentido diz ao player para que lado girar.
    orientation: text("orientation").notNull().default("landscape"),
    deviceKey: text("device_key").notNull().unique(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    // TV vitrine da landing: recebe toda campanha no ar, sem alvo nem
    // concorrência, e é espelhada na página pública. Uma por orientação de
    // tela — a regra fica no PATCH /devices/:id (retrato tem dois valores).
    showcase: boolean("showcase").notNull().default(false),
    // Link do YouTube (vídeo ou playlist) que toca em fundo na TV, só o áudio.
    // Guardado como o admin colou; tipo e ID saem do parser na hora do feed.
    // Nulo = TV sem música.
    musicUrl: text("music_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  // Mesma rota pública: telas ativas nas últimas 24h.
  (t) => [index("devices_last_seen_idx").on(t.lastSeenAt)],
);

export const insertDeviceSchema = createInsertSchema(devicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devicesTable.$inferSelect;
