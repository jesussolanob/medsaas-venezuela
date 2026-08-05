import { Inject, Injectable } from '@nestjs/common';
import type { ConsultationBlock } from '../../../domain/entities/consultation-block.entity';
import {
  CONSULTATION_BLOCK_REPOSITORY,
  type CatalogRow,
  type DoctorBlockRow,
  type IConsultationBlockRepository,
  type SpecialtyDefaultRow,
} from '../../../domain/repositories/consultation-block.repository';

export interface GetConsultationBlocksOutput {
  catalog: CatalogRow[];
  doctor_config: DoctorBlockRow[];
  resolved: ConsultationBlock[];
  specialty_defaults: SpecialtyDefaultRow[];
  doctor_specialty: string | null;
  /**
   * Display layout for consultation blocks.
   * 'tabs' (default) | 'vertical'. Set by the doctor via PUT.
   */
  layout: 'tabs' | 'vertical';
}

/**
 * Fetches all data required by the GET /api/doctor/consultation-blocks endpoint.
 *
 * Executes catalog, doctor overrides, specialty defaults, and resolved blocks
 * in parallel. doctorId always comes from the auth token (anti-IDOR).
 */
@Injectable()
export class GetConsultationBlocksUseCase {
  constructor(
    @Inject(CONSULTATION_BLOCK_REPOSITORY)
    private readonly repo: IConsultationBlockRepository,
  ) {}

  async execute(doctorId: string): Promise<GetConsultationBlocksOutput> {
    const [specialty, layout] = await Promise.all([
      this.repo.getDoctorSpecialty(doctorId),
      this.repo.getDoctorLayout(doctorId),
    ]);

    const [catalog, doctorConfig, specialtyDefaults, resolved] = await Promise.all([
      this.repo.listCatalog(),
      this.repo.listDoctorBlocks(doctorId),
      this.repo.listSpecialtyDefaults(specialty),
      this.repo.resolveBlocks(doctorId, specialty),
    ]);

    return {
      catalog,
      doctor_config: doctorConfig,
      resolved,
      specialty_defaults: specialtyDefaults,
      doctor_specialty: specialty,
      layout,
    };
  }
}
