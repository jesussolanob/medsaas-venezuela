import { z } from 'zod';

// Columns from CLAUDE.md: patient_id, doctor_id, medication_name, dosage, frequency, duration
// Columns from sql_seed_ehr.sql (CREATE TABLE): doctor_id, consultation_id, patient_id,
//   medication (not medication_name), dosage, frequency, duration, notes, created_at
// Columns from ehr/page.tsx usage: medication, dosage, frequency, duration
// Decision: the actual DB column is 'medication' (seed CREATE TABLE + frontend queries).
// CLAUDE.md says 'medication_name' — this is the PHI label reference; the real column is 'medication'.

export const PrescriptionSchema = z.object({
  id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  patient_id: z.string().uuid().nullable().optional(),
  consultation_id: z.string().uuid().nullable().optional(),
  // PHI: encrypt at rest (AES-256-GCM)
  medication: z.string().min(1),
  // PHI: encrypt at rest (AES-256-GCM)
  dosage: z.string().nullable().optional(),
  frequency: z.string().nullable().optional(),
  duration: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
});

export type Prescription = z.infer<typeof PrescriptionSchema>;

export const CreatePrescriptionSchema = PrescriptionSchema.omit({
  id: true,
  created_at: true,
});
export type CreatePrescription = z.infer<typeof CreatePrescriptionSchema>;
