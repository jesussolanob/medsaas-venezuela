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

@Injectable()
export class GetDoctorProfileUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
    @Inject(STORAGE_PORT)
    private readonly storagePort: IStoragePort,
  ) {}

  async execute(doctorId: string): Promise<DoctorProfile> {
    const profile = await this.profileRepo.findByDoctorId(doctorId);
    if (!profile) throw new DoctorProfileNotFoundError(doctorId);

    // Re-sign GCS image URLs so they are always fresh on read.
    // GCS v4 signed URLs expire after at most 7 days; avatars/logos stored
    // at upload time will become 403s without this refresh step.
    const [freshAvatarUrl, freshLogoUrl, freshSignatureUrl] = await Promise.all([
      resignGcsImageUrl(profile.avatarUrl, this.storagePort),
      resignGcsImageUrl(profile.logoUrl, this.storagePort),
      resignGcsImageUrl(profile.signatureUrl, this.storagePort),
    ]);

    if (
      freshAvatarUrl === profile.avatarUrl &&
      freshLogoUrl === profile.logoUrl &&
      freshSignatureUrl === profile.signatureUrl
    ) {
      // Nothing changed (MinIO or already fresh) — return as-is to avoid allocating
      return profile;
    }

    return profile.withRefreshedImageUrls(freshAvatarUrl, freshLogoUrl, freshSignatureUrl);
  }
}
