import { z } from 'zod';

/**
 * GET /api/specialties
 *
 * Public endpoint — no auth required.
 * Returns active specialties ordered by sort_order, name.
 */
export const SpecialtyItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

export type SpecialtyItem = z.infer<typeof SpecialtyItemSchema>;

/**
 * POST /api/admin/specialties
 *
 * Admin creates a new specialty (super_admin only).
 */
export const CreateSpecialtyDtoSchema = z
  .object({
    name: z.string().min(1, 'name is required').max(200, 'name must be at most 200 characters'),
    sort_order: z.number().int().min(0).optional(),
  })
  .strict();

export type CreateSpecialtyDto = z.infer<typeof CreateSpecialtyDtoSchema>;

/**
 * PUT /api/admin/specialties/:id
 *
 * Admin updates an existing specialty (super_admin only).
 * All fields are optional — only provided fields are updated.
 */
export const UpdateSpecialtyDtoSchema = z
  .object({
    name: z
      .string()
      .min(1, 'name must not be empty')
      .max(200, 'name must be at most 200 characters')
      .optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debés enviar al menos un campo',
  });

export type UpdateSpecialtyDto = z.infer<typeof UpdateSpecialtyDtoSchema>;
