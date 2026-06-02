import { z } from 'zod';

// Columns from CLAUDE.md: doctor_id, auth_user_id, full_name, cedula, phone, email, source
// Additional columns observed in patients/actions.ts and book/route.ts:
// birth_date, sex, blood_type, allergies, chronic_conditions, address, city,
// emergency_contact_name, emergency_contact_phone
// Columns from sql_seed_ehr.sql: age, id_number (alias for cedula)
// Note: both 'cedula' (CLAUDE.md) and 'id_number' (seed SQL) appear; the actions.ts
// code uses 'cedula', so 'cedula' is canonical. 'id_number' is the seed's alias.
// 'age' is deprecated in favour of 'birth_date' — kept as optional for compatibility.

export const PatientSchema = z.object({
  id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  auth_user_id: z.string().uuid().nullable().optional(),
  // PHI: encrypt at rest (AES-256-GCM)
  full_name: z.string().min(1),
  // PHI: encrypt at rest (AES-256-GCM)
  cedula: z.string().nullable().optional(),
  // PHI: encrypt at rest (AES-256-GCM)
  phone: z.string().nullable().optional(),
  // PHI: encrypt at rest (AES-256-GCM)
  email: z.string().email().nullable().optional(),
  source: z.string().nullable().optional(),
  birth_date: z.string().nullable().optional(),
  // age is a legacy column — prefer birth_date
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
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});

export type Patient = z.infer<typeof PatientSchema>;

export const CreatePatientSchema = PatientSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type CreatePatient = z.infer<typeof CreatePatientSchema>;
