import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  SchedulePendingConsultationDtoSchema,
  type SchedulePendingConsultationDto,
  type PendingConsultationPublicInfo,
} from '@delta/shared-types';
import { GetPendingConsultationByTokenUseCase } from '../../application/use-cases/get-pending-consultation-by-token.use-case';
import { SchedulePendingConsultationByTokenUseCase } from '../../application/use-cases/schedule-pending-consultation-by-token.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * PublicPendingConsultationsController
 *
 * Unauthenticated (patient-facing) endpoints for scheduling pending sessions
 * via the HMAC token link sent by the doctor.
 *
 * SECURITY:
 *   - No auth guard — authentication is the token itself (HMAC-SHA256).
 *   - Invalid tokens always produce 404 (anti-enumeration).
 *   - Responses never expose internal IDs, patient PII, or doctor PII beyond display name.
 *   - Strict Zod validation on all bodies.
 */
@Controller('public/pending-consultations')
export class PublicPendingConsultationsController {
  constructor(
    private readonly getByToken: GetPendingConsultationByTokenUseCase,
    private readonly scheduleByToken: SchedulePendingConsultationByTokenUseCase,
  ) {}

  /**
   * GET /api/public/pending-consultations/:token
   * Returns public info for the pending consultation identified by the token.
   * Safe fields only: plan_name, session_number, expires_at, is_schedulable, doctor_name.
   */
  @Get(':token')
  async getInfo(
    @Param('token') token: string,
  ): Promise<SuccessResponse<PendingConsultationPublicInfo>> {
    const info = await this.getByToken.execute(token);
    return { success: true, data: info };
  }

  /**
   * POST /api/public/pending-consultations/:token/schedule
   * Schedules the pending consultation (creates appointment + consultation) using the token.
   * Returns minimal confirmation data (no internal IDs exposed).
   */
  @Post(':token/schedule')
  @HttpCode(HttpStatus.OK)
  async schedule(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(SchedulePendingConsultationDtoSchema))
    dto: SchedulePendingConsultationDto,
  ): Promise<SuccessResponse<{ scheduled: true; session_number: number }>> {
    const result = await this.scheduleByToken.execute({
      token,
      scheduledAt: new Date(dto.scheduled_at),
      officeId: dto.office_id ?? null,
      appointmentMode: dto.appointment_mode ?? null,
    });
    return {
      success: true,
      data: { scheduled: true, session_number: result.sessionNumber },
    };
  }
}
