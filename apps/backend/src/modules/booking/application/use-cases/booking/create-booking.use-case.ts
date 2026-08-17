import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
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
  BOOKING_FEATURE_CHECKER,
  type IBookingFeatureChecker,
} from '../../../domain/repositories/booking-feature-checker.repository';
import { BookingNotEnabledError } from '../../../domain/errors/booking-not-enabled.error';
import { ChiefComplaintRequiredError } from '../../../domain/errors/chief-complaint-required.error';
import { BookingTooSoonError } from '../../../domain/errors/booking-too-soon.error';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../../../finances/domain/repositories/payment.repository';
import { ResolvePatientIdentityUseCase } from '../../../../patient-identities/application/use-cases/resolve-patient-identity.use-case';
import {
  OFFICE_REPOSITORY,
  type IOfficeRepository,
} from '../../../../offices/domain/repositories/office.repository';
import { OfficeModalityMismatchError } from '../../../../integrations/domain/errors/office-modality-mismatch.error';
import {
  AppointmentNotificationService,
  APPOINTMENT_NOTIFICATION_SERVICE,
} from '../../../../integrations/application/services/appointment-notification.service';
import {
  DOCTOR_SCHEDULE_REPOSITORY,
  type IDoctorScheduleRepository,
} from '../../../../doctor-settings/domain/repositories/doctor-schedule.repository';
import { CreateConsultationUseCase } from '../../../../consultations/application/use-cases/consultations/create-consultation.use-case';
import {
  PRICING_PLAN_REPOSITORY,
  type IPricingPlanRepository,
} from '../../../../packages/domain/repositories/pricing-plan.repository';
import { CreatePendingConsultationsUseCase } from '../../../../pending-consultations/application/use-cases/create-pending-consultations.use-case';
import { CARACAS_OFFSET } from '../../../../../domain/caracas-time';

export interface CreateBookingResult {
  appointment: Appointment;
  patient: Patient;
  appointmentCode: string;
  /** Meet link for online appointments (Google Meet or Jitsi). Null for in-person. */
  meetLink: string | null;
  /**
   * Consulta creada junto con la cita, si se pudo crear.
   *
   * NO se puede leer de `appointment.consultationId`: el FK se actualiza en la
   * BD después de construir la entidad, así que la que se devuelve todavía lo
   * tiene en null. Quien necesite abrir la consulta recién creada (el botón de
   * consulta inmediata) tiene que leerlo de acá.
   */
  consultationId: string | null;
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
  private readonly logger = new Logger(CreateBookingUseCase.name);

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
    /**
     * Identity resolver — optional for backward compatibility with existing
     * tests that do not inject it. When absent, identity_id is left null.
     *
     * TODO(cleanup): make required once all test suites are updated.
     */
    @Optional()
    private readonly resolveIdentity: ResolvePatientIdentityUseCase | null = null,
    /**
     * Office repository — optional for backward compatibility.
     * When present, validates modality compatibility before booking.
     */
    @Optional()
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository | null = null,
    /**
     * Notification service — optional for backward compatibility.
     * When present, sends calendar invites / .ics + email after booking.
     * Uses explicit string token so NestJS resolves it correctly cross-module
     * (TypeScript emits Object as design:paramtype for union types).
     */
    @Optional()
    @Inject(APPOINTMENT_NOTIFICATION_SERVICE)
    private readonly notificationService: AppointmentNotificationService | null = null,
    /**
     * Feature checker — optional for backward compatibility with existing tests.
     * When present, blocks booking if the doctor's effective plan does not include
     * the `booking` feature (BookingNotEnabledError → HTTP 403).
     *
     * TODO(cleanup): make required once all test suites are updated.
     */
    @Optional()
    @Inject(BOOKING_FEATURE_CHECKER)
    private readonly featureChecker: IBookingFeatureChecker | null = null,
    /**
     * Doctor schedule repository — optional for backward compatibility with
     * existing tests that do not inject it. When present, validates patient
     * booking rules: require_reason and min_lead_days.
     *
     * Rules are skipped when `skipPatientBookingRules=true` (doctor-initiated
     * internal flow from DoctorBookingController).
     *
     * TODO(cleanup): make required once all test suites are updated.
     */
    @Optional()
    @Inject(DOCTOR_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IDoctorScheduleRepository | null = null,
    /**
     * CreateConsultationUseCase — optional for backward compatibility with
     * existing tests that do not inject it. When present, a consultation is
     * auto-created (best-effort, non-fatal) after the booking appointment is
     * saved. A failure here must NEVER roll back the booking itself.
     *
     * @Inject is mandatory: TypeScript emits `Object` for union types
     * (`T | null`) in reflect-metadata, so NestJS cannot resolve the token.
     */
    @Optional()
    @Inject(CreateConsultationUseCase)
    private readonly createConsultationUC: CreateConsultationUseCase | null = null,
    /**
     * PricingPlanRepository — optional for backward compatibility with existing tests.
     * When present and dto.plan_id is provided, the plan is loaded and, if
     * sessionsCount > 1, additional appointments + pending_consultations are created
     * inside the booking transaction.
     *
     * When absent (e.g. legacy tests), the multi-session path is silently skipped
     * and the booking behaves exactly as before A1b.
     */
    @Optional()
    @Inject(PRICING_PLAN_REPOSITORY)
    private readonly pricingPlanRepo: IPricingPlanRepository | null = null,
    /**
     * CreatePendingConsultationsUseCase — optional for backward compatibility.
     * Creates pending_consultation rows for deferred sessions inside the booking
     * transaction. Requires pricingPlanRepo to be present to take effect.
     *
     * @Inject is mandatory: TypeScript emits Object for union types with null.
     */
    @Optional()
    @Inject(CreatePendingConsultationsUseCase)
    private readonly createPendingUC: CreatePendingConsultationsUseCase | null = null,
  ) {}

