import { z } from "zod";
import { COMPANY_STATUSES } from "@workspace/db/schema";

/** Texto opcional: vazio ou só espaços vira null, para o banco não guardar "". */
const optionalText = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim() : null));

/**
 * Mesma normalização de `optionalText`, mas usada nos schemas de `.partial()`
 * (update). `.optional()` no lugar de `.nullish()` faz a chave sumir de vez
 * quando ausente, em vez de virar `null` explícito — senão o patch apagaria
 * campos que o cliente não mandou.
 */
const optionalTextPatch = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : v && v.trim() ? v.trim() : null));

const fields = {
  name: z.string().trim().min(1, "Informe o nome da empresa."),
  email: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.string().email().safeParse(v).success, "E-mail inválido."),
  phone: optionalText,
  segmentId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  status: z.enum(COMPANY_STATUSES),
  notes: optionalText,
  cep: z
    .string()
    .nullish()
    .transform((v) => (v ? v.replace(/\D/g, "") : null))
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || v.length === 8, "CEP deve ter 8 dígitos."),
  street: optionalText,
  number: optionalText,
  complement: optionalText,
  district: optionalText,
  city: optionalText,
  state: optionalText
    .transform((v) => (v ? v.toUpperCase() : null))
    .refine((v) => v === null || /^[A-Z]{2}$/.test(v), "UF deve ter 2 letras."),
  cityIbge: optionalText,
  lat: z.number().min(-90).max(90).nullish().transform((v) => v ?? null),
  lng: z.number().min(-180).max(180).nullish().transform((v) => v ?? null),
};

/**
 * Campos usados no patch (`updateCompanyInput`): cada um `.optional()` em vez
 * de `.nullish()`/obrigatório, para que uma chave ausente no request continue
 * ausente depois do parse — nunca vire `null` nem receba um default (como o
 * `status` de `createCompanyInput`). Isso é o que garante que
 * `updateCompanyInput.parse({ status: "paused" })` seja exatamente
 * `{ status: "paused" }`, sem apagar o resto do cadastro.
 */
const patchFields = {
  name: z.string().trim().min(1, "Informe o nome da empresa.").optional(),
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null))
    .refine((v) => v === undefined || v === null || z.string().email().safeParse(v).success, "E-mail inválido."),
  phone: optionalTextPatch,
  segmentId: z.coerce
    .number()
    .int()
    .positive()
    .nullish()
    .optional()
    .transform((v) => (v === undefined ? undefined : (v ?? null))),
  status: z.enum(COMPANY_STATUSES).optional(),
  notes: optionalTextPatch,
  cep: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v.replace(/\D/g, "") : null))
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === undefined || v === null || v.length === 8, "CEP deve ter 8 dígitos."),
  street: optionalTextPatch,
  number: optionalTextPatch,
  complement: optionalTextPatch,
  district: optionalTextPatch,
  city: optionalTextPatch,
  state: optionalTextPatch
    .transform((v) => (v === undefined ? undefined : v ? v.toUpperCase() : null))
    .refine((v) => v === undefined || v === null || /^[A-Z]{2}$/.test(v), "UF deve ter 2 letras."),
  cityIbge: optionalTextPatch,
  lat: z
    .number()
    .min(-90)
    .max(90)
    .nullish()
    .optional()
    .transform((v) => (v === undefined ? undefined : (v ?? null))),
  lng: z
    .number()
    .min(-180)
    .max(180)
    .nullish()
    .optional()
    .transform((v) => (v === undefined ? undefined : (v ?? null))),
};

export const companyFields = z.object(fields);
export type CompanyFields = z.infer<typeof companyFields>;

export const createCompanyInput = z
  .object({
    ...fields,
    status: fields.status.default("active"),
    isClient: z.boolean(),
    isAdvertiser: z.boolean(),
    advertiserCompany: optionalText,
  })
  .refine((v) => v.isClient || v.isAdvertiser, { message: "Marque cliente e/ou anunciante." });
export type CreateCompanyInput = z.infer<typeof createCompanyInput>;

export const updateCompanyInput = z.object({
  ...patchFields,
  isClient: z.boolean().optional(),
  isAdvertiser: z.boolean().optional(),
  advertiserCompany: optionalTextPatch,
});
export type UpdateCompanyInput = z.infer<typeof updateCompanyInput>;
