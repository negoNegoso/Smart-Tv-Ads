CREATE TABLE "campaign_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"segment_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_segment_unique" UNIQUE("campaign_id","segment_id")
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "target_mode" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_segments" ADD CONSTRAINT "campaign_segments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_segments" ADD CONSTRAINT "campaign_segments_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
UPDATE "campaigns" SET "target_mode" = CASE WHEN "all_devices" THEN 'all' ELSE 'devices' END;
