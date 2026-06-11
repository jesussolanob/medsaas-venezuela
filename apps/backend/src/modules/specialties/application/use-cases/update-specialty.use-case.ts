import { Inject, Injectable } from '@nestjs/common';
import {
  ISpecialtyRepository,
  SPECIALTY_REPOSITORY,
} from '../../domain/repositories/specialty.repository';
import { SpecialtyNotFoundError } from '../../domain/errors/specialty-not-found.error';
import { SpecialtyConflictError } from '../../domain/errors/specialty-conflict.error';
import type { Specialty } from '../../domain/entities/specialty.entity';

export interface UpdateSpecialtyInput {
  id: string;
  name?: string;
  isActive?: boolean;
  sortOrder?: number;
}

/**
 * UpdateSpecialtyUseCase
 *
 * Partially updates an existing specialty (name, is_active, sort_order).
 * Enforces:
 *   - specialty must exist (SpecialtyNotFoundError)
 *   - if name is being changed, the new name must not conflict
 *     with a different specialty (SpecialtyConflictError)
 *
 * Called by PUT /api/admin/specialties/:id — super_admin only.
 */
@Injectable()
export class UpdateSpecialtyUseCase {
  constructor(
    @Inject(SPECIALTY_REPOSITORY)
    private readonly repo: ISpecialtyRepository,
  ) {}

  async execute(input: UpdateSpecialtyInput): Promise<Specialty> {
    const existing = await this.repo.findById(input.id);
    if (!existing) {
      throw new SpecialtyNotFoundError(input.id);
    }

    if (input.name !== undefined && input.name !== existing.name) {
      const conflict = await this.repo.findByName(input.name);
      if (conflict) {
        throw new SpecialtyConflictError(input.name);
      }
    }

    return this.repo.update(input.id, {
      name: input.name,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    });
  }
}
