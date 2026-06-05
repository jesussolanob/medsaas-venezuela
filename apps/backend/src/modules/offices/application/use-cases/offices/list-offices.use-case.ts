import { Inject, Injectable } from '@nestjs/common';
import {
  IOfficeRepository,
  OFFICE_REPOSITORY,
} from '../../../domain/repositories/office.repository';
import type { Office } from '../../../domain/entities/office.entity';

@Injectable()
export class ListOfficesUseCase {
  constructor(
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
  ) {}

  async execute(doctorId: string): Promise<Office[]> {
    return this.officeRepo.listByDoctor(doctorId);
  }
}
