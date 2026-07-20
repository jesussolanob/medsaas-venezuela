import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UsePipes } from '@nestjs/common';
import {
  ConfirmAppointmentSchema,
  ConfirmAppointmentInfoQuerySchema,
  type ConfirmAppointmentDto,
  type ConfirmAppointmentInfoQueryDto,
} from '@delta/shared-types';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { ConfirmAppointmentByTokenUseCase } from '../../application/use-cases/appointments/confirm-appointment-by-token.use-case';
import { GetAppointmentConfirmInfoUseCase } from '../../application/use-cases/appointments/get-appointment-confirm-info.use-case';
import type { AppointmentPublicInfo } from '../../application/use-cases/appointments/get-appointment-confirm-info.use-case';

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
 * Used by the frontend's /cita/confirmar/[token] page.
 */
@Controller('public/appointments')
export class PublicAppointmentsController {
  constructor(
    private readonly confirmByToken: ConfirmAppointmentByTokenUseCase,
    private readonly getConfirmInfo: GetAppointmentConfirmInfoUseCase,
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
}
