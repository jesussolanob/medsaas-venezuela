import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { z } from 'zod';
import {
  ConfirmAppointmentSchema,
  ConfirmAppointmentInfoQuerySchema,
  type ConfirmAppointmentDto,
  type ConfirmAppointmentInfoQueryDto,
} from '@delta/shared-types';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { ConfirmAppointmentByTokenUseCase } from '../../application/use-cases/appointments/confirm-appointment-by-token.use-case';
import { GetAppointmentConfirmInfoUseCase } from '../../application/use-cases/appointments/get-appointment-confirm-info.use-case';
import { RescheduleByTokenUseCase } from '../../application/use-cases/appointments/reschedule-by-token.use-case';
import type { AppointmentPublicInfo } from '../../application/use-cases/appointments/get-appointment-confirm-info.use-case';
import type { AppointmentRescheduleInfo } from '../../application/use-cases/appointments/reschedule-by-token.use-case';

const RescheduleByTokenBodySchema = z.object({
  scheduledAt: z.string().datetime({ offset: true }),
});
type RescheduleByTokenBody = z.infer<typeof RescheduleByTokenBodySchema>;

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * PublicAppointmentsController
 *
 * Routes under /api/public/appointments — no AppAuthGuard, accessible by anyone.
 *
 * Security:
 *   - All endpoints validate a stateless HMAC token before touching the DB.
 *   - Invalid tokens return 404 (anti-enumeration — never expose if an ID exists).
 *   - Responses contain only safe non-PII fields (status, doctorName, date, time, modality).
 *
 * Used by the frontend's /cita/confirmar/[token] and /cita/reagendar/[token] pages.
 */
@Controller('public/appointments')
export class PublicAppointmentsController {
  constructor(
    private readonly confirmByToken: ConfirmAppointmentByTokenUseCase,
    private readonly getConfirmInfo: GetAppointmentConfirmInfoUseCase,
    private readonly rescheduleByToken: RescheduleByTokenUseCase,
  ) {}

  /**
   * GET /api/public/appointments/confirm-info?token=...
   *
   * Returns appointment info for the confirmation page without confirming the appointment.
   * Used to pre-render the page before the patient clicks "Confirmar".
   *
   * 404 on invalid/malformed token (anti-enumeration).
   */
  @Get('confirm-info')
  @UsePipes(new ZodValidationPipe(ConfirmAppointmentInfoQuerySchema))
  async getInfo(
    @Query() query: ConfirmAppointmentInfoQueryDto,
  ): Promise<SuccessResponse<AppointmentPublicInfo>> {
    const data = await this.getConfirmInfo.execute(query.token);
    return { success: true, data };
  }

  /**
   * POST /api/public/appointments/confirm
   *
   * Confirms an appointment via the HMAC token from a reminder email.
   * Idempotent: already-confirmed appointments return the current state.
   * Terminal appointments (cancelled/completed/no_show) return their status.
   *
   * 404 on invalid/malformed token (anti-enumeration).
   */
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Body(new ZodValidationPipe(ConfirmAppointmentSchema)) body: ConfirmAppointmentDto,
  ): Promise<SuccessResponse<AppointmentPublicInfo>> {
    const data = await this.confirmByToken.execute(body.token);
    return { success: true, data };
  }

  /**
   * GET /api/public/appointments/reschedule/:token
   *
   * Returns safe appointment info for the reschedule form without yet rescheduling.
   * The token is an HMAC-SHA256 reschedule token (single-use via scheduledAt hash).
   *
   * 404 on invalid/stale token (anti-enumeration).
   * 409 when the appointment is not in a reschedulable state (cancelled/completed).
   */
  @Get('reschedule/:token')
  async getRescheduleInfo(
    @Param('token') token: string,
  ): Promise<SuccessResponse<AppointmentRescheduleInfo>> {
    const data = await this.rescheduleByToken.getInfo(token);
    return { success: true, data };
  }

  /**
   * POST /api/public/appointments/reschedule/:token
   *
   * Moves the appointment to a new scheduledAt.
   *
   * Body: { scheduledAt: ISO8601 string with offset }
   *
   * Token is single-use: after the move, scheduledAt changes and the old token
   * is permanently stale (satMs mismatch). A new WhatsApp message with a fresh
   * token would be needed to reschedule again.
   *
   * 404 on invalid/stale token.
   * 409 on slot conflict (AppointmentConflictError).
   * 422 on non-reschedulable status.
   */
  @Post('reschedule/:token')
  @HttpCode(HttpStatus.OK)
  async reschedule(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(RescheduleByTokenBodySchema)) body: RescheduleByTokenBody,
  ): Promise<SuccessResponse<AppointmentRescheduleInfo>> {
    const data = await this.rescheduleByToken.execute(token, new Date(body.scheduledAt));
    return { success: true, data };
  }
}
