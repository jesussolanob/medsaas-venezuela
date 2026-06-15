import { Body, Controller, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CreateSpecialtyDtoSchema,
  UpdateSpecialtyDtoSchema,
  type CreateSpecialtyDto,
  type UpdateSpecialtyDto,
} from '@delta/shared-types';
import { CreateSpecialtyUseCase } from '../../application/use-cases/create-specialty.use-case';
import { UpdateSpecialtyUseCase } from '../../application/use-cases/update-specialty.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface SpecialtyAdminDto {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AdminSpecialtiesController — admin-only specialty management.
 *
 * Both endpoints require AppAuthGuard + RolesGuard with @Roles('super_admin').
 *
 * POST /api/admin/specialties
 *   Creates a new specialty. Returns 409 if name already exists.
 *
 * PUT /api/admin/specialties/:id
 *   Partially updates an existing specialty.
 *   Can toggle is_active to activate/deactivate.
 *   Returns 404 if id not found, 409 if new name conflicts.
 */
@Controller('admin/specialties')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminSpecialtiesController {
  constructor(
    private readonly createSpecialty: CreateSpecialtyUseCase,
    private readonly updateSpecialty: UpdateSpecialtyUseCase,
  ) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateSpecialtyDtoSchema)) dto: CreateSpecialtyDto,
  ): Promise<SuccessResponse<SpecialtyAdminDto>> {
    const specialty = await this.createSpecialty.execute({
      name: dto.name,
      sortOrder: dto.sort_order,
    });
    return { success: true, data: this.toAdminDto(specialty) };
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateSpecialtyDtoSchema)) dto: UpdateSpecialtyDto,
  ): Promise<SuccessResponse<SpecialtyAdminDto>> {
    const specialty = await this.updateSpecialty.execute({
      id,
      name: dto.name,
      isActive: dto.is_active,
      sortOrder: dto.sort_order,
    });
    return { success: true, data: this.toAdminDto(specialty) };
  }

  private toAdminDto(s: {
    id: string;
    name: string;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }): SpecialtyAdminDto {
    return {
      id: s.id,
      name: s.name,
      isActive: s.isActive,
      sortOrder: s.sortOrder,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}
