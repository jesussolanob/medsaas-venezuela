import { z } from 'zod';
import { CreatePatientSchema } from '../patient.schema';

// Strict DTO: all optional fields become required or explicitly stripped.
// doctor_id and full_name are required; PHI fields are explicit.
export const CreatePatientDtoSchema = CreatePatientSchema.strict().extend({
  doctor_id: z.string().uuid(),
  full_name: z.string().min(1).max(200),
  // PHI: encrypt at rest (AES-256-GCM). Required — every patient must have a cédula.
  cedula: z.string().trim().min(5, 'La cédula es obligatoria').max(20),
  // PHI: encrypt at rest (AES-256-GCM)
  phone: z.string().max(30).nullable().optional(),
  // PHI: encrypt at rest (AES-256-GCM)
  email: z.string().email().nullable().optional(),
});

export type CreatePatientDto = z.infer<typeof CreatePatientDtoSchema>;
