import { Inject, Injectable } from '@nestjs/common';
import {
  ISpecialtyRepository,
  SPECIALTY_REPOSITORY,
} from '../../domain/repositories/specialty.repository';
import type { Specialty } from '../../domain/entities/specialty.entity';

/**
 * ListAllSpecialtiesUseCase
 *
 * Returns ALL specialties (active and inactive) ordered by sort_order ASC, name ASC.
 * Called by the admin GET /api/admin/specialties endpoint — requires super_admin role.
 */
@Injectable()
export class ListAllSpecialtiesUseCase {
  constructor(
    @Inject(SPECIALTY_REPOSITORY)
    private readonly repo: ISpecialtyRepository,
  ) {}

  async execute(): Promise<Specialty[]> {
    return this.repo.findAll();
  }
}
