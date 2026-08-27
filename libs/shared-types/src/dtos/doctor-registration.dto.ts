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
    /**
     * Teléfono del especialista — OBLIGATORIO desde 2026-08-17.
     *
     * Es el punto de contacto de Delta con él, así que se pide de primero en el
     * onboarding y sin él no se completa el alta. Formato canónico que emite
     * PhoneInput: código de país + número, solo dígitos (ej. 584141234567).
     */
    phone: z.string().regex(/^\d{8,20}$/, 'phone must be 8-20 digits including country code'),
    mpps_number: z.string().min(1).max(50).nullable().optional(),
    colegiado_number: z.string().min(1).max(50).nullable().optional(),
    /**
     * The doctor's medical specialty (free text, matched to the specialties
     * catalogue on the frontend). Optional — can be updated later from settings.
     */
    specialty: z.string().min(1).max(200).nullable().optional(),
    /**
     * Whether the doctor has accepted the current Terms & Conditions.
     * When true, the acceptance timestamp and T&C version are persisted on the profile.
     * Optional — omitting it does not change any existing acceptance record.
     */
    accepted_terms: z.boolean().optional(),
    /**
     * Género del especialista: F | M | O (otro) | N (prefiere no decirlo).
     * Opcional — se pide con fines estadísticos y puede cambiarse en configuración.
     */
    gender: z.enum(['F', 'M', 'O', 'N']).nullable().optional(),
    /**
     * Código de referido del vendedor — el especialista lo escribe en el
     * onboarding si se registró a través de un vendedor de Delta.
     *
     * Restricciones:
     *   - Opcional y se escribe UNA SOLA VEZ: si el especialista ya tiene un
     *     vendedor asignado (sold_by ≠ null), el backend ignora este campo.
     *   - Código inexistente → SellerCodeNotFoundError (422).
     *   - Nunca viene del vendedor en sí — los vendedores se crean desde el panel
     *     de admin, no por auto-registro.
     */
    seller_code: z
      .string()
      .min(1)
      .max(20)
      .regex(/^[A-Z0-9]+$/, 'seller_code must be uppercase alphanumeric')
      .optional(),
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
