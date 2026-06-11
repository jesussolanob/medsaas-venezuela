import { z } from 'zod';

export const CreateAvailabilityBlockDtoSchema = z
  .object({
    starts_at: z.string().datetime({ message: 'starts_at must be a valid ISO 8601 datetime' }),
    ends_at: z.string().datetime({ message: 'ends_at must be a valid ISO 8601 datetime' }),
    reason: z.string().max(500).nullable().optional(),
  })
  .strict()
  .refine((data) => new Date(data.ends_at) > new Date(data.starts_at), {
    message: 'ends_at must be after starts_at',
    path: ['ends_at'],
  });

export type CreateAvailabilityBlockDto = z.infer<typeof CreateAvailabilityBlockDtoSchema>;
