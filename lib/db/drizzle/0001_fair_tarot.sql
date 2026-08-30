CREATE TABLE "segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "segments_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "segment_id" integer;--> statement-breakpoint
ALTER TABLE "advertisers" ADD COLUMN "segment_id" integer;--> statement-breakpoint
ALTER TABLE "advertisers" ADD COLUMN "client_id" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advertisers" ADD CONSTRAINT "advertisers_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advertisers" ADD CONSTRAINT "advertisers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "segments" ("slug", "name") VALUES
	('padaria', 'Padaria'),
	('farmacia', 'Farmácia'),
	('mercado', 'Mercado'),
	('restaurante', 'Restaurante'),
	('lanchonete', 'Lanchonete'),
	('academia', 'Academia'),
	('salao-de-beleza', 'Salão de beleza'),
	('barbearia', 'Barbearia'),
	('pet-shop', 'Pet shop'),
	('oficina-mecanica', 'Oficina mecânica'),
	('loja-de-roupas', 'Loja de roupas'),
	('imobiliaria', 'Imobiliária')
ON CONFLICT ("slug") DO NOTHING;
