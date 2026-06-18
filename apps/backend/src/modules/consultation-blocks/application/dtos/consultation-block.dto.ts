import { z } from 'zod';

/**
 * Zod schema for the PUT /api/doctor/consultation-blocks body.
 *
 * blocks: full replacement array for the doctor's configuration.
 * Each item identifies a catalog key and optional overrides.
 * enabled defaults to true when omitted.
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
});

export type SaveBlocksDto = z.infer<typeof SaveBlocksDtoSchema>;
