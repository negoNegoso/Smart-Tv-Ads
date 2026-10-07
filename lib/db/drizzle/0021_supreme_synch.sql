CREATE TABLE "urgent_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"target_mode" text NOT NULL,
	"segment_ids" integer[] DEFAULT '{}' NOT NULL,
	"company_ids" integer[] DEFAULT '{}' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"landscape_announcement_id" integer,
	"portrait_announcement_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "urgent_alerts" ADD CONSTRAINT "urgent_alerts_landscape_announcement_id_announcements_id_fk" FOREIGN KEY ("landscape_announcement_id") REFERENCES "public"."announcements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "urgent_alerts" ADD CONSTRAINT "urgent_alerts_portrait_announcement_id_announcements_id_fk" FOREIGN KEY ("portrait_announcement_id") REFERENCES "public"."announcements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "urgent_alerts_ends_at_idx" ON "urgent_alerts" USING btree ("ends_at");