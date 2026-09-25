// lib/db/src/schema/companies.ts
import { pgTable, text, serial, timestamp, integer, doublePrecision, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { segmentsTable } from "./segments";

/** Situação cadastral. Só organização: não tira nada do ar. */
export const COMPANY_STATUSES = ["active", "paused", "closed"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

// Empresa é o cadastro único. Ser dona de TV (clients) ou anunciar
// (advertisers) são perfis ligados a ela — a mesma loja não se repete.
export const companiesTable = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    // Ramo da empresa: chave da regra de concorrência nos dois papéis.
    segmentId: integer("segment_id").references(() => segmentsTable.id, { onDelete: "set null" }),
    // "active" | "paused" | "closed"
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    // 8 dígitos, sem máscara.
    cep: text("cep"),
    street: text("street"),
    number: text("number"),
    complement: text("complement"),
    district: text("district"),
    city: text("city"),
    // UF, duas letras.
    state: text("state"),
    cityIbge: text("city_ibge"),
    // Centro do CEP; nulos quando a API não devolve coordenada.
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    // Identidade da loja usada pelos encartes. Fica na empresa, não no
    // painel, para todo encarte já nascer com a cara da marca.
    logoUrl: text("logo_url"),
    // Texto livre, até 2 linhas ("Seg a sáb 8h às 20h30").
    openingHours: text("opening_hours"),
    // "#RRGGBB". Nulos usam o verde/amarelo padrão do encarte.
    brandColor: text("brand_color"),
    brandAccentColor: text("brand_accent_color"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("companies_status_idx").on(t.status), index("companies_segment_idx").on(t.segmentId)],
);

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
