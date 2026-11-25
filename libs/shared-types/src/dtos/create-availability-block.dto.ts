import { z } from 'zod';

export const CreateAvailabilityBlockDtoSchema = z
  .object({
    starts_at: z.string().datetime({ message: 'La fecha de inicio no es válida' }),
    ends_at: z.string().datetime({ message: 'La fecha de fin no es válida' }),
    reason: z.string().max(500).nullable().optional(),
  })
  .strict()
  .refine((data) => new Date(data.ends_at) > new Date(data.starts_at), {
    message: 'La fecha de fin debe ser posterior a la de inicio',
    path: ['ends_at'],
  });

export type CreateAvailabilityBlockDto = z.infer<typeof CreateAvailabilityBlockDtoSchema>;
