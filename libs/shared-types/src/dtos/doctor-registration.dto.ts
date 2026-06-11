import { z } from 'zod';

/**
 * POST /api/doctor/registration
 *
 * Submitted by an authenticated doctor to complete their profile for the
 * admin verification workflow. Idempotent — re-submitting updates the fields.
 *
 * full_name and cedula are required to initiate verification.
 * mpps_number and colegiado_number are optional but recommended.
 */
export const DoctorRegistrationDtoSchema = z
  .object({
    full_name: z
      .string()
      .min(2, 'full_name must be at least 2 characters')
      .max(200, 'full_name must be at most 200 characters'),
    cedula: z
      .string()
      .regex(
        /^[VEP]-[A-Za-z0-9]{3,20}$/,
        'cedula must follow format V/E/P-<value> (e.g. V-12345678)',
      )
      .max(30, 'cedula must be at most 30 characters'),
    mpps_number: z.string().min(1).max(50).nullable().optional(),
    colegiado_number: z.string().min(1).max(50).nullable().optional(),
    /**
     * The doctor's medical specialty (free text, matched to the specialties
     * catalogue on the frontend). Optional — can be updated later from settings.
     */
    specialty: z.string().min(1).max(200).nullable().optional(),
  })
  .strict();

export type DoctorRegistrationDto = z.infer<typeof DoctorRegistrationDtoSchema>;

// ---------------------------------------------------------------------------
// PUT /api/admin/doctor-verifications/:doctorId
// ---------------------------------------------------------------------------

export const UpdateVerificationStatusDtoSchema = z
  .object({
    status: z.enum(['verified', 'rejected'], {
      error: 'status must be "verified" or "rejected"',
    }),
  })
  .strict();

export type UpdateVerificationStatusDto = z.infer<typeof UpdateVerificationStatusDtoSchema>;

// ---------------------------------------------------------------------------
// GET /api/admin/doctor-verifications (query params)
// ---------------------------------------------------------------------------

export const ListVerificationsDtoSchema = z.object({
  status: z.enum(['pending', 'verified', 'rejected']).optional().default('pending'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type ListVerificationsDto = z.infer<typeof ListVerificationsDtoSchema>;
