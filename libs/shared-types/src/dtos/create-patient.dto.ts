import { z } from 'zod';
import { CreatePatientSchema } from '../patient.schema';

// Strict DTO: all optional fields become required or explicitly stripped.
// doctor_id and full_name are required; PHI fields are explicit.
export const CreatePatientDtoSchema = CreatePatientSchema.strict().extend({
  doctor_id: z.string().uuid(),
  full_name: z.string().min(1).max(200),
  // PHI: encrypt at rest (AES-256-GCM)
  cedula: z.string().max(20).nullable().optional(),
  // PHI: encrypt at rest (AES-256-GCM)
  phone: z.string().max(30).nullable().optional(),
  // PHI: encrypt at rest (AES-256-GCM)
  email: z.string().email().nullable().optional(),
});

export type CreatePatientDto = z.infer<typeof CreatePatientDtoSchema>;
