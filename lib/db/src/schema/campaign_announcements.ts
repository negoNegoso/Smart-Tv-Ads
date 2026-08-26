import { pgTable, serial, integer, unique } from "drizzle-orm/pg-core";
import { campaignsTable } from "./campaigns";
import { announcementsTable } from "./announcements";

export const campaignAnnouncementsTable = pgTable(
  "campaign_announcements",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
    announcementId: integer("announcement_id").notNull().references(() => announcementsTable.id, { onDelete: "cascade" }),
  },
  (t) => [unique("campaign_announcement_unique").on(t.campaignId, t.announcementId)],
);
