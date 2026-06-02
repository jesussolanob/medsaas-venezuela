import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DomainError } from '../../../../../domain/errors/domain.error';
import {
  PACKAGE_REPOSITORY,
  type IPackageRepository,
} from '../../../../packages/domain/repositories/package.repository';
import { CryptoService } from '../../../../../infrastructure/crypto/crypto.service';

export interface BookingPackageSummary {
  id: string;
  planName: string;
  remainingSessions: number;
  totalSessions: number;
  usedSessions: number;
}

/** Raised when the supplied email query param is not a valid email address. */
export class InvalidEmailError extends DomainError {
  readonly code = 'INVALID_EMAIL';
  override readonly httpStatus = 400;
  constructor() {
    super('The email address provided is not valid');
  }
}

/**
 * Returns active packages for a patient identified by email hash.
 *
 * Security:
 *   - Validates email format with Zod before hashing (fix #5).
 *   - Hashes the email before any DB query — plaintext never reaches the DB.
 *   - Returns only safe summary fields — no patient_id, no PII (fix #3 extension).
 */
@Injectable()
export class GetBookingPackagesUseCase {
  constructor(
    @Inject(PACKAGE_REPOSITORY)
    private readonly packageRepo: IPackageRepository,
    private readonly crypto: CryptoService,
  ) {}

  async execute(doctorId: string, email: string): Promise<BookingPackageSummary[]> {
    // Validate email format — bad format returns 422, not 500 (fix #5).
    const parsed = z.string().email().safeParse(email);
    if (!parsed.success) {
      throw new InvalidEmailError();
    }

    const emailHash = this.crypto.hashForSearch(parsed.data);
    const packages = await this.packageRepo.findActiveByEmailHash(emailHash, doctorId);

    // Strip all PII and internal IDs from the response (fix #3 extension).
    return packages.map((pkg) => ({
      id: pkg.id,
      planName: pkg.planName,
      remainingSessions: pkg.remainingSessions,
      totalSessions: pkg.totalSessions,
      usedSessions: pkg.usedSessions,
    }));
  }
}
