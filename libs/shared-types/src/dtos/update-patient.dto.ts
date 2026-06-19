import { z } from 'zod';

/**
 * DTO for PUT /api/patients/:id.
 *
 * All fields are optional — only provided fields are updated (partial update).
 * PHI fields (full_name, cedula, phone, email) are validated the same as on create.
 * doctor_id is intentionally absent — the controller derives it from the auth token.
 */
export const UpdatePatientDtoSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  // Cédula is mandatory: optional in a partial patch (omit = leave unchanged),
  // but it can never be set to null/empty — a patient always keeps a cédula.
  cedula: z.string().trim().min(5, 'La cédula es obligatoria').max(20).optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  source: z.string().nullable().optional(),
  birth_date: z.string().nullable().optional(),
  age: z.number().int().nullable().optional(),
  sex: z.enum(['male', 'female', 'other']).nullable().optional(),
  blood_type: z.string().nullable().optional(),
  allergies: z.string().nullable().optional(),
  chronic_conditions: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  emergency_contact_name: z.string().nullable().optional(),
  emergency_contact_phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type UpdatePatientDto = z.infer<typeof UpdatePatientDtoSchema>;
