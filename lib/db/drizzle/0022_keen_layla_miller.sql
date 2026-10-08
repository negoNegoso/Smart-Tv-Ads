ALTER TABLE "devices" ADD COLUMN "show_weather" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Peça de sistema do slide de clima e hora: existe só para a TV ter um
-- announcement_id ao registrar a exibição (que o servidor descarta).
INSERT INTO "announcements" ("title", "media_kind", "orientation", "source", "duration", "is_active")
SELECT 'Clima e hora', 'image', 'landscape', 'editorial', 10, true
WHERE NOT EXISTS (SELECT 1 FROM "announcements" WHERE "source" = 'editorial');
