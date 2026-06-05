import { Inject, Injectable } from '@nestjs/common';
import { IOfficeRepository, OFFICE_REPOSITORY } from '../../../domain/repositories/office.repository';
import type { Office } from '../../../domain/entities/office.entity';
import { OfficeNotFoundError } from '../../../domain/errors/office-not-found.error';

@Injectable()
export class ToggleOfficeUseCase {
  constructor(
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
  ) {}

  async execute(officeId: string, doctorId: string): Promise<Office> {
    // 1. Ownership check
    const existing = await this.officeRepo.findByIdForDoctor(officeId, doctorId);
    if (!existing) {
      throw new OfficeNotFoundError();
    }

    // 2. Toggle isActive using the entity's immutable method
    const toggled = existing.toggleActive();

    // 3. Persist and return
    return this.officeRepo.save(toggled);
  }
}
