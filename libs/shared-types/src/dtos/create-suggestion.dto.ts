import { z } from 'zod';

export const SuggestionStatusSchema = z.enum([
  'pending',
  'reviewed',
  'planned',
  'done',
  'rejected',
]);
export type SuggestionStatusType = z.infer<typeof SuggestionStatusSchema>;

export const CreateSuggestionDtoSchema = z.object({
  subject: z.string().min(1, 'subject is required').max(500),
  message: z.string().min(1, 'message is required').max(5000),
  category: z.string().max(100).optional().default('general'),
});
export type CreateSuggestionDto = z.infer<typeof CreateSuggestionDtoSchema>;

export const RespondSuggestionDtoSchema = z.object({
  status: SuggestionStatusSchema,
  admin_response: z.string().max(5000).nullable().optional(),
});
export type RespondSuggestionDto = z.infer<typeof RespondSuggestionDtoSchema>;
