import { z } from 'zod';

export const UpsertDoctorTemplateDtoSchema = z.object({
  logo_url: z.string().nullable().optional(),
  signature_url: z.string().nullable().optional(),
  font_family: z.string().min(1).max(100).optional(),
  header_text: z.string().max(500).optional(),
  footer_text: z.string().max(500).optional(),
  show_logo: z.boolean().optional(),
  show_signature: z.boolean().optional(),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'primary_color must be a valid hex color (e.g. #0891b2)')
    .optional(),
});

export type UpsertDoctorTemplateDto = z.infer<typeof UpsertDoctorTemplateDtoSchema>;
