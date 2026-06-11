import { Inject, Injectable } from '@nestjs/common';
import {
  ISpecialtyRepository,
  SPECIALTY_REPOSITORY,
} from '../../domain/repositories/specialty.repository';
import type { Specialty } from '../../domain/entities/specialty.entity';

/**
 * ListActiveSpecialtiesUseCase
 *
 * Returns all active specialties ordered by sort_order ASC, name ASC.
 * Called by the public GET /api/specialties endpoint — no auth required.
 */
@Injectable()
export class ListActiveSpecialtiesUseCase {
  constructor(
    @Inject(SPECIALTY_REPOSITORY)
    private readonly repo: ISpecialtyRepository,
  ) {}

  async execute(): Promise<Specialty[]> {
    return this.repo.findAllActive();
  }
}
