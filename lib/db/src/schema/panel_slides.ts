import { pgTable, serial, integer, index, unique } from "drizzle-orm/pg-core";
import { panelsTable } from "./panels";
import { announcementsTable } from "./announcements";

/**
 * Rastro da renderização: liga o painel às peças geradas na última publicação.
 * Sem ele, republicar acumula PNG e `announcements` órfãs — é esta tabela que
 * diz o que apagar.
 */
export const panelSlidesTable = pgTable(
  "panel_slides",
  {
    id: serial("id").primaryKey(),
    panelId: integer("panel_id")
      .notNull()
      .references(() => panelsTable.id, { onDelete: "cascade" }),
    pageNo: integer("page_no").notNull(),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcementsTable.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("panel_slides_panel_idx").on(t.panelId),
    unique("panel_slides_panel_page_unique").on(t.panelId, t.pageNo),
  ],
);

export type PanelSlide = typeof panelSlidesTable.$inferSelect;
