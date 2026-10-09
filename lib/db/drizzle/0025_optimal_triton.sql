CREATE TABLE "pricing" (
	"id" integer PRIMARY KEY NOT NULL,
	"price_per_tv_cents" integer NOT NULL,
	"min_monthly_cents" integer DEFAULT 0 NOT NULL,
	"quarterly_discount_pct" integer DEFAULT 0 NOT NULL,
	"annual_discount_pct" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_single_row" CHECK ("pricing"."id" = 1)
);
