import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CreateOfficeDtoSchema,
  UpdateOfficeDtoSchema,
  type CreateOfficeDto,
  type UpdateOfficeDto,
} from '@delta/shared-types';

import { ListOfficesUseCase } from '../../application/use-cases/offices/list-offices.use-case';
import { CreateOfficeUseCase } from '../../application/use-cases/offices/create-office.use-case';
import { UpdateOfficeUseCase } from '../../application/use-cases/offices/update-office.use-case';
import { DeleteOfficeUseCase } from '../../application/use-cases/offices/delete-office.use-case';
import { ToggleOfficeUseCase } from '../../application/use-cases/offices/toggle-office.use-case';
import type { Office } from '../../domain/entities/office.entity';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * OfficesController
 *
 * Manages doctor office CRUD under /api/doctor/offices.
 *
 * SECURITY:
 *   - doctorId is ALWAYS taken from the authenticated user (user.sub).
 *   - Never trust doctor_id from the request body — anti-IDOR.
 *   - All endpoints require DevAuthGuard (Etapa 1 only).
 */
@Controller('doctor/offices')
@UseGuards(DevAuthGuard)
export class OfficesController {
  constructor(
    private readonly listOffices: ListOfficesUseCase,
    private readonly createOffice: CreateOfficeUseCase,
    private readonly updateOffice: UpdateOfficeUseCase,
    private readonly deleteOffice: DeleteOfficeUseCase,
    private readonly toggleOffice: ToggleOfficeUseCase,
  ) {}

  /**
   * GET /api/doctor/offices
   * Returns all offices for the authenticated doctor, ordered by created_at ASC.
   */
  @Get()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<SuccessResponse<Office[]>> {
    const offices = await this.listOffices.execute(user.sub);
    return { success: true, data: offices };
  }

  /**
   * POST /api/doctor/offices
   * Creates a new office for the authenticated doctor.
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateOfficeDtoSchema)) dto: CreateOfficeDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<Office>> {
    const office = await this.createOffice.execute(dto, user.sub);
    return { success: true, data: office };
  }

  /**
   * PUT /api/doctor/offices/:id
   * Updates an existing office (ownership enforced — cross-doctor → 404).
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateOfficeDtoSchema)) dto: UpdateOfficeDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<Office>> {
    const office = await this.updateOffice.execute(id, dto, user.sub);
    return { success: true, data: office };
  }

  /**
   * DELETE /api/doctor/offices/:id
   * Permanently deletes an office. Returns 204 No Content on success.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<void> {
    await this.deleteOffice.execute(id, user.sub);
  }

  /**
   * PATCH /api/doctor/offices/:id/toggle
   * Toggles the is_active flag of an office (ownership enforced).
   */
  @Patch(':id/toggle')
  async toggle(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<Office>> {
    const office = await this.toggleOffice.execute(id, user.sub);
    return { success: true, data: office };
  }
}
