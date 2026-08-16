import { z } from 'zod';
import { AppointmentModeSchema } from '../enums';

/**
 * DTO for POST /api/doctor/appointments/immediate
 *
 * Creates an appointment for a walk-in patient (paciente sin cita).
 * The `scheduled_at` is always set to the current server time — any
 * client-provided timestamp is deliberately ignored to prevent this
 * endpoint from becoming a backdoor for arbitrary appointment creation.
 *
 * The effective duration is computed server-side as:
 *   min(duration_minutes, minutesUntilNextAppointment)
 * unless `force: true`, in which case the full `duration_minutes` is
 * used regardless of the next appointment.
 */
export const CreateImmediateAppointmentDtoSchema = z
  .object({
    /**
     * Office where the walk-in is happening. Required so the server can
     * compute the next appointment window for this doctor's location context.
     */
    office_id: z.string().uuid(),

    /**
     * ID of the existing patient record scoped to the authenticated doctor.
     * Anti-IDOR: the patient must belong to the doctor; the server verifies
     * ownership via the authenticated user ID.
     */
    patient_id: z.string().uuid(),

    // Appointment details
    appointment_mode: AppointmentModeSchema.default('presencial'),
    plan_name: z.string().min(1),
    plan_price: z.number().nonnegative(),
    /**
     * Duration of the service in minutes (5–480).
     * The server will reduce this to `min(duration_minutes, availableMinutes)`
     * if there is a near-term appointment, unless `force: true`.
     */
    duration_minutes: z.number().int().min(5).max(480),

    // Payment fields
    payment_method: z.string().nullable().optional(),
    payment_reference: z.string().nullable().optional(),
    bcv_rate: z.number().positive().nullable().optional(),

    /**
     * Package session to consume instead of a new payment.
     * When provided, the usual package ownership + availability checks apply.
     */
    package_id: z.string().uuid().nullable().optional(),

    /**
     * Optional pricing plan ID for multi-session plans.
     */
    plan_id: z.string().uuid().nullable().optional(),

    /**
     * When provided, the walk-in consumes a pre-paid session from this pending
     * consultation instead of creating a new standalone appointment.
     *
     * Security (anti-IDOR double check):
     *   - The pending consultation must belong to the authenticated doctor.
     *   - The pending consultation must also belong to the same patient_id.
     *   - It must be in 'pending_scheduling' status and not expired.
     *
     * When present, plan_name and plan_price are taken from the pending consultation
     * row, NOT from the client request. Any plan_name / plan_price in the body is
     * silently ignored.
     */
    pending_consultation_id: z.string().uuid().optional(),

    /**
     * When true, the specialist acknowledges that an appointment overlap may
     * occur and explicitly accepts it. The full `duration_minutes` is used
     * (no truncation), and the doctor's own overlap check is bypassed.
     *
     * The patient's cross-doctor overlap check is NEVER bypassed, even with force.
     */
    force: z.boolean().optional().default(false),

    /**
     * Optional chief complaint for the walk-in.
     */
    chief_complaint: z.string().max(1000).nullable().optional(),
  })
  .strict();

export type CreateImmediateAppointmentDto = z.infer<typeof CreateImmediateAppointmentDtoSchema>;
