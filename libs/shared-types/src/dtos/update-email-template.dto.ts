import { z } from 'zod';

/**
 * UpdateEmailTemplateDtoSchema — validates the body for PUT /admin/email-templates/:name.
 *
 * All fields are optional; at least one must be provided (enforced by the
 * .refine() check). Template names and descriptions are not editable through
 * this endpoint — the name is the route param and descriptions are code-owned.
 */
export const UpdateEmailTemplateDtoSchema = z
  .object({
    subject: z.string().min(1).max(300).optional(),
    html: z.string().min(1).optional(),
    /** Plain-text fallback body. Pass null to clear. */
    text: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.subject !== undefined ||
      data.html !== undefined ||
      data.text !== undefined ||
      data.is_active !== undefined,
    { message: 'Debés enviar al menos un campo' },
  );

export type UpdateEmailTemplateDto = z.infer<typeof UpdateEmailTemplateDtoSchema>;
