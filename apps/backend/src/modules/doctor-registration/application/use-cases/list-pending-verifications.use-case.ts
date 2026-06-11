import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_REGISTRATION_REPOSITORY,
  type IDoctorRegistrationRepository,
} from '../../domain/repositories/doctor-registration.repository';
import type {
  DoctorRegistration,
  VerificationStatus,
} from '../../domain/entities/doctor-registration.entity';

export interface ListVerificationsInput {
  status: VerificationStatus;
  limit: number;
  offset: number;
}

/**
 * ListPendingVerificationsUseCase
 *
 * Returns doctors filtered by verification_status for the admin panel.
 * Callers MUST enforce @Roles('super_admin') before invoking this use case.
 *
 * SECURITY NOTE: The returned data includes identity PII (full_name, cedula,
 * email). This is intentional — the admin panel displays these for the
 * purpose of verifying doctor credentials. Never expose this use case to
 * non-admin contexts.
 */
@Injectable()
export class ListPendingVerificationsUseCase {
  constructor(
    @Inject(DOCTOR_REGISTRATION_REPOSITORY)
    private readonly repo: IDoctorRegistrationRepository,
  ) {}

  async execute(input: ListVerificationsInput): Promise<DoctorRegistration[]> {
    return this.repo.listByVerificationStatus(input.status, {
      limit: input.limit,
      offset: input.offset,
    });
  }
}
