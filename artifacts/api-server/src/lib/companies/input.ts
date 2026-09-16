import { z } from "zod";
import { COMPANY_STATUSES } from "@workspace/db/schema";

/** Texto opcional: vazio ou só espaços vira null, para o banco não guardar "". */
const optionalText = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim() : null));

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
 * Campos usados no patch (`updateCompanyInput`): cada um é o MESMO schema de
 * `fields` (fonte única de verdade — mesma normalização, mesmos limites,
 * mesmas mensagens em português do criar), só que envolto em mais um
 * `.optional()` por fora.
 *
 * Esse `.optional()` extra intercepta unicamente o caso de a chave estar
 * ausente do corpo da requisição (`v === undefined`): aí ele nem chega a
 * chamar o schema original, e o resultado é `undefined` — o que faz a chave
 * sumir do objeto final (chave ausente continua ausente, sem apagar o que o
 * formulário não mandou). Qualquer outro valor, inclusive um `null`
 * explícito, passa direto para o schema de `fields`, que já sabe lidar com
 * `null`/string vazia (vira `null`) exatamente como no criar.
 */
const patchFields = {
  name: fields.name.optional(),
  email: fields.email.optional(),
  phone: fields.phone.optional(),
  segmentId: fields.segmentId.optional(),
  status: fields.status.optional(),
  notes: fields.notes.optional(),
  cep: fields.cep.optional(),
  street: fields.street.optional(),
  number: fields.number.optional(),
  complement: fields.complement.optional(),
  district: fields.district.optional(),
  city: fields.city.optional(),
  state: fields.state.optional(),
  cityIbge: fields.cityIbge.optional(),
  lat: fields.lat.optional(),
  lng: fields.lng.optional(),
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
  advertiserCompany: optionalText.optional(),
});
export type UpdateCompanyInput = z.infer<typeof updateCompanyInput>;
