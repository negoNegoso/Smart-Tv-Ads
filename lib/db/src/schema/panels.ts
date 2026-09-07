import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

/** Tipos de painel que o cliente monta sozinho no portal. */
export const PANEL_KINDS = ["menu", "promo", "notice"] as const;
export type PanelKind = (typeof PANEL_KINDS)[number];

export const PANEL_STATUSES = ["draft", "published"] as const;
export type PanelStatus = (typeof PANEL_STATUSES)[number];

export const panelsTable = pgTable(
  "panels",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    // "menu" | "promo" | "notice"
    kind: text("kind").notNull(),
    // Rótulo interno do portal; não vai para a tela da TV.
    name: text("name").notNull(),
    template: text("template").notNull(),
    // "draft" | "published"
    status: text("status").notNull().default("draft"),
    // Segundos por slide gerado a partir deste painel.
    duration: integer("duration").notNull().default(10),
    headline: text("headline"),
    body: text("body"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // display.ts consulta por cliente + status a cada 60s por TV.
  (t) => [index("panels_client_status_idx").on(t.clientId, t.status)],
);

export const insertPanelSchema = createInsertSchema(panelsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPanel = z.infer<typeof insertPanelSchema>;
export type Panel = typeof panelsTable.$inferSelect;
