import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_TEMPLATE_REPOSITORY,
  IDoctorTemplateRepository,
} from '../../../domain/repositories/doctor-template.repository';
import type { DoctorTemplate } from '../../../domain/entities/doctor-template.entity';
import {
  STORAGE_PORT,
  type IStoragePort,
} from '../../../../storage/application/ports/storage.port';
import { resignGcsImageUrl } from '../../../../storage/application/helpers/resign-gcs-image.helper';

@Injectable()
export class ListDoctorTemplatesUseCase {
  constructor(
    @Inject(DOCTOR_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IDoctorTemplateRepository,
    @Inject(STORAGE_PORT)
    private readonly storagePort: IStoragePort,
  ) {}

  async execute(doctorId: string): Promise<DoctorTemplate[]> {
    const templates = await this.templateRepo.listByDoctor(doctorId);

    // Re-sign GCS image URLs so logo and signature are always accessible on read.
    return Promise.all(
      templates.map(async (t) => {
        const [freshLogoUrl, freshSignatureUrl] = await Promise.all([
          resignGcsImageUrl(t.logoUrl, this.storagePort),
          resignGcsImageUrl(t.signatureUrl, this.storagePort),
        ]);

        if (freshLogoUrl === t.logoUrl && freshSignatureUrl === t.signatureUrl) {
          return t;
        }

        return t.withRefreshedImageUrls(freshLogoUrl, freshSignatureUrl);
      }),
    );
  }
}
