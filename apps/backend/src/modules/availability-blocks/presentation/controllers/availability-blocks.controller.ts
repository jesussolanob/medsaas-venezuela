import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  CreateAvailabilityBlockDtoSchema,
  type CreateAvailabilityBlockDto,
} from '@delta/shared-types';
import { ListAvailabilityBlocksUseCase } from '../../application/use-cases/availability-blocks/list-availability-blocks.use-case';
import { CreateAvailabilityBlockUseCase } from '../../application/use-cases/availability-blocks/create-availability-block.use-case';
import { DeleteAvailabilityBlockUseCase } from '../../application/use-cases/availability-blocks/delete-availability-block.use-case';
import type { AvailabilityBlock } from '../../domain/entities/availability-block.entity';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface BlockOutput {
  id: string;
  doctor_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

function toOutput(block: AvailabilityBlock): BlockOutput {
  return {
    id: block.id,
    doctor_id: block.doctorId,
    starts_at: block.startsAt.toISOString(),
    ends_at: block.endsAt.toISOString(),
    reason: block.reason,
    created_at: block.createdAt.toISOString(),
    updated_at: block.updatedAt.toISOString(),
  };
}

/**
 * AvailabilityBlocksController
 *
 * Manages calendar blocks that prevent bookings (vacations, absences, etc.).
 *
 * SECURITY: doctor_id is ALWAYS taken from the authenticated user (user.sub).
 * DELETE verifies ownership — foreign blocks return 404 (anti-IDOR).
 */
@Controller('doctor/availability-blocks')
@UseGuards(DevAuthGuard)
export class AvailabilityBlocksController {
  constructor(
    private readonly listBlocks: ListAvailabilityBlocksUseCase,
    private readonly createBlock: CreateAvailabilityBlockUseCase,
    private readonly deleteBlock: DeleteAvailabilityBlockUseCase,
  ) {}

  /**
   * GET /api/doctor/availability-blocks?from=&to=
   * Returns all availability blocks for the authenticated doctor,
   * optionally filtered by ISO 8601 date strings.
   */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
  ): Promise<SuccessResponse<BlockOutput[]>> {
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;

    const blocks = await this.listBlocks.execute({
      doctorId: user.sub,
      from,
      to,
    });

    return { success: true, data: blocks.map(toOutput) };
  }

  /**
   * POST /api/doctor/availability-blocks
   * Creates a new availability block for the authenticated doctor.
   * Body: { starts_at: ISO8601, ends_at: ISO8601, reason?: string }
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateAvailabilityBlockDtoSchema))
    dto: CreateAvailabilityBlockDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<BlockOutput>> {
    const block = await this.createBlock.execute({
      doctorId: user.sub,
      startsAt: new Date(dto.starts_at),
      endsAt: new Date(dto.ends_at),
      reason: dto.reason ?? null,
    });

    return { success: true, data: toOutput(block) };
  }

  /**
   * DELETE /api/doctor/availability-blocks/:id
   * Deletes an availability block. Returns 404 if not found or owned by another doctor.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    await this.deleteBlock.execute({ blockId: id, actorId: user.sub });
  }
}
