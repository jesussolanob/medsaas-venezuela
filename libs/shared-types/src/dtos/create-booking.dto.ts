import { z } from 'zod';
import { AppointmentModeSchema } from '../enums';

export const CreateBookingDtoSchema = z
  .object({
    // Turnstile CFTOKEN — validated by stub in Etapa 1.
    // TODO(etapa-2): validate against Cloudflare Turnstile API (POST /turnstile/v0/siteverify).
    cf_turnstile_token: z.string().min(1),

    doctor_id: z.string().uuid(),

    // Patient identification
    patient_name: z.string().min(1).max(200),
    patient_email: z.string().email(),
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
