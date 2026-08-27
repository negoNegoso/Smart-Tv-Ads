import { pgTable, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";
import { announcementsTable } from "./announcements";
import { campaignsTable } from "./campaigns";

export const playsTable = pgTable("plays", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  announcementId: integer("announcement_id").notNull().references(() => announcementsTable.id, { onDelete: "cascade" }),
  campaignId: integer("campaign_id").references(() => campaignsTable.id, { onDelete: "set null" }),
  durationSeconds: real("duration_seconds").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Play = typeof playsTable.$inferSelect;