  async execute(
    dto: CreateBookingDto,
    options?: {
      skipBookingFeatureGate?: boolean;
      skipPatientBookingRules?: boolean;
      /**
       * When true, the doctor's own appointment overlap check (step 3) is bypassed.
       * Used by CreateImmediateAppointmentUseCase with force=true so a walk-in can be
       * created even if it overlaps with an existing appointment in the doctor's calendar.
       *
       * ⚠️ The PATIENT overlap check (step 4b) is NEVER bypassed — not even with force.
       */
      skipDoctorOverlapCheck?: boolean;
    },
  ): Promise<CreateBookingResult> {
    // --- Step 1: Turnstile validation (STUB — Etapa 1) ---
    // TODO(etapa-2): POST to https://challenges.cloudflare.com/turnstile/v0/siteverify
    //   with secret key and dto.cf_turnstile_token. Throw TurnstileInvalidError if !success.
    this.validateTurnstileStub(dto.cf_turnstile_token);

    // --- Step 2: Verify doctor exists and is active ---
    const doctor = await this.doctorLoader.findById(dto.doctor_id);
    if (!doctor || !doctor.isActive) {
      throw new DoctorNotFoundError();
    }

    // --- Step 2a: Verify booking feature is enabled for this doctor's plan ---
    // Defence in depth: the frontend hides the booking link/QR when bookingEnabled=false,
    // but a direct POST must still be rejected if the plan does not include booking.
    //
    // Exception: when skipBookingFeatureGate=true (authenticated doctor-initiated flow),
    // the gate is bypassed — agendar is a core action available on every plan.
    if (this.featureChecker && !options?.skipBookingFeatureGate) {
      const bookingEnabled = await this.featureChecker.isBookingEnabled(dto.doctor_id);
      if (!bookingEnabled) {
        throw new BookingNotEnabledError();
      }
    }

    // scheduledAt is parsed once here and shared across all downstream steps
    // (office block resolution, lead-time validation, overlap detection).
    const scheduledAt = new Date(dto.scheduled_at);

    // --- Step 2b: Validate office modality (if office_id provided) ---
    let officeAddress: string | undefined;
    let officeName: string | undefined;
    let officeMapUrl: string | undefined;
    let officeDuration = 30;

    if (dto.office_id && this.officeRepo) {
      const office = await this.officeRepo.findById(dto.office_id);
      if (office) {
        if (!office.supportsModality(dto.appointment_mode)) {
          throw new OfficeModalityMismatchError(dto.appointment_mode, office.modality);
        }
        officeAddress = office.address || undefined;
        officeName = office.name;
        officeMapUrl = office.mapUrl ?? undefined;
        // C1: resolve the duration of the block that contains scheduledAt,
        // not the office-wide default (which ignores per-block overrides).
        officeDuration = office.slotDurationAt(scheduledAt);
      }
    }

    // C2: explicit duration from the doctor's "otra hora" flow.
    // Only honoured on the authenticated doctor path (skipPatientBookingRules=true).
    // A patient cannot choose their own appointment duration via the public form.
    if (options?.skipPatientBookingRules && dto.duration_minutes) {
      officeDuration = dto.duration_minutes;
    }

    // --- Step 2c: Validate patient booking rules (require_reason + lead_time) ---
    // These restrictions apply to public bookings only. When the doctor schedules
    // an appointment internally (DoctorBookingController) the flag
    // `skipPatientBookingRules=true` bypasses this block entirely.
    if (!options?.skipPatientBookingRules && this.scheduleRepo) {
      const schedule = await this.scheduleRepo.findByDoctorId(dto.doctor_id);

      // Validate chief complaint requirement
      if (schedule?.bookingRequireReason === true && !dto.chief_complaint?.trim()) {
        throw new ChiefComplaintRequiredError();
      }

      // Validate minimum lead time
      const minLeadDays = schedule?.bookingMinLeadDays ?? 0;
      if (minLeadDays > 0) {
        const nowCaracasDateStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Caracas',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
        const todayCaracas = new Date(`${nowCaracasDateStr}T00:00:00.000${CARACAS_OFFSET}`);
        const minBookableDate = new Date(todayCaracas);
        minBookableDate.setDate(minBookableDate.getDate() + minLeadDays);

        // Compare at day granularity in Caracas local time
        const scheduledCaracasDateStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Caracas',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(scheduledAt);
        const scheduledDateCaracas = new Date(
          `${scheduledCaracasDateStr}T00:00:00.000${CARACAS_OFFSET}`,
        );

        if (scheduledDateCaracas < minBookableDate) {
          throw new BookingTooSoonError(minLeadDays);
        }
      }
    }

    // --- Step 3: Verify slot availability (overlap detection) ---
    // Skipped when skipDoctorOverlapCheck=true (immediate-consultation force mode).
    // The patient overlap check below is NEVER skipped.
    if (!options?.skipDoctorOverlapCheck) {
      const hasConflict = await this.appointmentRepo.hasOverlap({
        doctorId: dto.doctor_id,
        scheduledAt,
        durationMinutes: officeDuration,
      });
      if (hasConflict) {
        throw new AppointmentConflictError(scheduledAt);
      }
    }

    // --- Step 4: Resolve patient ---
    // Path A: patient_id provided → load directly (doctor-scoped anti-IDOR).
    // Path B: no patient_id → find-or-create by available identifiers.
    const patient = dto.patient_id
      ? await this.loadPatientById(dto.patient_id, dto.doctor_id)
      : await this.findOrCreatePatient(dto);

    // --- Step 4b: Verify the patient does not have an overlapping appointment (cross-doctor) ---
    // A newly created patient has no prior appointments, so this returns false naturally.
    const patientOverlaps = await this.appointmentRepo.hasPatientOverlap({
      patientId: patient.id,
      scheduledAt,
      durationMinutes: officeDuration,
    });
    if (patientOverlaps) {
      throw new AppointmentConflictError(scheduledAt);
    }

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
      paymentReceiptUrl: dto.receipt_url ?? null,
      insuranceName: null,
      bcvRate: dto.bcv_rate ?? null,
      amountBs: null,
      packageId: dto.package_id ?? null,
      sessionNumber: null,
      chiefComplaint: dto.chief_complaint ?? null,
      appointmentCode,
      durationMinutes: officeDuration,
      // Link the appointment to the selected office. Previously dropped here, so
      // office_id was always null even when the caller supplied office_id.
      officeId: dto.office_id ?? null,
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

      // --- Multi-session path (A1b) ---
      // Only runs when plan_id is provided AND the plan has sessions_count > 1.
      // RULE: sessions_count <= 1 → identical behaviour to today (no-op block).
      // RULE: pricingPlanRepo or createPendingUC absent → silently skip (backward compat).
      if (dto.plan_id && this.pricingPlanRepo && this.createPendingUC) {
        const plan = await this.pricingPlanRepo.findById(dto.plan_id);

        // Ownership guard: skip if plan not found, belongs to a different doctor,
        // or has only one session. Degrada con gracia — la reserva igual se crea
        // como una cita normal de una sesión.
        //
        // OJO: este skip era MUDO, y eso costó caro. En agosto de 2026 una
        // especialista reportó que su módulo "Consultas por agendar" salía vacío:
        // dos pacientes habían reservado paquetes de 3 sesiones y no se generó
        // ninguna preconsulta. Como el skip no dejaba rastro, esa reserva era
        // indistinguible de una normal y el problema pasó 12 días sin detectarse.
        // Reproducido el flujo completo, hoy funciona; sin log no hay forma de
        // saber cuál de las tres guardas falló aquella vez.
        //
        // El WARN no cambia el comportamiento: solo deja algo que se pueda buscar
        // en los logs cuando vuelva a pasar. No se loguea PII.
        if (!plan || plan.doctorId !== dto.doctor_id || plan.sessionsCount <= 1) {
          this.logger.warn(
            `[multi-sesion] no se generaron preconsultas para plan_id=${dto.plan_id}: ` +
              `${!plan ? 'el plan no existe' : plan.doctorId !== dto.doctor_id ? 'el plan es de otro doctor' : `sessions_count=${plan.sessionsCount}`}`,
          );
        }

        if (plan && plan.doctorId === dto.doctor_id && plan.sessionsCount > 1) {
          const additionalRequested = dto.additional_sessions ?? [];
          // Determine how many sessions can be immediately scheduled (beyond the first).
          const maxAdditional = plan.sessionsCount - 1;
          const toScheduleNow = additionalRequested.slice(0, maxAdditional);
          const deferredCount = maxAdditional - toScheduleNow.length;

          // Session numbers: first session = 1 (already created above),
          // immediately-scheduled extra sessions = 2...(1+toScheduleNow.length),
          // deferred sessions = (2+toScheduleNow.length)...sessionsCount.
          let nextSessionNumber = 2;

          // Create immediately-scheduled additional appointments.
          for (const extra of toScheduleNow) {
            const extraAt = new Date(extra.scheduled_at);

            // Corrección 1: chequeo de solape antes de persistir cada cita adicional.
            // Si el slot está ocupado la transacción entera aborta (igual que la 1ª cita).
            const extraConflict = await this.appointmentRepo.hasOverlap({
              doctorId: dto.doctor_id,
              scheduledAt: extraAt,
              durationMinutes: officeDuration,
            });
            if (extraConflict) {
              throw new AppointmentConflictError(extraAt);
            }

            const extraAppt = Appointment.create({
              id: randomUUID(),
              doctorId: dto.doctor_id,
              patientId: patient.id,
              authUserId: null,
              consultationId: null,
              patientName: dto.patient_name,
              patientPhone: dto.patient_phone ?? null,
              patientEmail: dto.patient_email ?? null,
              patientCedula: dto.patient_cedula ?? null,
              scheduledAt: extraAt,
              status: 'scheduled',
              appointmentMode: extra.appointment_mode ?? dto.appointment_mode,
              source: 'booking',
              planName: dto.plan_name,
              planPrice: 0, // Price is paid upfront on the first session; extras cost 0.
              paymentMethod: null,
              paymentReference: null,
              paymentReceiptUrl: null,
              insuranceName: null,
              bcvRate: null,
              amountBs: null,
              packageId: null,
              sessionNumber: nextSessionNumber,
              chiefComplaint: null,
              appointmentCode: null,
              durationMinutes: officeDuration,
              officeId: extra.office_id ?? dto.office_id ?? null,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            const savedExtra = await this.appointmentRepo.save(extraAppt, t);
            nextSessionNumber++;

            // Corrección 2: ADR-021 — toda cita con paciente auto-crea su consulta.
            // Best-effort dentro de la transacción: un fallo no aborta el booking.
            if (this.createConsultationUC) {
              try {
                const extraConsultation = await this.createConsultationUC.execute({
                  doctorId: dto.doctor_id,
                  patientId: patient.id,
                  appointmentId: savedExtra.id,
                  consultationDate: extraAt,
                  chiefComplaint: null,
                  amount: 0, // Price already collected on the first session.
                });
                await this.appointmentRepo.updateConsultationId(
                  savedExtra.id,
                  extraConsultation.id,
                );
              } catch (err: unknown) {
                const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
                this.logger.warn(
                  `[booking] auto-create consultation for extra session failed (non-fatal): ${detail}`,
                );
              }
            }
          }

          // Create pending_consultation rows for deferred sessions.
          if (deferredCount > 0) {
            const deferredSessionNumbers = Array.from(
              { length: deferredCount },
              (_, i) => nextSessionNumber + i,
            );
            const expiresAt = plan.validityDays
              ? new Date(Date.now() + plan.validityDays * 24 * 60 * 60 * 1000)
              : null;

            await this.createPendingUC.execute({
              doctorId: dto.doctor_id,
              patientId: patient.id,
              paymentId,
              planName: dto.plan_name,
              officeId: dto.office_id ?? null,
              appointmentMode: dto.appointment_mode,
              sessionNumbers: deferredSessionNumbers,
              expiresAt,
              transaction: t,
            });
          }
        }
      }

      return saved;
    });

    // --- Step 7: Send notifications (best-effort — must not break booking) ---
    let meetLink: string | null = null;
    if (this.notificationService) {
      try {
        // Resolve the patient email: prefer the email on the resolved patient record;
        // fall back to the email supplied in the DTO (public booking flow).
        // If neither is present, omit the field — no attendee invite is sent.
        const resolvedPatientEmail = patient.email ?? dto.patient_email ?? undefined;

        const notifResult = await this.notificationService.notify({
          appointmentId: savedAppointment.id,
          doctorId: dto.doctor_id,
          doctorName: doctor.fullName ?? 'Doctor',
          doctorEmail: undefined,
          patientEmail: resolvedPatientEmail,
          patientName: dto.patient_name,
          scheduledAtISO: savedAppointment.scheduledAt.toISOString(),
          durationMinutes: officeDuration,
          appointmentMode: dto.appointment_mode,
          officeAddress,
          officeName,
          officeMapUrl,
        });
        meetLink = notifResult.meetLink;

        // Persist the meet link back to the appointment
        if (meetLink) {
          await this.appointmentRepo.updateMeetLink(savedAppointment.id, meetLink);
        }

        // Persist the Google Calendar event ID (best-effort — only when non-empty)
        if (notifResult.googleCalendarEventId) {
          await this.appointmentRepo.updateGoogleEventId(
            savedAppointment.id,
            notifResult.googleCalendarEventId,
          );
        }
      } catch {
        // Non-fatal — appointment is already saved
        this.logger.warn('[booking] notification failed (non-fatal)');
      }
    }

    // --- Step 8: Auto-create consultation (best-effort — must NOT break booking) ---
    // A failure here only means the consultation will be absent from the list;
    // the booking appointment itself is fully persisted and confirmed.
    let createdConsultationId: string | null = savedAppointment.consultationId ?? null;
    if (this.createConsultationUC && !savedAppointment.consultationId) {
      try {
        const consultation = await this.createConsultationUC.execute({
          doctorId: dto.doctor_id,
          patientId: patient.id,
          appointmentId: savedAppointment.id,
          consultationDate: savedAppointment.scheduledAt,
          chiefComplaint: dto.chief_complaint ?? null,
          amount: dto.plan_price ?? null,
        });
        await this.appointmentRepo.updateConsultationId(savedAppointment.id, consultation.id);
        createdConsultationId = consultation.id;
      } catch (err: unknown) {
        // Non-fatal. Log el MENSAJE del error (código/DB — NO contiene PII) para
        // poder diagnosticar por qué no se creó la consulta.
        const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        this.logger.warn(`[booking] auto-create consultation failed (non-fatal): ${detail}`);
      }
    }

    return {
      appointment: savedAppointment,
      patient,
      appointmentCode,
      meetLink,
      consultationId: createdConsultationId,
    };
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
   * Activar ambas medidas antes de go-live:
   *   - Turnstile real: POST https://challenges.cloudflare.com/turnstile/v0/siteverify
   *   - Rate limiting por IP: ThrottlerModule o Cloudflare WAF (≤10 req/min)
   *
   * TODO(etapa-2): replace with real Cloudflare Turnstile API validation.
   */
  private validateTurnstileStub(_token: string): void {
    // Intentionally a no-op in Etapa 1.
  }

  /**
   * Load an existing patient by ID scoped to the authenticated doctor.
   *
   * Anti-IDOR: if the patient does not exist or belongs to a different doctor,
   * a PatientNotFoundError is thrown — identical error in both cases so callers
   * cannot enumerate patients across doctors.
   */
  private async loadPatientById(patientId: string, doctorId: string): Promise<Patient> {
    const patient = await this.patientRepo.findById(patientId, doctorId);
    if (!patient) {
      throw new PatientNotFoundError(patientId);
    }
    return patient;
  }

  /**
   * Find-or-create patient using available identifiers.
   *
   * Match priority (scoped to doctorId):
   *   1. Cedula hash — when patient_cedula is present.
   *      The cédula is the stable, government-issued identifier for Venezuelan patients,
   *      so it takes priority over email as the primary deduplication key. A returning
   *      patient may change their email address over time; their cédula never changes.
   *      When a match is found the existing record is returned AS-IS — we never overwrite
   *      the stored name/email/phone with the form values from the new booking.
   *   2. Email hash — fallback when no cedula was supplied or the cedula did not match.
   *   3. Create new patient — when neither matches (or neither was supplied).
   *
   * Deliberately does NOT match on name alone to prevent false duplicates.
   * PII encryption is handled by the patient repository layer.
   */
  private async findOrCreatePatient(dto: CreateBookingDto): Promise<Patient> {
    // 1. Try cedula hash lookup first — cédula is the stable identifier for Venezuelan
    //    patients and must be the primary deduplication key. Email may change; cedula does not.
    if (dto.patient_cedula) {
      const cedulaHash = this.crypto.hashForSearch(dto.patient_cedula);
      const byCedula = await this.patientRepo.findByCedulaHash(cedulaHash, dto.doctor_id);
      if (byCedula) return byCedula;
    }

    // 2. Try email hash lookup as fallback when no cedula match was found
    if (dto.patient_email) {
      const emailHash = this.crypto.hashForSearch(dto.patient_email);
      const byEmail = await this.patientRepo.findByEmailHash(emailHash, dto.doctor_id);
      if (byEmail) return byEmail;
    }

    // 3. Create new patient
    const identityId = this.resolveIdentity
      ? await this.resolveIdentity.execute(dto.patient_cedula ?? null)
      : null;

    const now = new Date();
    const newPatient = Patient.create({
      id: randomUUID(),
      doctorId: dto.doctor_id,
      fullName: dto.patient_name,
      email: dto.patient_email ?? null,
      cedula: dto.patient_cedula ?? null,
      phone: dto.patient_phone ?? null,
      identityId,
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

/**
 * Thrown when the requested patient_id does not exist or belongs to a different
 * doctor than the one performing the booking.
 *
 * Anti-IDOR: identical error for "not found" and "belongs to another doctor" so
 * callers cannot enumerate patients across doctor accounts.
 */
export class PatientNotFoundError extends DomainError {
  readonly code = 'PATIENT_NOT_FOUND';
  override readonly httpStatus = 404;
  constructor(_id: string) {
    // Generic message — no patient UUID exposed to the API surface.
    super('Patient not found');
  }
}
