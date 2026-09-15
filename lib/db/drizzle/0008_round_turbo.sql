ALTER TABLE "clients" ADD COLUMN "company_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "advertisers" ADD COLUMN "company_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advertisers" ADD CONSTRAINT "advertisers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_unique" UNIQUE("company_id");--> statement-breakpoint
ALTER TABLE "advertisers" ADD CONSTRAINT "advertisers_company_id_unique" UNIQUE("company_id");