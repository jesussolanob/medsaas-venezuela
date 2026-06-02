import type { Transaction } from 'sequelize';
import type { PatientPackage } from '../entities/patient-package.entity';

export const PACKAGE_REPOSITORY = Symbol('IPackageRepository');

export interface PackageListFilters {
  doctorId: string;
  patientId?: string;
  status?: 'active' | 'completed';
}

export interface IPackageRepository {
  /** Find a package by ID. Returns null if not found. */
  findById(id: string): Promise<PatientPackage | null>;

  /** Find all packages for a given patient, scoped to the owning doctor. */
  findByPatientId(patientId: string, doctorId: string): Promise<PatientPackage[]>;

  /**
   * Find active packages for a patient identified by email hash.
   * Used by the public booking endpoint to check if a patient has sessions.
   * Only returns the count/existence — never leaks PII of other patients.
   */
  findActiveByEmailHash(emailHash: string, doctorId: string): Promise<PatientPackage[]>;

  /** Persist a new package. Returns the saved domain entity. */
  save(pkg: PatientPackage): Promise<PatientPackage>;

  /**
   * Consume one session with an optimistic lock.
   * Executes:
   *   UPDATE patient_packages
   *   SET used_sessions = used_sessions + 1,
   *       status = CASE WHEN used_sessions + 1 >= total_sessions THEN 'completed' ELSE 'active' END,
   *       updated_at = now()
   *   WHERE id = :id AND used_sessions = :currentUsedSessions AND status = 'active'
   *
   * Returns true when the update succeeded (exactly 1 row affected).
   * Returns false when 0 rows were affected (concurrent modification or already exhausted).
   * An optional Sequelize Transaction may be supplied for atomic booking flows.
   */
  consumeSessionOptimistic(
    packageId: string,
    currentUsedSessions: number,
    transaction?: Transaction,
  ): Promise<boolean>;
}
