import { Inject, Injectable } from '@nestjs/common';
import { IOfficeRepository, OFFICE_REPOSITORY } from '../../../domain/repositories/office.repository';

@Injectable()
export class DeleteOfficeUseCase {
  constructor(
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
  ) {}

  async execute(officeId: string, doctorId: string): Promise<void> {
    // Repository scopes delete to (id, doctorId) and throws OfficeNotFoundError
    // when the record does not exist or belongs to another doctor.
    await this.officeRepo.delete(officeId, doctorId);
  }
}
