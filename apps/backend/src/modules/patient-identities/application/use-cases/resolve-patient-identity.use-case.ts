import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PatientIdentity } from '../../domain/entities/patient-identity.entity';
import { PatientIdentityConflictError } from '../../domain/errors/patient-identity.errors';
import {
  PATIENT_IDENTITY_REPOSITORY,
  type IPatientIdentityRepository,
} from '../../domain/repositories/patient-identity.repository';
import { CryptoService } from '../../../../infrastructure/crypto/crypto.service';

/**
 * ResolvePatientIdentityUseCase — internal-only, not exposed via HTTP.
 *
 * Resolves a global identity UUID for a given plaintext cedula.
 * Algorithm (idempotent, race-safe):
 *   1. Return null immediately if cedula is null/empty.
 *   2. Compute the global HMAC hash (same secret as patients.cedula_search_hash).
 *   3. SELECT patient_identities WHERE cedula_hash = :hash.
 *      If found → return existing id.
 *   4. INSERT new row (cedula_hash + cedula_encrypted).
 *      On unique-violation conflict (concurrent insert) → re-SELECT and return.
 *   5. Return the resolved identity id.
 *
 * PRIVACY: Result (identity UUID) is stored in patients.identity_id only.
 * It is never returned to callers above the application layer.
 */
@Injectable()
export class ResolvePatientIdentityUseCase {
  constructor(
    @Inject(PATIENT_IDENTITY_REPOSITORY)
    private readonly identityRepo: IPatientIdentityRepository,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * @param cedulaPlaintext - raw cedula string from the patient record
   * @returns the global identity UUID, or null if cedula is absent
   */
  async execute(cedulaPlaintext: string | null | undefined): Promise<string | null> {
    if (!cedulaPlaintext || cedulaPlaintext.trim() === '') {
      return null;
    }

    const cedulaHash = this.crypto.hashForSearch(cedulaPlaintext);

    // Fast path: existing identity
    const existing = await this.identityRepo.findByCedulaHash(cedulaHash);
    if (existing) {
      return existing.id;
    }

    // Slow path: create new identity — handle concurrent-insert race
    const cedulaEncrypted = this.crypto.encrypt(cedulaPlaintext);
    const newIdentity = PatientIdentity.create({
      id: randomUUID(),
      cedulaHash,
      cedulaEncrypted,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    try {
      const saved = await this.identityRepo.save(newIdentity);
      return saved.id;
    } catch (err) {
      if (err instanceof PatientIdentityConflictError) {
        // Another request inserted the row concurrently — re-query.
        const raceWinner = await this.identityRepo.findByCedulaHash(cedulaHash);
        return raceWinner?.id ?? null;
      }
      throw err;
    }
  }
}
