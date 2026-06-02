import { z } from 'zod';
import { AppointmentStatusSchema, AppointmentModeSchema } from './enums';

// Columns from CLAUDE.md:
// doctor_id, patient_id, auth_user_id, scheduled_at, status, plan_name, plan_price,
// payment_method, package_id, session_number, appointment_mode
// Additional columns observed in book/route.ts:
// patient_name, patient_phone, patient_email, patient_cedula, source,
// chief_complaint, payment_reference, insurance_name, payment_receipt_url,
// bcv_rate, amount_bs, appointment_code, consultation_id
// Note: 'pending' and 'accepted' are legacy SQL enum values included in AppointmentStatusSchema

export const AppointmentSchema = z.object({
  id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  patient_id: z.string().uuid().nullable().optional(),
  auth_user_id: z.string().uuid().nullable().optional(),
  consultation_id: z.string().uuid().nullable().optional(),
  // Denormalised patient info stored at booking time
  patient_name: z.string().nullable().optional(),
  patient_phone: z.string().nullable().optional(),
  patient_email: z.string().email().nullable().optional(),
  patient_cedula: z.string().nullable().optional(),
  scheduled_at: z.string().datetime({ offset: true }),
  status: AppointmentStatusSchema,
  appointment_mode: AppointmentModeSchema.default('presencial'),
  source: z.string().nullable().optional(),
  plan_name: z.string().nullable().optional(),
  plan_price: z.number().nullable().optional(),
  payment_method: z.string().nullable().optional(),
  payment_reference: z.string().nullable().optional(),
  payment_receipt_url: z.string().url().nullable().optional(),
  insurance_name: z.string().nullable().optional(),
  // BCV (Banco Central de Venezuela) exchange rate at booking time
  bcv_rate: z.number().nullable().optional(),
  amount_bs: z.number().nullable().optional(),
  package_id: z.string().uuid().nullable().optional(),
  session_number: z.number().int().nullable().optional(),
  chief_complaint: z.string().nullable().optional(),
  appointment_code: z.string().nullable().optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});

export type Appointment = z.infer<typeof AppointmentSchema>;

export const CreateAppointmentSchema = AppointmentSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type CreateAppointment = z.infer<typeof CreateAppointmentSchema>;
