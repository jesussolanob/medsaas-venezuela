import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { CreatePackageDto } from '@delta/shared-types';
import { PatientPackage } from '../../../domain/entities/patient-package.entity';
import {
  PACKAGE_REPOSITORY,
  type IPackageRepository,
} from '../../../domain/repositories/package.repository';

/**
 * Creates a new pre-paid session package for a patient.
 *
 * The doctor_id comes from the authenticated session (user.sub) — not from the
 * request body — to prevent IDOR: a doctor cannot create packages on behalf of
 * another doctor.
 */
@Injectable()
export class CreatePackageUseCase {
  constructor(
    @Inject(PACKAGE_REPOSITORY)
    private readonly packageRepo: IPackageRepository,
  ) {}

  async execute(dto: CreatePackageDto, doctorId: string): Promise<PatientPackage> {
    const now = new Date();
    const pkg = PatientPackage.create({
      id: randomUUID(),
      doctorId,
      patientId: dto.patient_id,
      planName: dto.plan_name,
      totalSessions: dto.total_sessions,
      usedSessions: 0,
      status: 'active',
      purchasedAmountUsd: dto.purchased_amount_usd ?? null,
      specialty: dto.specialty ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return this.packageRepo.save(pkg);
  }
}
