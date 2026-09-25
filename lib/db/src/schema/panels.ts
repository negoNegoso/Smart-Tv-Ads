import { pgTable, text, serial, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { campaignsTable } from "./campaigns";

/** Tipos de painel que o cliente monta sozinho no portal. */
export const PANEL_KINDS = ["menu", "promo", "notice", "flyer"] as const;
export type PanelKind = (typeof PANEL_KINDS)[number];

export const PANEL_STATUSES = ["draft", "published"] as const;
export type PanelStatus = (typeof PANEL_STATUSES)[number];

/** Como a promoção mostra o desconto: DE/POR ou porcentagem. */
export const PROMO_STYLES = ["price", "percent"] as const;
export type PromoStyle = (typeof PROMO_STYLES)[number];

export const panelsTable = pgTable(
  "panels",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    // "menu" | "promo" | "notice" | "flyer"
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
    // Cor do painel da promoção, "#RRGGBB". Nulo usa a cor padrão do template.
    accentColor: text("accent_color"),
    // "price" | "percent". Nulo vale "price". Só o template de promoção lê.
    promoStyle: text("promo_style"),
    // Enquadramento vertical da foto da promoção, 0 a 100 (0 = topo, 100 = rodapé). Nulo vale 50 (centro).
    photoOffset: integer("photo_offset"),
    // Enquadramento horizontal da foto da promoção, 0 a 100 (0 = esquerda, 100 = direita). Nulo vale 50 (centro).
    photoOffsetX: integer("photo_offset_x"),
    // Destino que o editor pediu para o encarte: nulo = TVs da loja,
    // preenchido = dentro desta campanha. O que vale na TV é o destino da
    // última publicação (peças em campaign_announcements), não esta coluna.
    campaignId: integer("campaign_id").references(() => campaignsTable.id, { onDelete: "set null" }),
    // A republicação automática (datas da campanha mudaram) falhou: a arte no
    // ar mostra datas velhas. Zerada a cada publicação bem-sucedida.
    artOutdated: boolean("art_outdated").notNull().default(false),
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
