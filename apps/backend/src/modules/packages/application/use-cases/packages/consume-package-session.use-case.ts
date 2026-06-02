import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from 'sequelize';
import { PatientPackage } from '../../../domain/entities/patient-package.entity';
import { PackageNotFoundError } from '../../../domain/errors/package-not-found.error';
import { PackageNotOwnedError } from '../../../domain/errors/package-not-owned.error';
import { PackageExhaustedError } from '../../../domain/errors/package-exhausted.error';
import { PackageInsufficientSessionsError } from '../../../domain/errors/package-insufficient-sessions.error';
import {
  PACKAGE_REPOSITORY,
  type IPackageRepository,
} from '../../../domain/repositories/package.repository';

export interface ConsumePackageSessionInput {
  packageId: string;
  doctorId: string;
  /** Optional Sequelize transaction — supplied by CreateBookingUseCase for atomicity. */
  transaction?: Transaction;
}

const MAX_RETRIES = 3;

/**
 * Consumes one session from a patient package using an optimistic lock.
 *
 * Retry logic:
 *   - Read the current used_sessions.
 *   - Attempt the optimistic-lock UPDATE.
 *   - If the UPDATE returns 0 affected rows (concurrent modification), re-read
 *     and retry up to MAX_RETRIES times.
 *   - After exhausting retries, throw PackageInsufficientSessionsError.
 */
@Injectable()
export class ConsumePackageSessionUseCase {
  constructor(
    @Inject(PACKAGE_REPOSITORY)
    private readonly packageRepo: IPackageRepository,
  ) {}

  async execute(input: ConsumePackageSessionInput): Promise<PatientPackage> {
    // 1. Load the package and verify ownership
    const pkg = await this.packageRepo.findById(input.packageId);
    if (!pkg) throw new PackageNotFoundError(input.packageId);
    if (pkg.doctorId !== input.doctorId) throw new PackageNotOwnedError(input.packageId);

    // 2. Pre-check: is the package in a state where it can be consumed?
    if (!pkg.isAvailableFor(input.doctorId)) {
      throw new PackageExhaustedError(input.packageId);
    }

    // 3. Attempt optimistic lock with retries
    let attempts = 0;
    let current = await this.packageRepo.findById(input.packageId);

    while (attempts < MAX_RETRIES) {
      if (!current || current.status !== 'active' || current.remainingSessions <= 0) {
        throw new PackageExhaustedError(input.packageId);
      }

      const locked = await this.packageRepo.consumeSessionOptimistic(
        input.packageId,
        current.usedSessions,
        input.transaction,
      );

      if (locked) {
        // 4. Re-fetch to return the updated domain entity
        const updated = await this.packageRepo.findById(input.packageId);
        // The UPDATE succeeded so the row must exist — cast is safe
        return updated as PatientPackage;
      }

      // Concurrent modification: reload and retry
      attempts += 1;
      current = await this.packageRepo.findById(input.packageId);
    }

    throw new PackageInsufficientSessionsError(input.packageId);
  }
}
