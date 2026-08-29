import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  // Texto que vai ao ar na TV. Separado do `title`, que é só rótulo interno do painel.
  displayText: text("display_text"),
  showText: boolean("show_text").notNull().default(false),
  // Imagem da peça. Para peças de YouTube é opcional (fallback custom); quando
  // ausente, o poster é derivado da thumbnail do YouTube.
  imageUrl: text("image_url"),
  // "image" | "youtube_video" | "youtube_playlist"
  mediaKind: text("media_kind").notNull().default("image"),
  // ID do vídeo ou da playlist do YouTube (null para imagem).
  youtubeId: text("youtube_id"),
  // "natural" (toca até o fim) | "capped" (limita a `duration` segundos).
  playbackMode: text("playback_mode").notNull().default("capped"),
  // "muted" | "sound" (tenta com som; se autoplay com som falhar, segue mudo).
  audioMode: text("audio_mode").notNull().default("muted"),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  duration: integer("duration").notNull().default(10),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAnnouncementSchema = createInsertSchema(announcementsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcementsTable.$inferSelect;
