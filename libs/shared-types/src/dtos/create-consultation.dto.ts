import { z } from 'zod';
import { PaymentStatusSchema } from '../enums';

// Strict DTO for creating a consultation record.
// consultation_code must be supplied by the API layer (e.g. CON-YYYYMMDD-XXXX).
export const CreateConsultationDtoSchema = z
  .object({
    doctor_id: z.string().uuid(),
    patient_id: z.string().uuid(),
    appointment_id: z.string().uuid().nullable().optional(),
    consultation_code: z.string().min(1),
    consultation_date: z.string().datetime({ offset: true }),
    // PHI: encrypt at rest (AES-256-GCM)
    chief_complaint: z.string().max(2000).nullable().optional(),
    // PHI: encrypt at rest (AES-256-GCM)
    diagnosis: z.string().max(2000).nullable().optional(),
    // PHI: encrypt at rest (AES-256-GCM)
    treatment: z.string().max(2000).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    payment_status: PaymentStatusSchema.default('pending'),
    payment_method: z.string().nullable().optional(),
    amount: z.number().nonnegative().nullable().optional(),
  })
  .strict();

export type CreateConsultationDto = z.infer<typeof CreateConsultationDtoSchema>;
