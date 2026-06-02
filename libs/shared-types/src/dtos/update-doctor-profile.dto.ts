import { z } from 'zod';

export const UpdateDoctorProfileDtoSchema = z
  .object({
    specialty: z.string().nullable().optional(),
    professional_title: z.string().nullable().optional(),
    payment_methods: z.array(z.string()).optional(),
    payment_details: z.record(z.string(), z.unknown()).optional(),
    allows_online: z.boolean().optional(),
    office_address: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    avatar_url: z.string().url().nullable().optional(),
  })
  .strict();

export type UpdateDoctorProfileDto = z.infer<typeof UpdateDoctorProfileDtoSchema>;
