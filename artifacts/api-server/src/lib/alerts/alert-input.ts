// artifacts/api-server/src/lib/alerts/alert-input.ts
import { z } from "zod";
import { MAX_ALERT_BODY, MAX_ALERT_TITLE } from "./alert-template";

/** Durações que o admin pode escolher, em minutos. 24h é o teto: aviso esquecido não trava a rede. */
export const ALERT_DURATIONS = [30, 60, 120, 240, 480, 1440] as const;

export const alertInput = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Escreva o título do aviso.")
      .max(MAX_ALERT_TITLE, `O título tem no máximo ${MAX_ALERT_TITLE} caracteres.`),
    body: z
      .string()
      .trim()
      .max(MAX_ALERT_BODY, `O texto tem no máximo ${MAX_ALERT_BODY} caracteres.`)
      .nullish()
      .transform((value) => (value ? value : null)),
    targetMode: z.enum(["all", "segments", "companies"]),
    segmentIds: z.array(z.coerce.number().int().positive()).default([]),
    companyIds: z.array(z.coerce.number().int().positive()).default([]),
    durationMinutes: z.coerce
      .number()
      .refine((n) => (ALERT_DURATIONS as readonly number[]).includes(n), "Escolha uma duração da lista."),
  })
  .refine((v) => v.targetMode !== "segments" || v.segmentIds.length > 0, {
    message: "Escolha ao menos um segmento.",
  })
  .refine((v) => v.targetMode !== "companies" || v.companyIds.length > 0, {
    message: "Escolha ao menos uma empresa.",
  });

export type AlertInput = z.infer<typeof alertInput>;
