import { pgTable, serial, integer, real, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";
import { announcementsTable } from "./announcements";
import { campaignsTable } from "./campaigns";

export const playsTable = pgTable(
  "plays",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
    announcementId: integer("announcement_id").notNull().references(() => announcementsTable.id, { onDelete: "cascade" }),
    campaignId: integer("campaign_id").references(() => campaignsTable.id, { onDelete: "set null" }),
    durationSeconds: real("duration_seconds").notNull().default(0),
    // Código que a TV gera para cada exibição da fila de reenvio. Nulo nas
    // linhas antigas e no endpoint antigo (um por vez). Com o índice único
    // abaixo, um lote reenviado porque a resposta se perdeu não conta duas vezes.
    clientPlayId: text("client_play_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // plays é a tabela que mais cresce (uma linha por exibição por tela) e a
  // contagem de 30 dias da landing roda sem sessão. Sem este índice, qualquer
  // requisição que escape do CDN é um sequential scan na maior tabela.
  //
  // Os dois compostos servem os portais: lá o filtro é sempre "esta campanha
  // (ou esta TV) dentro desta janela", e o índice só de created_at obrigaria a
  // ler todas as exibições do período para depois descartar as de outros.
  (t) => [
    index("plays_created_idx").on(t.createdAt),
    index("plays_campaign_created_idx").on(t.campaignId, t.createdAt),
    index("plays_device_created_idx").on(t.deviceId, t.createdAt),
    // Postgres aceita vários NULL num índice único: as linhas antigas não
    // conflitam entre si.
    uniqueIndex("plays_device_client_play_idx").on(t.deviceId, t.clientPlayId),
  ],
);

export type Play = typeof playsTable.$inferSelect;
