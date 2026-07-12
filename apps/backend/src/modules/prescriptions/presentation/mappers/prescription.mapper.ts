import type { Prescription } from '../../domain/entities/prescription.entity';

/**
 * Maps a Prescription domain entity to the API response shape.
 *
 * Clinical fields (medication, dosage) are returned in plaintext —
 * the authenticated doctor is the owner of these records.
 *
 * SECURITY: never expose prescriptions from another doctor. Ownership is enforced
 * upstream in the use case and repository layers.
 *
 * NOTE: there is no issued_date column — created_at serves as the issue date.
 *
 * TODO (patient-portal): if this mapper is ever reused for patient-facing
 * endpoints, medication and dosage should be treated as sensitive; consider a
 * separate mapper with appropriate access controls.
 */
export function toPrescriptionResponse(prescription: Prescription): Record<string, unknown> {
  return {
    id: prescription.id,
    doctor_id: prescription.doctorId,
    patient_id: prescription.patientId,
    consultation_id: prescription.consultationId,
    medication: prescription.medication,
    dosage: prescription.dosage,
    frequency: prescription.frequency,
    duration: prescription.duration,
    notes: prescription.notes,
    presentation: prescription.presentation,
    // issued_date is not a real column — created_at is the effective issue date
    issued_date: prescription.createdAt.toISOString(),
    created_at: prescription.createdAt.toISOString(),
    updated_at: prescription.updatedAt.toISOString(),
  };
}
