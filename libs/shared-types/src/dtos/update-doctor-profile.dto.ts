import { z } from 'zod';

/**
 * ISO 8601 date string validator (YYYY-MM-DD).
 * Accepts null to allow clearing the field.
 */
const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'birth_date must be a valid date in YYYY-MM-DD format')
  .refine((val) => !Number.isNaN(Date.parse(val)), {
    message: 'birth_date must be a real calendar date',
  });

export const UpdateDoctorProfileDtoSchema = z
  .object({
    /** Doctor's display name. Optional update — leave undefined to keep current value. */
    full_name: z.string().min(1).max(200).optional(),
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
    /**
     * Doctor's date of birth in YYYY-MM-DD format.
     * Editable. Pass null to clear the value.
     * cedula is intentionally excluded: it is read-only after onboarding.
     */
    birth_date: isoDateString.nullable().optional(),
  })
  .strict();

export type UpdateDoctorProfileDto = z.infer<typeof UpdateDoctorProfileDtoSchema>;
