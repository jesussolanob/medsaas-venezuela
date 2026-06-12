import { z } from 'zod';
import { AppointmentModeSchema } from '../enums';

export const CreateBookingDtoSchema = z
  .object({
    // Turnstile CFTOKEN — validated by stub in Etapa 1.
    // TODO(etapa-2): validate against Cloudflare Turnstile API (POST /turnstile/v0/siteverify).
    cf_turnstile_token: z.string().min(1),

    doctor_id: z.string().uuid(),

    /**
     * ID of the specific office where the appointment is requested.
     * Used to validate that the requested modality is supported by the office
     * (e.g. an in_person-only office rejects online bookings).
     * Optional for backward compatibility — if omitted, modality is accepted as-is.
     */
    office_id: z.string().uuid().nullable().optional(),

    /**
     * ID of an existing patient record scoped to the authenticated doctor.
     * When provided, the booking flow uses this patient directly and skips
     * find-or-create. Anti-IDOR: the patient must belong to the given doctor_id;
     * if it does not, a NotFound error is returned (no existence leak).
     * Used by the "Nueva consulta" flow from the doctor's dashboard.
     */
    patient_id: z.string().uuid().optional(),

    // Patient identification (used for find-or-create when patient_id is absent)
    patient_name: z.string().min(1).max(200),
    /**
     * Patient email — optional. Required by the public booking page frontend;
     * the backend accepts it as optional to support doctor-initiated bookings
     * for existing patients who have no email on file.
     * When present, must be a valid email address.
     * Empty string is normalised to null.
     */
    patient_email: z
      .string()
      .email()
      .nullable()
      .optional()
      .transform((v) => (v === '' ? null : v)),
    patient_cedula: z.string().max(20).nullable().optional(),
    patient_phone: z.string().max(30).nullable().optional(),

    // Appointment details
    scheduled_at: z.string().datetime({ offset: true }),
    appointment_mode: AppointmentModeSchema.default('presencial'),
    plan_name: z.string().min(1),
    plan_price: z.number().nonnegative(),
    chief_complaint: z.string().max(1000).nullable().optional(),

    // Payment fields (skipped if using package)
    payment_method: z.string().nullable().optional(),
    payment_reference: z.string().nullable().optional(),
    bcv_rate: z.number().positive().nullable().optional(),

    // Optional: use an existing package session instead of paying
    package_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export type CreateBookingDto = z.infer<typeof CreateBookingDtoSchema>;
