import { pgTable, serial, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { campaignsTable } from "./campaigns";
import { announcementsTable } from "./announcements";
import { campaignAnnouncementsTable } from "./campaign_announcements";

export const scansTable = pgTable(
  "scans",
  {
    id: serial("id").primaryKey(),
    campaignAnnouncementId: integer("campaign_announcement_id").references(() => campaignAnnouncementsTable.id, { onDelete: "set null" }),
    campaignId: integer("campaign_id").references(() => campaignsTable.id, { onDelete: "set null" }),
    announcementId: integer("announcement_id").references(() => announcementsTable.id, { onDelete: "set null" }),
    visitorId: text("visitor_id"),
    fingerprint: text("fingerprint"),
    userAgent: text("user_agent"),
    isBot: boolean("is_bot").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("scans_campaign_created_idx").on(t.campaignId, t.createdAt),
    index("scans_announcement_created_idx").on(t.announcementId, t.createdAt),
  ],
);

export type Scan = typeof scansTable.$inferSelect;
