ALTER TABLE "plays" ADD COLUMN "client_play_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "plays_device_client_play_idx" ON "plays" USING btree ("device_id","client_play_id");