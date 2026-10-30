import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { GetSupportInfoUseCase } from '../../application/use-cases/get-support-info.use-case';
import { RequestContactUseCase } from '../../application/use-cases/request-contact.use-case';
import { GetCurrentContactRequestUseCase } from '../../application/use-cases/get-current-contact-request.use-case';
import { CreateContactRequestDtoSchema } from '@delta/shared-types';

/**
 * ContactRequestsController — doctor-facing endpoints.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 * All endpoints require AppAuthGuard.
 *
 * ROUTES:
 *   GET  /api/doctor/support-info               — support info + callNowAvailable
 *   POST /api/doctor/contact-requests           — create/update contact request
 *   GET  /api/doctor/contact-requests/current   — current pending request (or null)
 *
 * SECURITY:
 *   - doctorId is ALWAYS taken from the authenticated user (user.sub) — anti-IDOR.
 *   - NEVER log PII (doctor email, phone, name).
 */
@Controller('doctor')
@UseGuards(AppAuthGuard)
export class ContactRequestsController {
  constructor(
    private readonly getSupportInfo: GetSupportInfoUseCase,
    private readonly requestContact: RequestContactUseCase,
    private readonly getCurrentRequest: GetCurrentContactRequestUseCase,
  ) {}

  /**
   * GET /api/doctor/support-info
   *
   * Returns support contact info and whether call_now is currently available.
   */
  @Get('support-info')
  async supportInfo(): Promise<{ success: true; data: unknown }> {
    const data = await this.getSupportInfo.execute();
    return { success: true, data };
  }

  /**
   * POST /api/doctor/contact-requests
   *
   * Creates or updates the doctor's pending contact request.
   */
  @Post('contact-requests')
  @HttpCode(200)
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ): Promise<{ success: true; data: unknown }> {
    const dto = CreateContactRequestDtoSchema.parse(body);
    const data = await this.requestContact.execute({
      doctorId: user.sub,
      channel: dto.channel,
      message: dto.message,
    });
    return { success: true, data };
  }

  /**
   * GET /api/doctor/contact-requests/current
   *
   * Returns the doctor's current pending contact request, or null.
   */
  @Get('contact-requests/current')
  async current(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ success: true; data: unknown }> {
    const data = await this.getCurrentRequest.execute(user.sub);
    return { success: true, data };
  }
}
