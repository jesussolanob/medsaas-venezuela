import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { CurrentUser } from '../../../../presentation/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { GetConsultationBlocksUseCase } from '../../application/use-cases/consultation-blocks/get-consultation-blocks.use-case';
import { SaveConsultationBlocksUseCase } from '../../application/use-cases/consultation-blocks/save-consultation-blocks.use-case';
import {
  SaveBlocksDtoSchema,
  type SaveBlocksDto,
} from '../../application/dtos/consultation-block.dto';

/**
 * ConsultationBlocksController
 *
 * Exposes:
 *   GET  /api/doctor/consultation-blocks  — full state (catalog + config + resolved)
 *   PUT  /api/doctor/consultation-blocks  — replace the doctor's entire configuration
 *
 * Auth: DevAuthGuard (Etapa 1). doctorId comes from request.user.sub to prevent IDOR.
 *
 * DEVIATION from legacy: The legacy route allowed super_admin to pass a doctor_id
 * query param to operate on another doctor's config. In Etapa 1 this is intentionally
 * omitted — every doctor operates only on their own config (user.sub). The super_admin
 * pathway can be added in Etapa 2 behind a dedicated admin route with RBAC.
 */
@Controller('doctor/consultation-blocks')
@UseGuards(AppAuthGuard)
export class ConsultationBlocksController {
  constructor(
    private readonly getBlocks: GetConsultationBlocksUseCase,
    private readonly saveBlocks: SaveConsultationBlocksUseCase,
  ) {}

  /**
   * GET /api/doctor/consultation-blocks
   *
   * Returns the full block state for the authenticated doctor:
   *   - catalog: all available blocks (ordered by key)
   *   - doctor_config: the doctor's saved overrides
   *   - resolved: the final merged+sorted block list (enabled blocks only)
   *   - specialty_defaults: defaults for the doctor's specialty
   *   - doctor_specialty: the doctor's registered specialty (or null)
   */
  @Get()
  async get(@CurrentUser() user: CurrentUserPayload): Promise<{ success: true; data: unknown }> {
    const data = await this.getBlocks.execute(user.sub);
    return { success: true, data };
  }

  /**
   * PUT /api/doctor/consultation-blocks
   *
   * Replaces the doctor's entire consultation block configuration atomically.
   * Body must contain a `blocks` array with at least one enabled block.
   * All block_key values must exist in the consultation_block_catalog.
   *
   * Returns: { success: true, data: { success: true, blocks_saved: N } }
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  async save(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(SaveBlocksDtoSchema)) dto: SaveBlocksDto,
  ): Promise<{ success: true; data: unknown }> {
    const result = await this.saveBlocks.execute(user.sub, dto);
    return { success: true, data: result };
  }
}
