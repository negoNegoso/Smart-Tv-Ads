import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { campaignsTable } from "./campaigns";
import { segmentsTable } from "./segments";

// Segmentos mirados pela campanha no modo `segments`: a peça entra em toda TV
// cujo dono é de um desses ramos, inclusive nas cadastradas depois.
export const campaignSegmentsTable = pgTable(
  "campaign_segments",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
    segmentId: integer("segment_id").notNull().references(() => segmentsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("campaign_segment_unique").on(t.campaignId, t.segmentId)],
);

export type CampaignSegment = typeof campaignSegmentsTable.$inferSelect;
