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
    // Versão do app Android no último contato, lida do User-Agent
    // (`SignageApp/<versão>`). Nulo = TV aberta em navegador, ou que nunca falou.
    appVersion: text("app_version"),
    // Quando o admin mandou esta TV checar atualização do app. O feed leva o
    // aviso à TV enquanto o pedido tem menos de 15 minutos. Nulo = nunca pediu.
    updateRequestedAt: timestamp("update_requested_at", { withTimezone: true }),
    // TV vitrine da landing: recebe toda campanha no ar, sem alvo nem
    // concorrência, e é espelhada na página pública. Uma por orientação de
    // tela — a regra fica no PATCH /devices/:id (retrato tem dois valores).
    showcase: boolean("showcase").notNull().default(false),
    // Link do YouTube (vídeo ou playlist) que toca em fundo na TV, só o áudio.
    // Guardado como o admin colou; tipo e ID saem do parser na hora do feed.
    // Nulo = TV sem música.
    musicUrl: text("music_url"),
    // Slide de clima e hora na volta desta TV. Desligado por padrão: nada
    // muda numa loja até o admin ligar.
    showWeather: boolean("show_weather").notNull().default(false),
    // Recados que correm na faixa do rodapé desta TV (até 5, até 80
    // caracteres cada; a API valida). Vazio = TV sem faixa.
    tickerMessages: text("ticker_messages").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  // Mesma rota pública: telas ativas nas últimas 24h.
  (t) => [index("devices_last_seen_idx").on(t.lastSeenAt)],
);

export const insertDeviceSchema = createInsertSchema(devicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devicesTable.$inferSelect;
