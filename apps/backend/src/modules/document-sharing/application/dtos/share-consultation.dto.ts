import { z } from 'zod';

/** Valid document type keys for the new unified sharing selection. */
export const DOC_TYPE_VALUES = ['recipe', 'paraclinical', 'history', 'rest', 'informe'] as const;
export type DocTypeValue = (typeof DOC_TYPE_VALUES)[number];

/**
 * Schema for the new unified doc selection.
 *
 * `types`            — document types the doctor chose to share (non-empty).
 * `informeBlockKeys` — block keys selected within the 'informe' type.
 *                      Optional; defaults to empty array.
 * `restContent`      — text of the medical rest (reposo), frozen at share time.
 *                      Optional and nullable — only present when 'rest' is in types.
 */
export const DocSelectionSchema = z.object({
  types: z.array(z.enum(DOC_TYPE_VALUES)).min(1, 'Debe seleccionar al menos un tipo de documento'),
  informeBlockKeys: z.array(z.string()).optional().default([]),
  restContent: z.string().nullable().optional(),
});

export type DocSelectionDto = z.infer<typeof DocSelectionSchema>;

export const ShareConsultationDtoSchema = z.object({
  sections: z
    .object({
      report: z.boolean().optional().default(false),
      prescriptions: z.boolean().optional().default(false),
      ehr: z.boolean().optional().default(false),
    })
    .refine((s) => s.report || s.prescriptions || s.ehr, {
      message: 'Debe seleccionar al menos una sección para compartir',
    }),
  /**
   * New unified selection — present when the doctor uses the redesigned modal.
   * When present it is persisted alongside `sections` (which is kept for compat).
   */
  doc_selection: DocSelectionSchema.optional(),
});

export type ShareConsultationDto = z.infer<typeof ShareConsultationDtoSchema>;

// ---------------------------------------------------------------------------

export const VerifyCodeDtoSchema = z.object({
  code: z
    .string()
    .trim()
    .length(6, 'El código debe tener exactamente 6 dígitos')
    .regex(/^\d{6}$/, 'El código debe contener solo dígitos'),
  /**
   * The patient's cédula is required alongside the code.
   * Both must match for the session token to be issued.
   * Input is normalized server-side (see normalize-cedula utility in use case).
   */
  cedula: z
    .string()
    .trim()
    .min(5, 'La cédula debe tener al menos 5 caracteres')
    .max(30, 'La cédula no puede superar los 30 caracteres'),
});

export type VerifyCodeDto = z.infer<typeof VerifyCodeDtoSchema>;
