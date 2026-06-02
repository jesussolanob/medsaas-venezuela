import type { Prescription } from '../entities/prescription.entity';

export const PRESCRIPTION_REPOSITORY = 'PRESCRIPTION_REPOSITORY';

/**
 * Contract for prescription persistence.
 *
 * The application layer depends only on this interface — never on the
 * Sequelize implementation — to keep the domain layer infrastructure-free.
 */
export interface IPrescriptionRepository {
  /** Find one by ID scoped to doctorId (returns null for foreign/missing IDs). */
  findById(id: string, doctorId: string): Promise<Prescription | null>;

  /** Returns all prescriptions for a patient, scoped to doctorId. Sorted DESC by createdAt. */
  findByPatient(patientId: string, doctorId: string): Promise<Prescription[]>;

  /** Persist a new prescription. */
  save(prescription: Prescription): Promise<Prescription>;
}
