import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { announcementsTable } from "./announcements";

/**
 * Aviso urgente do admin: toma as TVs do alvo até `ends_at` (no máximo 24h
 * depois da criação) ou até ser encerrado (`ended_at`). Alvo em arrays na
 * própria linha: o aviso vive horas, não é editado e o feed lê tudo de uma vez.
 */
export const urgentAlertsTable = pgTable(
  "urgent_alerts",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body"),
    // "all" | "segments" | "companies"
    targetMode: text("target_mode").notNull(),
    segmentIds: integer("segment_ids").array().notNull().default([]),
    companyIds: integer("company_ids").array().notNull().default([]),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    // As duas artes geradas na criação. Peça apagada vira nulo e a TV daquela
    // orientação segue a programação normal.
    landscapeAnnouncementId: integer("landscape_announcement_id").references(() => announcementsTable.id, { onDelete: "set null" }),
    portraitAnnouncementId: integer("portrait_announcement_id").references(() => announcementsTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Toda TV consulta os avisos não vencidos a cada busca do feed.
  (t) => [index("urgent_alerts_ends_at_idx").on(t.endsAt)],
);

export type UrgentAlert = typeof urgentAlertsTable.$inferSelect;
