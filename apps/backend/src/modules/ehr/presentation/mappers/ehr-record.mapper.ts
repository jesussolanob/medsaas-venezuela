import type { EhrRecord } from '../../domain/entities/ehr-record.entity';

/**
 * Maps an EhrRecord domain entity to the API response shape.
 *
 * Clinical fields (diagnosis, treatment_plan) are returned in plaintext —
 * the authenticated doctor is the owner of these records.
 *
 * SECURITY: never expose EHR records from another doctor. Ownership is enforced
 * upstream in the use case and repository layers.
 */
export function toEhrRecordResponse(record: EhrRecord): Record<string, unknown> {
  return {
    id: record.id,
    doctor_id: record.doctorId,
    patient_id: record.patientId,
    consultation_id: record.consultationId,
    diagnosis: record.diagnosis,
    treatment_plan: record.treatmentPlan,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  };
}
