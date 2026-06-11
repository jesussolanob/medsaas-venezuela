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
  })
  .strict();

export type CreateAppointmentDto = z.infer<typeof CreateAppointmentDtoSchema>;
