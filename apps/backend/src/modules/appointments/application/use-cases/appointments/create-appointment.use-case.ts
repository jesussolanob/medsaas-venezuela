import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { CreateAppointmentDto, AppointmentStatus } from '@delta/shared-types';
import { Appointment } from '../../../domain/entities/appointment.entity';
import { AppointmentConflictError } from '../../../domain/errors/appointment-conflict.error';
import { AppointmentDuplicateError } from '../../../domain/errors/appointment-duplicate.error';
import { InsufficientSessionsError } from '../../../domain/errors/insufficient-sessions.error';
import { AppointmentOfficeInvalidError } from '../../../domain/errors/appointment-office-invalid.error';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../domain/repositories/appointment.repository';
import {
  OFFICE_REPOSITORY,
  type IOfficeRepository,
} from '../../../../offices/domain/repositories/office.repository';
import { CreateConsultationUseCase } from '../../../../consultations/application/use-cases/consultations/create-consultation.use-case';
import { computeActiveStatus } from '../../../domain/policies/appointment-status.policy';

/**
 * Computes the initial appointment status based on who is creating the appointment
 * and how far in the future (or past) the slot is.
 *
 * Rules:
 *  - Patient/public booking              → always `scheduled`
 *  - Doctor or admin, past date          → `completed` (already attended)
 *  - Doctor or admin, slot within 3 days → `confirmed`
 *  - Doctor or admin, slot 3+ days out   → `scheduled`
 */
function computeInitialStatus(actorRole: string | undefined, scheduledAt: Date): AppointmentStatus {
  if (actorRole !== 'doctor' && actorRole !== 'admin') {
    return 'scheduled';
  }
  // Past appointments created by doctor/admin are already attended.
  if (scheduledAt.getTime() < Date.now()) {
    return 'completed';
  }
  // Future appointments: auto-confirm when the slot is near (< 3 days).
  return computeActiveStatus(scheduledAt);
}

@Injectable()
export class CreateAppointmentUseCase {
  private readonly logger = new Logger(CreateAppointmentUseCase.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
    /**
     * CreateConsultationUseCase is optional to maintain backward compatibility
     * with test contexts that do not inject it.
     * When present, a consultation is auto-created upon appointment confirmation.
     *
     * @Inject(CreateConsultationUseCase) is mandatory here: TypeScript emits
     * `Object` as the reflect-metadata type for union types (`T | null`), so
     * NestJS cannot resolve the token without the explicit decorator.
     */
    @Optional()
    @Inject(CreateConsultationUseCase)
    private readonly createConsultationUC: CreateConsultationUseCase | null = null,
  ) {}

