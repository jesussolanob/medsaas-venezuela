import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { CreateBookingDtoSchema, type CreateBookingDto } from '@delta/shared-types';
import { CreateBookingUseCase } from '../../application/use-cases/booking/create-booking.use-case';
import { GetBookingDoctorInfoUseCase } from '../../application/use-cases/booking/get-booking-doctor-info.use-case';
import { GetBookingPlansUseCase } from '../../application/use-cases/booking/get-booking-plans.use-case';
import { GetBookingPackagesUseCase } from '../../application/use-cases/booking/get-booking-packages.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * BookingController — public endpoints (no auth required).
 *
 * Global prefix 'api' is set in main.ts.
 * All logic lives in use cases — the controller only orchestrates and formats.
 *
 * DEFERRED (not implemented, requires doctor_schedule table which does not exist):
 *   - GET /booking/:doctorId/slots?date=YYYY-MM-DD  → slot availability
 */
@Controller('booking')
export class BookingController {
  constructor(
    private readonly createBooking: CreateBookingUseCase,
    private readonly getDoctorInfo: GetBookingDoctorInfoUseCase,
    private readonly getPlans: GetBookingPlansUseCase,
    private readonly getPackages: GetBookingPackagesUseCase,
  ) {}

  /**
   * GET /api/booking/:doctorId/info
   * Returns public doctor profile info for the booking form.
   * 404 (via DoctorNotFoundError) when doctor does not exist or is inactive.
   */
  @Get(':doctorId/info')
  async getDoctorInfoEndpoint(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
  ): Promise<SuccessResponse<unknown>> {
    const info = await this.getDoctorInfo.execute(doctorId);
    return { success: true, data: info };
  }

  /**
   * GET /api/booking/:doctorId/plans
   * Returns pricing plans visible in the booking widget (show_in_booking=true, is_active=true).
   */
  @Get(':doctorId/plans')
  async getDoctorPlans(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
  ): Promise<SuccessResponse<unknown>> {
    const plans = await this.getPlans.execute(doctorId);
    return { success: true, data: plans };
  }

  /**
   * GET /api/booking/:doctorId/packages?email=
   *
   * Returns active packages for a patient identified by email.
   * Email is validated with Zod before hashing — invalid format → 422.
   * Only safe summary fields returned — no patient_id, no PII.
   */
  @Get(':doctorId/packages')
  async getPatientPackages(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @Query('email') email: string,
  ): Promise<SuccessResponse<unknown>> {
    if (!email) {
      return { success: true, data: [] };
    }
    const packages = await this.getPackages.execute(doctorId, email);
    return { success: true, data: packages };
  }

  /**
   * POST /api/booking
   * Creates a new appointment from the public booking form.
   * No auth header required — protected by Cloudflare Turnstile (stubbed in Etapa 1).
   * patientId is NOT included in the response (fix: no internal IDs on public surface).
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateBookingDtoSchema)) dto: CreateBookingDto,
  ): Promise<SuccessResponse<unknown>> {
    const result = await this.createBooking.execute(dto);
    return {
      success: true,
      data: {
        appointmentCode: result.appointmentCode,
        appointmentId: result.appointment.id,
        scheduledAt: result.appointment.scheduledAt,
        // patientId intentionally omitted — no internal IDs on public endpoints.
      },
    };
  }
}
