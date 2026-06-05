import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CreateQuickItemDtoSchema,
  ListQuickItemsQuerySchema,
  type CreateQuickItemDto,
  type ListQuickItemsQuery,
} from '@delta/shared-types';

import { ListQuickItemsUseCase } from '../../application/use-cases/quick-items/list-quick-items.use-case';
import { CreateQuickItemUseCase } from '../../application/use-cases/quick-items/create-quick-item.use-case';
import { DeleteQuickItemUseCase } from '../../application/use-cases/quick-items/delete-quick-item.use-case';
import type { QuickItem } from '../../domain/entities/quick-item.entity';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * QuickItemsController
 *
 * Manages doctor quick-item shortcuts under /api/doctor/quick-items.
 *
 * SECURITY:
 *   - doctorId is ALWAYS taken from the authenticated user (user.sub).
 *   - Never trust doctor_id from the request body — anti-IDOR.
 *   - All endpoints require DevAuthGuard (Etapa 1 only).
 */
@Controller('doctor/quick-items')
@UseGuards(DevAuthGuard)
export class QuickItemsController {
  constructor(
    private readonly listQuickItems: ListQuickItemsUseCase,
    private readonly createQuickItem: CreateQuickItemUseCase,
    private readonly deleteQuickItem: DeleteQuickItemUseCase,
  ) {}

  /**
   * GET /api/doctor/quick-items?type=exam|medication
   * Returns all quick items for the authenticated doctor.
   * Optionally filtered by item type.
   */
  @Get()
  async list(
    @Query(new ZodValidationPipe(ListQuickItemsQuerySchema)) query: ListQuickItemsQuery,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<QuickItem[]>> {
    const items = await this.listQuickItems.execute(user.sub, query.type);
    return { success: true, data: items };
  }

  /**
   * POST /api/doctor/quick-items
   * Creates a new quick item for the authenticated doctor.
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateQuickItemDtoSchema)) dto: CreateQuickItemDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<QuickItem>> {
    const item = await this.createQuickItem.execute(dto, user.sub);
    return { success: true, data: item };
  }

  /**
   * DELETE /api/doctor/quick-items/:id
   * Permanently deletes a quick item. Returns 204 No Content on success.
   * Ownership enforced — cross-doctor attempts return 404 (anti-IDOR).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<void> {
    await this.deleteQuickItem.execute(id, user.sub);
  }
}
