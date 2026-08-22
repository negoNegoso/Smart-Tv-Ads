import { pgTable, serial, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { devicesTable } from "./devices";
import { announcementsTable } from "./announcements";

export const devicePlaylistTable = pgTable(
  "device_playlist",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
    announcementId: integer("announcement_id").notNull().references(() => announcementsTable.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("device_announcement_unique").on(t.deviceId, t.announcementId)]
);

export const insertDevicePlaylistSchema = createInsertSchema(devicePlaylistTable).omit({ id: true, createdAt: true });
export type InsertDevicePlaylist = z.infer<typeof insertDevicePlaylistSchema>;
export type DevicePlaylist = typeof devicePlaylistTable.$inferSelect;
