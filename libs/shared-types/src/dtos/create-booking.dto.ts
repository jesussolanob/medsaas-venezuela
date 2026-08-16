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
    // Required — public self-booking creates a patient identity, which must
    // carry a cédula (also used as a second factor for shared-document access).
    patient_cedula: z.string().trim().min(5, 'La cédula es obligatoria').max(20),
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

    /**
     * URL of a payment receipt or transfer screenshot uploaded by the patient.
     * Stored on the appointment's payment_receipt_url column.
     * Must be a valid HTTPS URL when provided; null/omitted means no receipt yet.
     */
    receipt_url: z.string().url().nullable().optional(),

    /**
     * ID of the pricing_plan selected for this booking.
     * When set and the plan has sessions_count > 1, the booking flow creates
     * the extra appointment slots (additional_sessions) and/or pending
     * consultations for deferred scheduling. Fully backward-compatible:
     * absent or sessions_count=1 → identical behaviour to today.
     */
    plan_id: z.string().uuid().nullable().optional(),

    /**
     * Additional sessions the patient wants to schedule right now
     * (beyond the first one in scheduled_at). Only processed when plan_id
     * resolves to a plan with sessions_count > 1.
     * Max entries honoured: min(sessions_count - 1, array length).
     */
    additional_sessions: z
      .array(
        z.object({
          scheduled_at: z.string().datetime({ offset: true }),
          office_id: z.string().uuid().nullable().optional(),
          appointment_mode: z.enum(['presencial', 'online']).optional(),
        }),
      )
      .optional(),

    /**
     * Duración explícita de la consulta, en minutos (5–480).
     *
     * Solo se aplica al camino del especialista (DoctorBookingController →
     * CreateBookingUseCase con skipPatientBookingRules=true). En el booking
     * público el campo se ignora aunque venga en el body, porque un paciente
     * no puede elegir cuánto dura su propia consulta.
     *
     * Caso de uso: "hora libre" — el especialista agenda una cita de 9:30 a
     * 10:30 porque tiene dos bloques vacíos y quiere ocuparlos con un servicio
     * de 60'. El solapamiento se detecta con esta duración, de modo que los
     * slots de 9:00 y 10:00 quedan bloqueados correctamente.
     */
    duration_minutes: z.number().int().min(5).max(480).optional(),
  })
  .strict();

export type CreateBookingDto = z.infer<typeof CreateBookingDtoSchema>;
