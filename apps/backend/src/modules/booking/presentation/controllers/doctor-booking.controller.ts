import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { CreateBookingDtoSchema, type CreateBookingDto } from '@delta/shared-types';
import { CreateBookingUseCase } from '../../application/use-cases/booking/create-booking.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * DoctorBookingController — authenticated endpoints for doctor-initiated booking.
 *
 * Global prefix 'api' is set in main.ts.
 * All endpoints require AppAuthGuard (the doctor must be authenticated).
 *
 * This controller is intentionally separate from BookingController (which is
 * fully public and protected only by Turnstile stub). The separation keeps the
 * public surface clean and makes the auth boundary explicit.
 */
@Controller('doctor/appointments')
@UseGuards(AppAuthGuard)
export class DoctorBookingController {
  constructor(private readonly createBooking: CreateBookingUseCase) {}

  /**
   * POST /api/doctor/appointments
   *
   * Creates an appointment from the doctor's internal "Nueva consulta" flow.
   *
   * Key differences from the public POST /api/booking endpoint:
   *   1. Requires authentication (AppAuthGuard) — no Turnstile needed.
   *   2. Skips the booking-feature gate so that doctors on the Free plan can
   *      still create appointments from their own dashboard. The public booking
   *      link remains gated (agendar = core; public online booking = premium).
   *   3. Anti-IDOR: doctor_id is always overridden with user.sub regardless of
   *      the value sent in the request body.
   *
   * Response shape (matches the public endpoint for easy BFF normalisation):
   *   { success: true, data: { appointmentId, appointmentCode, scheduledAt, meetLink } }
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateBookingDtoSchema)) dto: CreateBookingDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    // Anti-IDOR: override doctor_id with the authenticated user's profile ID.
    // Any doctor_id present in the request body is deliberately discarded.
    const internalDto: CreateBookingDto = { ...dto, doctor_id: user.sub };

    const result = await this.createBooking.execute(internalDto, {
      skipBookingFeatureGate: true,
      // Doctor-initiated bookings bypass patient-facing rules (require_reason,
      // min_lead_days) — the doctor can always schedule regardless of those.
      skipPatientBookingRules: true,
    });

    return {
      success: true,
      data: {
        appointmentId: result.appointment.id,
        appointmentCode: result.appointmentCode,
        scheduledAt: result.appointment.scheduledAt,
        meetLink: result.meetLink,
      },
    };
  }
}
