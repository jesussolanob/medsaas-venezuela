import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { CreateBookingDtoSchema, type CreateBookingDto } from '@delta/shared-types';
import { z } from 'zod';
import { CreateBookingUseCase } from '../../application/use-cases/booking/create-booking.use-case';
import { GetBookingDoctorInfoUseCase } from '../../application/use-cases/booking/get-booking-doctor-info.use-case';
import { GetBookingPlansUseCase } from '../../application/use-cases/booking/get-booking-plans.use-case';
import { GetBookingPackagesUseCase } from '../../application/use-cases/booking/get-booking-packages.use-case';
import { GetAvailableSlotsUseCase } from '../../application/use-cases/booking/get-available-slots.use-case';
import { GetBookingOfficesUseCase } from '../../application/use-cases/booking/get-booking-offices.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/** Zod schema for the ?date= query param — strict YYYY-MM-DD format. */
const DateQuerySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format')
  .refine((s) => !isNaN(Date.parse(`${s}T00:00:00Z`)), {
    message: 'date is not a valid calendar date',
  });

/**
 * BookingController — public endpoints (no auth required).
 *
 * Global prefix 'api' is set in main.ts.
 * All logic lives in use cases — the controller only orchestrates and formats.
 */
@Controller('booking')
export class BookingController {
  constructor(
    private readonly createBooking: CreateBookingUseCase,
    private readonly getDoctorInfo: GetBookingDoctorInfoUseCase,
    private readonly getPlans: GetBookingPlansUseCase,
    private readonly getPackages: GetBookingPackagesUseCase,
    private readonly getSlots: GetAvailableSlotsUseCase,
    private readonly getOffices: GetBookingOfficesUseCase,
  ) {}

  /**
   * GET /api/booking/:doctorId/offices
   *
   * Public endpoint — no auth required.
   * Returns ACTIVE offices for the doctor with public fields only.
   * Used by the booking widget to let patients select a consultorio.
   *
   * Response fields per office (camelCase):
   *   id, name, address, city, phone, schedule, slotDuration,
   *   bufferMinutes, modality, allowsOnline
   *
   * No PII, no doctorId, no createdAt/updatedAt exposed.
   */
  @Get(':doctorId/offices')
  async getDoctorOffices(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
  ): Promise<SuccessResponse<unknown>> {
    const offices = await this.getOffices.execute(doctorId);
    return { success: true, data: offices };
  }

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
   * GET /api/booking/:doctorId/slots?date=YYYY-MM-DD
   *
   * Public endpoint — no auth required.
   * Returns the list of time slots for the doctor on the given date, each marked
   * as available or occupied by an active appointment.
   *
   * Anti-enumeration: 404 when the doctor does not exist or is inactive (same as
   * /info and /plans endpoints) — prevents oracle-style probing.
   *
   * Strict date validation: ?date must match YYYY-MM-DD and be a valid calendar date.
   * Invalid → 422 (ZodValidationPipe behaviour).
   *
   * Shape: { success: true, data: { date: string, slots: [{ time: 'HH:MM', available: boolean }] } }
   */
  @Get(':doctorId/slots')
  async getDoctorSlots(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @Query('date') rawDate: string,
  ): Promise<SuccessResponse<unknown>> {
    // Validate ?date strictly — YYYY-MM-DD and valid calendar date
    const parsed = DateQuerySchema.safeParse(rawDate);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'La fecha indicada no es válida',
        errors: parsed.error.issues.map((i) => ({ path: 'date', message: i.message })),
      });
    }

    const result = await this.getSlots.execute(doctorId, parsed.data);
    return { success: true, data: result };
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
