import { z } from 'zod';
import { PaymentStatusSchema } from './enums';

// Columns from CLAUDE.md:
// doctor_id, patient_id, consultation_code, consultation_date, chief_complaint,
// diagnosis, treatment
// Additional columns observed in consultations/page.tsx and sql_seed_ehr.sql:
// notes, payment_status, payment_method, amount
// Additional columns from book/route.ts: appointment_id

export const ConsultationSchema = z.object({
  id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  consultation_code: z.string(),
  consultation_date: z.string().datetime({ offset: true }),
  // PHI: encrypt at rest (AES-256-GCM)
  chief_complaint: z.string().nullable().optional(),
  // PHI: encrypt at rest (AES-256-GCM)
  diagnosis: z.string().nullable().optional(),
  // PHI: encrypt at rest (AES-256-GCM)
  treatment: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  payment_status: PaymentStatusSchema.default('pending'),
  payment_method: z.string().nullable().optional(),
  // Amount in USD
  amount: z.number().nullable().optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});

export type Consultation = z.infer<typeof ConsultationSchema>;

export const CreateConsultationSchema = ConsultationSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type CreateConsultation = z.infer<typeof CreateConsultationSchema>;
