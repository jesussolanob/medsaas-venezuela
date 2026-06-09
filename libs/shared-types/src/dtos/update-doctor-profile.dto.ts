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
    /** Doctor/clinic logo URL (uploaded to storage first). */
    logo_url: z.string().url().nullable().optional(),
    /** Digital signature image URL (uploaded to storage first). */
    signature_url: z.string().url().nullable().optional(),
    /** Professional medical license number. */
    license_number: z.string().nullable().optional(),
    /** Doctor contact phone number. */
    phone: z.string().max(30).nullable().optional(),
  })
  .strict();

export type UpdateDoctorProfileDto = z.infer<typeof UpdateDoctorProfileDtoSchema>;
