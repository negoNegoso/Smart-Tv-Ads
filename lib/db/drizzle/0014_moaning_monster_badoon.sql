ALTER TABLE "panel_slides" DROP CONSTRAINT "panel_slides_panel_page_unique";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "opening_hours" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "brand_accent_color" text;--> statement-breakpoint
ALTER TABLE "panels" ADD COLUMN "campaign_id" integer;--> statement-breakpoint
ALTER TABLE "panels" ADD COLUMN "art_outdated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "panel_items" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "panel_items" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "panel_slides" ADD COLUMN "orientation" text DEFAULT 'landscape' NOT NULL;--> statement-breakpoint
ALTER TABLE "panels" ADD CONSTRAINT "panels_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panel_slides" ADD CONSTRAINT "panel_slides_panel_page_orientation_unique" UNIQUE("panel_id","page_no","orientation");