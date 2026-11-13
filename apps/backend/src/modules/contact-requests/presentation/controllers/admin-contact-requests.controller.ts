import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ListContactRequestsUseCase } from '../../application/use-cases/list-contact-requests.use-case';
import { UpdateContactRequestUseCase } from '../../application/use-cases/update-contact-request.use-case';
import { CountPendingContactRequestsUseCase } from '../../application/use-cases/count-pending-contact-requests.use-case';
import {
  UpdateContactRequestAdminDtoSchema,
  ListContactRequestsQuerySchema,
} from '@delta/shared-types';

/**
 * AdminContactRequestsController — admin-only endpoints for contact requests.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 * All endpoints require AppAuthGuard + RolesGuard('super_admin').
 *
 * ROUTES:
 *   GET   /api/admin/contact-requests               — list with filters
 *   PATCH /api/admin/contact-requests/:id           — update status/notes
 *   GET   /api/admin/contact-requests/pending-count — badge count
 */
@Controller('admin/contact-requests')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminContactRequestsController {
  constructor(
    private readonly listUseCase: ListContactRequestsUseCase,
    private readonly updateUseCase: UpdateContactRequestUseCase,
    private readonly countUseCase: CountPendingContactRequestsUseCase,
  ) {}

  /**
   * GET /api/admin/contact-requests/pending-count
   *
   * Returns count of pending requests for the admin bell/badge.
   * NOTE: Route must be registered BEFORE /:id to avoid "pending-count" being
   * treated as a UUID param.
   */
  @Get('pending-count')
  async pendingCount(): Promise<{ success: true; data: { count: number } }> {
    const count = await this.countUseCase.execute();
    return { success: true, data: { count } };
  }

  /**
   * GET /api/admin/contact-requests
   *
   * Returns a paginated list of contact requests with doctor profile info.
   */
  @Get()
  async list(@Query() query: unknown): Promise<{ success: true; data: unknown; meta: unknown }> {
    const dto = ListContactRequestsQuerySchema.parse(query);
    const result = await this.listUseCase.execute(dto);
    return {
      success: true,
      data: result.items,
      meta: { total: result.total, limit: dto.limit, offset: dto.offset },
    };
  }

  /**
   * PATCH /api/admin/contact-requests/:id
   *
   * Updates status and/or notes on a contact request.
   */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ): Promise<{ success: true; data: unknown }> {
    const dto = UpdateContactRequestAdminDtoSchema.parse(body);
    const data = await this.updateUseCase.execute({
      id,
      actorId: user.sub,
      status: dto.status,
      notes: dto.notes,
    });
    return { success: true, data };
  }
}
