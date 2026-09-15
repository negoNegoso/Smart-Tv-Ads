-- Recomeço do cadastro (decisão do dono, spec 2026-09-15): sobrevivem só
-- announcements de origem admin e segments. Nenhuma FK de announcements ou
-- segments aponta para as tabelas abaixo, então o CASCADE não os alcança.
TRUNCATE TABLE "scans", "plays", "campaign_announcements", "campaign_devices", "campaign_segments", "campaigns", "device_playlist", "panel_slides", "panel_items", "panels", "devices", "user_clients", "user_advertisers", "users", "advertisers", "clients" RESTART IDENTITY CASCADE;--> statement-breakpoint
-- Peças geradas por painel ficam sem painel para editar ou republicar.
DELETE FROM "announcements" WHERE "source" = 'panel';--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"segment_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"cep" text,
	"street" text,
	"number" text,
	"complement" text,
	"district" text,
	"city" text,
	"state" text,
	"city_ibge" text,
	"lat" double precision,
	"lng" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" DROP CONSTRAINT "clients_segment_id_segments_id_fk";
--> statement-breakpoint
ALTER TABLE "advertisers" DROP CONSTRAINT "advertisers_segment_id_segments_id_fk";
--> statement-breakpoint
ALTER TABLE "advertisers" DROP CONSTRAINT "advertisers_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_status_idx" ON "companies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "companies_segment_idx" ON "companies" USING btree ("segment_id");--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "segment_id";--> statement-breakpoint
ALTER TABLE "advertisers" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "advertisers" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "advertisers" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "advertisers" DROP COLUMN "segment_id";--> statement-breakpoint
ALTER TABLE "advertisers" DROP COLUMN "client_id";