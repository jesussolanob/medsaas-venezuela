import { z } from 'zod';

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
});

export type ShareConsultationDto = z.infer<typeof ShareConsultationDtoSchema>;

// ---------------------------------------------------------------------------

export const VerifyCodeDtoSchema = z.object({
  code: z
    .string()
    .trim()
    .length(6, 'El código debe tener exactamente 6 dígitos')
    .regex(/^\d{6}$/, 'El código debe contener solo dígitos'),
});

export type VerifyCodeDto = z.infer<typeof VerifyCodeDtoSchema>;
