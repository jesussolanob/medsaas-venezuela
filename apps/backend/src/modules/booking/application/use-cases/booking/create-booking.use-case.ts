import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { CreateBookingDto } from '@delta/shared-types';
import { Sequelize } from 'sequelize-typescript';
import { Appointment } from '../../../../appointments/domain/entities/appointment.entity';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../../appointments/domain/repositories/appointment.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../../patients/domain/repositories/patient.repository';
import { ConsumePackageSessionUseCase } from '../../../../packages/application/use-cases/packages/consume-package-session.use-case';
import { CryptoService } from '../../../../../infrastructure/crypto/crypto.service';
import { Patient } from '../../../../patients/domain/entities/patient.entity';
import { AppointmentConflictError } from '../../../../appointments/domain/errors/appointment-conflict.error';
import { DomainError } from '../../../../../domain/errors/domain.error';
import {
  BOOKING_DOCTOR_LOADER,
  type IBookingDoctorLoader,
} from '../../../domain/repositories/booking-doctor.repository';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../../../finances/domain/repositories/payment.repository';

export interface CreateBookingResult {
  appointment: Appointment;
  patient: Patient;
  appointmentCode: string;
}

/**
 * CreateBookingUseCase — public booking flow (no auth required).
 *
 * Steps:
 *   1. [Turnstile stub] Accept all tokens in Etapa 1.
 *      TODO(etapa-2): validate cf_turnstile_token against Cloudflare Turnstile API.
 *   2. Verify doctor exists and is active.
 *   3. Verify the slot is not already taken.
 *   4. Find-or-create the patient by email (then cedula fallback).
 *   5+6. Inside a Sequelize transaction: persist the appointment, then consume one
 *        package session if packageId was supplied. The transaction guarantees that
 *        a failed package consumption rolls back the appointment insert.
 *
 * DEFERRED (Etapa 1):
 *   - Real Turnstile validation (Cloudflare API call).
 *   - Slot availability check from doctor_schedule (table does not exist yet).
 */