  /**
   * @param dto     Validated create-appointment payload.
   * @param actorRole  Role of the authenticated actor ('doctor' | 'admin' | 'patient' | undefined).
   *                   Used to decide the initial status (auto-confirm rule).
   */
  async execute(dto: CreateAppointmentDto, actorRole?: string): Promise<Appointment> {
    const scheduledAt = new Date(dto.scheduled_at);

    // 1. If an office is specified, validate ownership and modality compatibility.
    //    Also capture slotDuration so we can (a) check overlap correctly and (b) persist it.
    let slotDuration = 30;
    if (dto.office_id) {
      const office = await this.officeRepo.findById(dto.office_id);
      if (!office || !office.isOwnedBy(dto.doctor_id)) {
        throw new AppointmentOfficeInvalidError('not_owned');
      }
      if (!office.supportsModality(dto.appointment_mode)) {
        throw new AppointmentOfficeInvalidError('modality_mismatch');
      }
      // C1: use the block's own duration, not the office default.
      // Falls back to office.slotDuration when scheduledAt is outside any block.
      slotDuration = office.slotDurationAt(scheduledAt);
    }

    // 2. Guard: same patient already has an overlapping appointment (cross-doctor).
    if (dto.patient_id) {
      const patientOverlaps = await this.appointmentRepo.hasPatientOverlap({
        patientId: dto.patient_id,
        scheduledAt,
        durationMinutes: slotDuration,
      });
      if (patientOverlaps) {
        throw new AppointmentDuplicateError(dto.patient_id, scheduledAt);
      }
    }

    // 3. Guard: slot overlaps with any other active appointment for this doctor.
    const hasConflict = await this.appointmentRepo.hasOverlap({
      doctorId: dto.doctor_id,
      scheduledAt,
      durationMinutes: slotDuration,
    });
    if (hasConflict) {
      throw new AppointmentConflictError(scheduledAt);
    }

    // 4. If a package is involved, validate ownership, status and sessions.
    if (dto.package_id) {
      const pkg = await this.appointmentRepo.findPackageById(dto.package_id);

      if (
        !pkg ||
        pkg.doctorId !== dto.doctor_id ||
        pkg.status !== 'active' ||
        pkg.usedSessions >= pkg.totalSessions
      ) {
        throw new InsufficientSessionsError(dto.package_id);
      }

      // 5. Optimistic lock: increment used_sessions only if unchanged since we read it.
      const lockAcquired = await this.appointmentRepo.incrementPackageSessions(
        pkg.id,
        pkg.usedSessions,
      );
      if (!lockAcquired) {
        throw new InsufficientSessionsError(pkg.id);
      }
    }

    // 6. Determine initial status (auto-confirm rule for doctor-created near-term appointments).
    const initialStatus = computeInitialStatus(actorRole, scheduledAt);

    // 7. Build and persist the appointment domain entity.
    const now = new Date();
    const appointment = Appointment.create({
      id: randomUUID(),
      doctorId: dto.doctor_id,
      patientId: dto.patient_id ?? null,
      authUserId: dto.auth_user_id ?? null,
      consultationId: null,
      patientName: dto.patient_name,
      patientPhone: dto.patient_phone ?? null,
      patientEmail: dto.patient_email ?? null,
      patientCedula: dto.patient_cedula ?? null,
      scheduledAt,
      status: initialStatus,
      appointmentMode: dto.appointment_mode,
      source: null,
      planName: dto.plan_name,
      planPrice: dto.plan_price,
      paymentMethod: dto.payment_method ?? null,
      paymentReference: dto.payment_reference ?? null,
      paymentReceiptUrl: null,
      insuranceName: null,
      bcvRate: dto.bcv_rate ?? null,
      amountBs: null,
      packageId: dto.package_id ?? null,
      sessionNumber: null,
      chiefComplaint: dto.chief_complaint ?? null,
      appointmentCode: null,
      officeId: dto.office_id ?? null,
      durationMinutes: slotDuration,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.appointmentRepo.save(appointment);

    // 8. Auto-create consultation for any appointment with a known patient.
    //    Idempotency: skip if a consultation is already linked (saved.consultationId != null).
    if (saved.patientId && this.createConsultationUC && !saved.consultationId) {
      return this.maybeCreateConsultation(saved);
    }

    return saved;
  }

  /**
   * Creates a consultation linked to the appointment and updates the
   * appointment's consultation_id FK. Non-fatal: on failure the appointment is
   * still returned without a linked consultation (can be linked manually later).
   */
  private async maybeCreateConsultation(saved: Appointment): Promise<Appointment> {
    if (!this.createConsultationUC || !saved.patientId) {
      return saved;
    }
    try {
      const consultation = await this.createConsultationUC.execute({
        doctorId: saved.doctorId,
        patientId: saved.patientId,
        appointmentId: saved.id,
        consultationDate: saved.scheduledAt,
        chiefComplaint: saved.chiefComplaint ?? null,
        amount: saved.planPrice ?? null,
      });
      return await this.appointmentRepo.updateConsultationId(saved.id, consultation.id);
    } catch (err: unknown) {
      // Non-fatal: the appointment was confirmed successfully.
      // The consultation can be created via the status-update endpoint later.
      this.logger.warn(
        `[auto-consultation] Could not create consultation for appointment ` +
          `${saved.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return saved;
    }
  }
}
