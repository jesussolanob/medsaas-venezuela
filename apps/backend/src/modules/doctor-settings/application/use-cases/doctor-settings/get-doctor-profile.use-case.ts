import { Inject, Injectable } from '@nestjs/common';
import type { DoctorProfile } from '../../../domain/entities/doctor-profile.entity';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../domain/repositories/doctor-profile.repository';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';
import {
  STORAGE_PORT,
  type IStoragePort,
} from '../../../../storage/application/ports/storage.port';
import { resignGcsImageUrl } from '../../../../storage/application/helpers/resign-gcs-image.helper';
import {
  OFFICE_REPOSITORY,
  type IOfficeRepository,
} from '../../../../offices/domain/repositories/office.repository';
import {
  PRICING_PLAN_REPOSITORY,
  type IPricingPlanRepository,
} from '../../../../packages/domain/repositories/pricing-plan.repository';

@Injectable()
export class GetDoctorProfileUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
    @Inject(STORAGE_PORT)
    private readonly storagePort: IStoragePort,
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
    @Inject(PRICING_PLAN_REPOSITORY)
    private readonly pricingPlanRepo: IPricingPlanRepository,
  ) {}

  async execute(doctorId: string): Promise<DoctorProfile> {
    const profile = await this.profileRepo.findByDoctorId(doctorId);
    if (!profile) throw new DoctorProfileNotFoundError(doctorId);

    // Re-sign GCS image URLs and load enrichment data in parallel.
    // hasActiveOffice / hasActiveService allow the onboarding wizard to know
    // which step to resume at, without requiring an extra round-trip.
    const [freshAvatarUrl, freshLogoUrl, freshSignatureUrl, activeOffices, allPlans] =
      await Promise.all([
        resignGcsImageUrl(profile.avatarUrl, this.storagePort),
        resignGcsImageUrl(profile.logoUrl, this.storagePort),
        resignGcsImageUrl(profile.signatureUrl, this.storagePort),
        this.officeRepo.findActiveByDoctor(doctorId),
        this.pricingPlanRepo.findAllByDoctorId(doctorId),
      ]);

    const hasActiveOffice = activeOffices.length > 0;
    const hasActiveService = allPlans.some((p) => p.isActive);

    // Build an enriched profile with fresh image URLs and active-resource flags.
    return profile.withRefreshedImageUrls(
      freshAvatarUrl,
      freshLogoUrl,
      freshSignatureUrl,
      hasActiveOffice,
      hasActiveService,
    );
  }
}