@Injectable()
export class CreateBookingUseCase {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    @Inject(BOOKING_DOCTOR_LOADER)
    private readonly doctorLoader: IBookingDoctorLoader,
    private readonly consumePackageSession: ConsumePackageSessionUseCase,
    private readonly crypto: CryptoService,
    private readonly sequelize: Sequelize,
    /**
     * Payment repository — optional to preserve backward compatibility with
     * existing tests that do not inject it. When present, a payment record is
     * created atomically inside the booking transaction.
     *
     * TODO(cleanup): make this required once all test suites are updated.
     */
    @Optional()
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository | null = null,
  ) {}

  async execute(dto: CreateBookingDto): Promise<CreateBookingResult> {
    // --- Step 1: Turnstile validation (STUB — Etapa 1) ---
    // TODO(etapa-2): POST to https://challenges.cloudflare.com/turnstile/v0/siteverify
    //   with secret key and dto.cf_turnstile_token. Throw TurnstileInvalidError if !success.
    this.validateTurnstileStub(dto.cf_turnstile_token);

    // --- Step 2: Verify doctor exists and is active ---
    const doctor = await this.doctorLoader.findById(dto.doctor_id);
    if (!doctor || !doctor.isActive) {
      throw new DoctorNotFoundError();
    }

    // --- Step 3: Verify slot availability ---
    const scheduledAt = new Date(dto.scheduled_at);
    const hasConflict = await this.appointmentRepo.hasSlotConflict({
      doctorId: dto.doctor_id,
      scheduledAt,
    });
    if (hasConflict) {
      throw new AppointmentConflictError(scheduledAt);
    }

    // --- Step 4: Find-or-create patient by email ---
    const patient = await this.findOrCreatePatient(dto);

    // --- Steps 5+6: Persist appointment and consume package session atomically ---
    // Both writes are wrapped in a single Sequelize transaction so that a failure
    // during package consumption (exhausted, concurrent lock, DB error) rolls back
    // the appointment insert automatically — no orphaned appointments.
    const appointmentCode = this.generateAppointmentCode();
    const now = new Date();

    const appointment = Appointment.create({
      id: randomUUID(),
      doctorId: dto.doctor_id,
      patientId: patient.id,
      authUserId: null,
      consultationId: null,
      patientName: dto.patient_name,
      patientPhone: dto.patient_phone ?? null,
      patientEmail: dto.patient_email,
      patientCedula: dto.patient_cedula ?? null,
      scheduledAt,
      status: 'scheduled',
      appointmentMode: dto.appointment_mode,
      source: 'booking',
      planName: dto.plan_name,
      planPrice: dto.plan_price,
      paymentMethod: dto.package_id ? 'package' : (dto.payment_method ?? null),
      paymentReference: dto.payment_reference ?? null,
      paymentReceiptUrl: null,
      insuranceName: null,
      bcvRate: dto.bcv_rate ?? null,
      amountBs: null,
      packageId: dto.package_id ?? null,
      sessionNumber: null,
      chiefComplaint: dto.chief_complaint ?? null,
      appointmentCode,
      createdAt: now,
      updatedAt: now,
    });

    const savedAppointment = await this.sequelize.transaction(async (t) => {
      // Create payment record first so we have the paymentId for the appointment link.
      // If paymentRepo is not available (legacy / test context), skip silently.
      let paymentId: string | null = null;
      if (this.paymentRepo) {
        const paymentAmount = dto.package_id ? 0 : (dto.plan_price ?? 0);
        const newPayment = await this.paymentRepo.create({
          id: randomUUID(),
          doctorId: dto.doctor_id,
          patientId: patient.id,
          amountUsd: paymentAmount,
          amountBs: dto.bcv_rate && paymentAmount ? paymentAmount * dto.bcv_rate : null,
          bcvRate: dto.bcv_rate ?? null,
          currency: 'USD',
          methodSnapshot: dto.package_id ? 'package' : (dto.payment_method ?? null),
          paymentReference: dto.payment_reference ?? null,
          status: 'pending',
          packageId: dto.package_id ?? null,
          paymentCode: appointmentCode,
          transaction: t,
        });
        paymentId = newPayment.id;
      }

      // Build appointment with paymentId link (immutable Appointment — reconstruct with paymentId)
      const appointmentWithPayment = Appointment.create({
        ...appointment,
        paymentId,
      });

      const saved = await this.appointmentRepo.save(appointmentWithPayment, t);

      if (dto.package_id) {
        await this.consumePackageSession.execute({
          packageId: dto.package_id,
          doctorId: dto.doctor_id,
          transaction: t,
        });
      }

      return saved;
    });

    return { appointment: savedAppointment, patient, appointmentCode };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Turnstile stub — accepts all tokens in Etapa 1.
   *
   * SECURITY(etapa-2/BLOCKER): Este stub acepta todos los tokens.
   * Sin Turnstile real + rate limiting, este endpoint permite:
   *   - booking spam (saturar agenda del doctor)
   *   - creación masiva de registros de pacientes (cada email nuevo = nuevo Patient)
   * Activar ambas medidas antes de go-live — ver migracion/03-seguridad.md:
   *   - Turnstile real: POST https://challenges.cloudflare.com/turnstile/v0/siteverify
   *   - Rate limiting por IP: ThrottlerModule o Cloudflare WAF (≤10 req/min)
   *
   * TODO(etapa-2): replace with real Cloudflare Turnstile API validation.
   */
  private validateTurnstileStub(_token: string): void {
    // Intentionally a no-op in Etapa 1.
  }

  /**
   * Find patient by email hash. Falls back to cedula hash.
   * Creates a new patient record if neither matches.
   * PII encryption is handled by the patient repository layer.
   */
  private async findOrCreatePatient(dto: CreateBookingDto): Promise<Patient> {
    const emailHash = this.crypto.hashForSearch(dto.patient_email);
    const existing = await this.patientRepo.findByEmailHash(emailHash, dto.doctor_id);
    if (existing) return existing;

    if (dto.patient_cedula) {
      const cedulaHash = this.crypto.hashForSearch(dto.patient_cedula);
      const byCedula = await this.patientRepo.findByCedulaHash(cedulaHash, dto.doctor_id);
      if (byCedula) return byCedula;
    }

    const now = new Date();
    const newPatient = Patient.create({
      id: randomUUID(),
      doctorId: dto.doctor_id,
      fullName: dto.patient_name,
      email: dto.patient_email,
      cedula: dto.patient_cedula ?? null,
      phone: dto.patient_phone ?? null,
      source: 'booking',
      createdAt: now,
      updatedAt: now,
    });

    return this.patientRepo.save(newPatient);
  }

  private generateAppointmentCode(): string {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    // 6-digit random suffix + 4 hex chars from a UUID segment for sufficient entropy.
    const rand6 = Math.floor(100000 + Math.random() * 900000);
    const hex4 = randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
    return `BK-${ymd}-${rand6}-${hex4}`;
  }
}

// ---------------------------------------------------------------------------
// Domain errors specific to the booking context
// ---------------------------------------------------------------------------

export class DoctorNotFoundError extends DomainError {
  readonly code = 'DOCTOR_NOT_FOUND';
  override readonly httpStatus = 404;
  constructor() {
    // Generic message — no UUIDs exposed to the public surface.
    super('Doctor not found or not available for booking');
  }
}
