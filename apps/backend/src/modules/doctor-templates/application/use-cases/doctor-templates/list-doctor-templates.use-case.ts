import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_TEMPLATE_REPOSITORY,
  IDoctorTemplateRepository,
} from '../../../domain/repositories/doctor-template.repository';
import type { DoctorTemplate } from '../../../domain/entities/doctor-template.entity';

@Injectable()
export class ListDoctorTemplatesUseCase {
  constructor(
    @Inject(DOCTOR_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IDoctorTemplateRepository,
  ) {}

  async execute(doctorId: string): Promise<DoctorTemplate[]> {
    return this.templateRepo.listByDoctor(doctorId);
  }
}
