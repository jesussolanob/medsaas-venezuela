import { z } from 'zod';
import { CreatePatientSchema } from '../patient.schema';

// Strict DTO: all optional fields become required or explicitly stripped.
// doctor_id and full_name are required; PHI fields are explicit.
export const CreatePatientDtoSchema = CreatePatientSchema.strict()
  .extend({
    doctor_id: z.string().uuid(),
    full_name: z.string().min(1).max(200),
    // PHI: encrypt at rest (AES-256-GCM). Required — every patient must have a cédula.
    // Canonical form is "V-1234" (prefix + digits): 4–15 digits allowed.
    cedula: z.string().trim().min(4, 'La cédula es obligatoria').max(20),
    // PHI: encrypt at rest (AES-256-GCM)
    phone: z.string().max(30).nullable().optional(),
    // PHI: encrypt at rest (AES-256-GCM)
    email: z.string().email().nullable().optional(),
  })
  // At least one contact channel (email OR phone) is required — some patients
  // have no email and attend with a relative who shares the same one.
  .refine((d) => Boolean(d.email?.trim()) || Boolean(d.phone?.trim()), {
    message: 'Indica al menos un correo o un teléfono',
    path: ['email'],
  });

export type CreatePatientDto = z.infer<typeof CreatePatientDtoSchema>;
