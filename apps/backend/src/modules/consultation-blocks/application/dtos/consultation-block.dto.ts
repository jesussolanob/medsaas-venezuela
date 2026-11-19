import { z } from 'zod';

/**
 * Zod schema for the PATCH /api/doctor/consultation-blocks/:blockKey/label body.
 *
 * custom_label: trimmed string, max 80 chars.
 * null or empty string → null (restores the catalog default label).
 */
export const PatchBlockLabelDtoSchema = z.object({
  custom_label: z
    .string()
    .trim()
    .max(80, 'El nombre del bloque no puede superar los 80 caracteres')
    .nullable()
    .transform((v) => (v === null || v === '' ? null : v)),
});

export type PatchBlockLabelDto = z.infer<typeof PatchBlockLabelDtoSchema>;

/**
 * Zod schema for the PUT /api/doctor/consultation-blocks body.
 *
 * blocks: full replacement array for the doctor's configuration.
 * Each item identifies a catalog key and optional overrides.
 * enabled defaults to true when omitted.
 *
 * layout (optional): when present, persists the display layout on profiles.
 * Omitting layout leaves the current value untouched (retrocompatible).
 */
export const SaveBlocksDtoSchema = z.object({
  blocks: z.array(
    z.object({
      block_key: z.string().min(1),
      enabled: z.boolean().optional(),
      sort_order: z.number().int().min(0).optional(),
      custom_label: z.string().nullable().optional(),
      custom_content_type: z.string().nullable().optional(),
      custom_description: z.string().nullable().optional(),
      printable: z.boolean().nullable().optional(),
      send_to_patient: z.boolean().nullable().optional(),
    }),
  ),
  /**
   * Optional display layout for consultation blocks.
   * 'tabs' | 'vertical'. When omitted, the stored value is not modified.
   */
  layout: z.enum(['tabs', 'vertical']).optional(),
});

export type SaveBlocksDto = z.infer<typeof SaveBlocksDtoSchema>;
