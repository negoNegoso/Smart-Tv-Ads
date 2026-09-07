import { pgTable, text, serial, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { panelsTable } from "./panels";

export const panelItemsTable = pgTable(
  "panel_items",
  {
    id: serial("id").primaryKey(),
    panelId: integer("panel_id")
      .notNull()
      .references(() => panelsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Centavos. Float erra centavo em soma e formatação, e este número é o
    // preço que o lojista mostra ao consumidor dele.
    priceCents: integer("price_cents").notNull().default(0),
    // O "de" do "de/por". Nulo quando não há preço antigo.
    oldPriceCents: integer("old_price_cents"),
    // Agrupa no cardápio. Nulo cai num grupo sem título.
    category: text("category"),
    // Só a promoção usa foto; o cardápio é tipográfico.
    imageUrl: text("image_url"),
    displayOrder: integer("display_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("panel_items_panel_idx").on(t.panelId)],
);

export const insertPanelItemSchema = createInsertSchema(panelItemsTable).omit({ id: true });

export type InsertPanelItem = z.infer<typeof insertPanelItemSchema>;
export type PanelItem = typeof panelItemsTable.$inferSelect;
