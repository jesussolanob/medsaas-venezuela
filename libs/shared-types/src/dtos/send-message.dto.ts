import { z } from 'zod';

export const SendMessageDtoSchema = z.object({
  patient_id: z.string().uuid('patient_id must be a valid UUID'),
  body: z
    .string()
    .min(1, 'body cannot be empty')
    .max(4000, 'body cannot exceed 4000 characters'),
});

export type SendMessageDto = z.infer<typeof SendMessageDtoSchema>;
