import type { EhrRecord } from '../entities/ehr-record.entity';

export const EHR_REPOSITORY = 'EHR_REPOSITORY';

/**
 * Contract for EHR record persistence.
 *
 * The application layer depends only on this interface — never on the
 * Sequelize implementation — to keep the domain layer infrastructure-free.
 */
export interface IEhrRepository {
  /** Find one by ID scoped to doctorId (returns null for foreign/missing IDs). */
  findById(id: string, doctorId: string): Promise<EhrRecord | null>;

  /** Returns all EHR records for a patient, scoped to doctorId. Sorted DESC by createdAt. */
  findByPatient(patientId: string, doctorId: string): Promise<EhrRecord[]>;

  /** Persist a new EHR record. */
  save(record: EhrRecord): Promise<EhrRecord>;

  /**
   * Partial update of clinical fields, scoped to (id, doctorId).
   * Only the provided fields are written; others remain unchanged.
   */
  update(
    id: string,
    doctorId: string,
    fields: Partial<Pick<EhrRecord, 'diagnosis' | 'treatmentPlan'>>,
  ): Promise<EhrRecord>;

  /**
   * Returns the EHR record for a specific consultation, scoped to doctorId.
   * Returns null when no EHR record exists for the consultation.
   * Used by document-sharing to assemble the PDF.
   */
  findByConsultation(consultationId: string, doctorId: string): Promise<EhrRecord | null>;
}
