import { z } from 'zod';

/**
 * QuickItemType — discriminates between exam shortcuts and medication shortcuts.
 * Matches the CHECK constraint on doctor_quick_items.item_type.
 */
export const QuickItemTypeSchema = z.enum(['exam', 'medication']);
export type QuickItemType = z.infer<typeof QuickItemTypeSchema>;

/**
 * CreateQuickItemDtoSchema — body for POST /api/doctor/quick-items.
 */
export const CreateQuickItemDtoSchema = z.object({
  item_type: QuickItemTypeSchema,
  name: z.string().min(1, 'name is required').max(300),
  category: z.string().max(200).nullable().optional(),
  details: z.string().max(1000).nullable().optional(),
});
export type CreateQuickItemDto = z.infer<typeof CreateQuickItemDtoSchema>;

/**
 * ListQuickItemsQuerySchema — optional type filter for GET /api/doctor/quick-items.
 */
export const ListQuickItemsQuerySchema = z.object({
  type: QuickItemTypeSchema.optional(),
});
export type ListQuickItemsQuery = z.infer<typeof ListQuickItemsQuerySchema>;
