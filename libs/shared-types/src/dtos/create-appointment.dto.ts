import { z } from 'zod';
import { AppointmentModeSchema } from '../enums';

// Strict DTO for creating a new appointment via /api/book.
// Only the fields the client must supply are required.
export const CreateAppointmentDtoSchema = z
  .object({
    doctor_id: z.string().uuid(),
    patient_id: z.string().uuid().optional(),
    auth_user_id: z.string().uuid().optional(),
    patient_name: z.string().min(1).max(200),
    patient_phone: z.string().max(30).nullable().optional(),
    patient_email: z.string().email().nullable().optional(),
    patient_cedula: z.string().max(20).nullable().optional(),
    scheduled_at: z.string().datetime({ offset: true }),
    appointment_mode: AppointmentModeSchema.default('presencial'),
    plan_name: z.string().min(1),
    plan_price: z.number().positive(),
    payment_method: z.string().optional(),
    payment_reference: z.string().nullable().optional(),
    package_id: z.string().uuid().nullable().optional(),
    chief_complaint: z.string().max(1000).nullable().optional(),
    bcv_rate: z.number().positive().nullable().optional(),
    /**
     * FK → doctor_offices(id). Optional.
     * When provided, the use case validates:
     *   1. The office belongs to the authenticated doctor (anti-IDOR).
     *   2. The office's modality supports the requested appointment_mode.
     */
    office_id: z.string().uuid().nullable().optional(),

    /**
     * ID of the pricing_plan selected for this appointment.
     * When set and the plan has sessions_count > 1, pending_consultations are
     * created for sessions not scheduled via additional_sessions. Fully
     * backward-compatible: absent or sessions_count=1 → identical behaviour.
     */
    pricing_plan_id: z.string().uuid().nullable().optional(),

    /**
     * Additional sessions to schedule immediately (beyond this appointment).
     * Only processed when pricing_plan_id resolves to a plan with sessions_count > 1.
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
  })
  .strict()
  // A cédula is mandatory for every patient. Existing patients are referenced by
  // patient_id (their cédula already lives on the record); for a new walk-in
  // patient (no patient_id) the cédula must be supplied here.
  .refine(
    (d) =>
      d.patient_id != null || (d.patient_cedula != null && d.patient_cedula.trim().length >= 5),
    { message: 'La cédula del paciente es obligatoria', path: ['patient_cedula'] },
  );

export type CreateAppointmentDto = z.infer<typeof CreateAppointmentDtoSchema>;
