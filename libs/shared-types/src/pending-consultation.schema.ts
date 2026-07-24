import { z } from 'zod';

// ---------------------------------------------------------------------------
// Status enum
// ---------------------------------------------------------------------------

export const PendingConsultationStatusSchema = z.enum([
  'pending_scheduling',
  'scheduled',
  'completed',
  'expired',
  'cancelled',
]);

export type PendingConsultationStatus = z.infer<typeof PendingConsultationStatusSchema>;

// ---------------------------------------------------------------------------
// Core entity schema (mirrors DB columns — snake_case)
// ---------------------------------------------------------------------------

export const PendingConsultationSchema = z.object({
  id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  auth_user_id: z.string().uuid().nullable(),
  package_id: z.string().uuid().nullable(),
  payment_id: z.string().uuid().nullable(),
  plan_name: z.string(),
  office_id: z.string().uuid().nullable(),
  appointment_mode: z.string().nullable(),
  session_number: z.number().int(),
  status: PendingConsultationStatusSchema,
  expires_at: z.string().datetime().nullable(),
  scheduled_appointment_id: z.string().uuid().nullable(),
  consultation_id: z.string().uuid().nullable(),
  reminder_stage: z.number().int(),
  last_reminder_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type PendingConsultation = z.infer<typeof PendingConsultationSchema>;

// ---------------------------------------------------------------------------
// Response DTO (safe, no PII beyond what the caller needs)
// ---------------------------------------------------------------------------

export const PendingConsultationResponseSchema = z.object({
  id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  package_id: z.string().uuid().nullable(),
  plan_name: z.string(),
  office_id: z.string().uuid().nullable(),
  appointment_mode: z.string().nullable(),
  session_number: z.number().int(),
  status: PendingConsultationStatusSchema,
  expires_at: z.string().datetime().nullable(),
  scheduled_appointment_id: z.string().uuid().nullable(),
  consultation_id: z.string().uuid().nullable(),
  reminder_stage: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type PendingConsultationResponse = z.infer<typeof PendingConsultationResponseSchema>;

// ---------------------------------------------------------------------------
// Public info DTO (for the patient scheduling page — no PII, no internal IDs)
// ---------------------------------------------------------------------------

export const PendingConsultationPublicInfoSchema = z.object({
  doctor_id: z.string().uuid(),
  plan_name: z.string(),
  session_number: z.number().int(),
  expires_at: z.string().datetime().nullable(),
  is_schedulable: z.boolean(),
  doctor_name: z.string(),
});

export type PendingConsultationPublicInfo = z.infer<typeof PendingConsultationPublicInfoSchema>;

// ---------------------------------------------------------------------------
// Schedule DTO — used by both the doctor endpoint and the public token endpoint
// ---------------------------------------------------------------------------

export const SchedulePendingConsultationDtoSchema = z.object({
  scheduled_at: z.string().datetime({ message: 'scheduled_at must be an ISO 8601 datetime' }),
  office_id: z.string().uuid().nullable().optional(),
  appointment_mode: z.enum(['presencial', 'online']).nullable().optional(),
});

export type SchedulePendingConsultationDto = z.infer<typeof SchedulePendingConsultationDtoSchema>;

// ---------------------------------------------------------------------------
// Doctor bulk-create DTO — POST /api/doctor/pending-consultations
// Used by the specialist flow when the patient buys a multi-session plan and
// some sessions are left unscheduled. expiresAt is resolved authoritatively in
// the backend from the plan's validity_days; do NOT trust the client for it.
// ---------------------------------------------------------------------------

export const CreateDoctorPendingConsultationsDtoSchema = z.object({
  patient_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  session_numbers: z
    .array(z.number().int().min(1))
    .min(1, 'At least one session_number is required'),
  payment_id: z.string().uuid().nullable().optional(),
  office_id: z.string().uuid().nullable().optional(),
  appointment_mode: z.enum(['presencial', 'online']).nullable().optional(),
});

export type CreateDoctorPendingConsultationsDto = z.infer<
  typeof CreateDoctorPendingConsultationsDtoSchema
>;
