CREATE TABLE "panels" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"template" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"duration" integer DEFAULT 10 NOT NULL,
	"headline" text,
	"body" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panel_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"panel_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"old_price_cents" integer,
	"category" text,
	"image_url" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panel_slides" (
	"id" serial PRIMARY KEY NOT NULL,
	"panel_id" integer NOT NULL,
	"page_no" integer NOT NULL,
	"announcement_id" integer NOT NULL,
	CONSTRAINT "panel_slides_panel_page_unique" UNIQUE("panel_id","page_no")
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "source" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "panels" ADD CONSTRAINT "panels_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panel_items" ADD CONSTRAINT "panel_items_panel_id_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panel_slides" ADD CONSTRAINT "panel_slides_panel_id_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panel_slides" ADD CONSTRAINT "panel_slides_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "panels_client_status_idx" ON "panels" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "panel_items_panel_idx" ON "panel_items" USING btree ("panel_id");--> statement-breakpoint
CREATE INDEX "panel_slides_panel_idx" ON "panel_slides" USING btree ("panel_id");