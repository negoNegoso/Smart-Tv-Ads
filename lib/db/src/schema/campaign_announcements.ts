import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { campaignsTable } from "./campaigns";
import { announcementsTable } from "./announcements";

export const campaignAnnouncementsTable = pgTable(
  "campaign_announcements",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
    announcementId: integer("announcement_id").notNull().references(() => announcementsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("campaign_announcement_unique").on(t.campaignId, t.announcementId)],
);
