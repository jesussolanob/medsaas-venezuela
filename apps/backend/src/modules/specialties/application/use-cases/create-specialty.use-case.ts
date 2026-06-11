import { Inject, Injectable } from '@nestjs/common';
import {
  ISpecialtyRepository,
  SPECIALTY_REPOSITORY,
} from '../../domain/repositories/specialty.repository';
import { SpecialtyConflictError } from '../../domain/errors/specialty-conflict.error';
import type { Specialty } from '../../domain/entities/specialty.entity';

export interface CreateSpecialtyInput {
  name: string;
  sortOrder?: number;
}

/**
 * CreateSpecialtyUseCase
 *
 * Creates a new specialty in the catalogue. Rejects duplicates with a typed
 * domain error (SpecialtyConflictError) so the response envelope carries the
 * proper machine-readable code.
 *
 * Called by POST /api/admin/specialties — super_admin only.
 */
@Injectable()
export class CreateSpecialtyUseCase {
  constructor(
    @Inject(SPECIALTY_REPOSITORY)
    private readonly repo: ISpecialtyRepository,
  ) {}

  async execute(input: CreateSpecialtyInput): Promise<Specialty> {
    const existing = await this.repo.findByName(input.name);
    if (existing) {
      throw new SpecialtyConflictError(input.name);
    }

    return this.repo.create({
      name: input.name,
      sortOrder: input.sortOrder ?? 100,
    });
  }
}
