import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { CreateBookingDtoSchema, type CreateBookingDto } from '@delta/shared-types';
import {
  CreateImmediateAppointmentDtoSchema,
  type CreateImmediateAppointmentDto,
} from '@delta/shared-types';
import { CreateBookingUseCase } from '../../application/use-cases/booking/create-booking.use-case';
import { GetImmediateWindowUseCase } from '../../application/use-cases/booking/get-immediate-window.use-case';
import { CreateImmediateAppointmentUseCase } from '../../application/use-cases/booking/create-immediate-appointment.use-case';
import { z } from 'zod';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/** Query-string schema for GET /api/doctor/appointments/immediate-window */
/**
 * La ventana es del ESPECIALISTA, no de un consultorio: su próxima cita lo
 * ocupa físicamente atienda donde atienda. Por eso no recibe `office_id` —
 * pedirlo obligaría al modal a elegir consultorio antes de poder avisar que no
 * queda espacio, y sería un parámetro que el caso de uso ni mira.
 */
const ImmediateWindowQuerySchema = z.object({
  duration_minutes: z.coerce.number().int().min(5).max(480),
});

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
// RolesGuard + @Roles explícito: sin esto, cualquier usuario autenticado
// (incluido un `seller`) alcanzaba estos endpoints y solo lo frenaba el
// anti-IDOR del paciente. Eso es defensa accidental, no una regla.
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('doctor', 'super_admin')
export class DoctorBookingController {
  constructor(
    private readonly createBooking: CreateBookingUseCase,
    private readonly getWindow: GetImmediateWindowUseCase,
    private readonly createImmediate: CreateImmediateAppointmentUseCase,
  ) {}

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
      // Una fecha ya pasada nace atendida: el especialista está registrando algo
      // que YA ocurrió, no agendando a futuro.
      doctorInitiated: true,
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

  /**
   * GET /api/doctor/appointments/immediate-window
   *
   * Returns how much time is available right now on the doctor's calendar before
   * their next active appointment. Used by the frontend to display the
   * "Hora libre" panel before starting an immediate walk-in consultation.
   *
   * Query params:
   *   - office_id: UUID of the office where the walk-in is happening (required for UI context)
   *   - duration_minutes: requested service duration in minutes (5–480)
   *
   * Response:
   *   { now, nextAppointmentAt, availableMinutes, effectiveDuration, fits }
   *
   * Security: doctorId always comes from the authenticated session (user.sub).
   */
  @Get('immediate-window')
  async immediateWindow(
    @Query(new ZodValidationPipe(ImmediateWindowQuerySchema))
    query: z.infer<typeof ImmediateWindowQuerySchema>,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const windowResult = await this.getWindow.execute({
      doctorId: user.sub,
      durationMinutes: query.duration_minutes,
    });

    return {
      success: true,
      data: {
        now: windowResult.now,
        nextAppointmentAt: windowResult.nextAppointmentAt,
        availableMinutes: windowResult.availableMinutes,
        effectiveDuration: windowResult.effectiveDuration,
        fits: windowResult.fits,
      },
    };
  }

  /**
   * POST /api/doctor/appointments/immediate
   *
   * Creates an immediate (walk-in) appointment whose scheduled_at is the
   * current server time. Any client-provided scheduled_at is ignored.
   *
   * The effective duration is resolved as:
   *   - force=false: min(duration_minutes, minutesUntilNextAppt)
   *     → throws NoImmediateSlotError (409) if < 5 minutes are available
   *   - force=true: always duration_minutes (doctor accepts the overlap)
   *
   * The patient's cross-doctor overlap check is NEVER bypassed — not even
   * with force=true.
   *
   * Security:
   *   - doctorId always from authenticated session (user.sub).
   *   - patient_id must belong to the authenticated doctor (anti-IDOR).
   *   - NEVER logs PII (patient name, cedula, email, phone).
   */
  @Post('immediate')
  async createImmediate_(
    @Body(new ZodValidationPipe(CreateImmediateAppointmentDtoSchema))
    dto: CreateImmediateAppointmentDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const result = await this.createImmediate.execute(user.sub, dto);

    return {
      success: true,
      data: {
        appointmentId: result.appointmentId,
        appointmentCode: result.appointmentCode,
        scheduledAt: result.scheduledAt,
        effectiveDuration: result.effectiveDuration,
        meetLink: result.meetLink,
        consultationId: result.consultationId,
      },
    };
  }
}
