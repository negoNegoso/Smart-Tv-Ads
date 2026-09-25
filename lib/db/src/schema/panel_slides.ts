import { pgTable, serial, integer, text, index, unique } from "drizzle-orm/pg-core";
import { panelsTable } from "./panels";
import { announcementsTable } from "./announcements";

/** Orientações que o encarte gera em toda publicação. */
export const FLYER_ORIENTATIONS = ["landscape", "portrait"] as const;
export type FlyerOrientation = (typeof FLYER_ORIENTATIONS)[number];

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
    // Cardápio/promoção/aviso só geram "landscape"; o encarte gera as duas,
    // com a mesma numeração de página em cada uma.
    orientation: text("orientation").notNull().default("landscape"),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcementsTable.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("panel_slides_panel_idx").on(t.panelId),
    unique("panel_slides_panel_page_orientation_unique").on(t.panelId, t.pageNo, t.orientation),
  ],
);

export type PanelSlide = typeof panelSlidesTable.$inferSelect;
