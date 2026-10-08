ALTER TABLE "devices" ADD COLUMN "storage_free_bytes" bigint;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "storage_total_bytes" bigint;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "cache_bytes" bigint;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "cache_files" integer;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "storage_reported_at" timestamp with time zone;