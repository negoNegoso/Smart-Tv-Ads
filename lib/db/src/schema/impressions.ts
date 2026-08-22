import { pgTable, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";
import { announcementsTable } from "./announcements";

export const impressionsTable = pgTable("impressions", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  announcementId: integer("announcement_id").notNull().references(() => announcementsTable.id, { onDelete: "cascade" }),
  durationSeconds: real("duration_seconds").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Impression = typeof impressionsTable.$inferSelect;
