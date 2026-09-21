import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type { PendingConsultation } from '../../domain/entities/pending-consultation.entity';
import {
  PENDING_CONSULTATION_REPOSITORY,
  type IPendingConsultationRepository,
} from '../../domain/repositories/pending-consultation.repository';
import { PendingConsultationNotFoundError } from '../../domain/errors/pending-consultation-not-found.error';
import { PendingConsultationNotSchedulableError } from '../../domain/errors/pending-consultation-not-schedulable.error';
import { PendingConsultationExpiredError } from '../../domain/errors/pending-consultation-expired.error';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../appointments/domain/repositories/appointment.repository';
import { AppointmentConflictError } from '../../../appointments/domain/errors/appointment-conflict.error';
import { Appointment } from '../../../appointments/domain/entities/appointment.entity';
import { CreateConsultationUseCase } from '../../../consultations/application/use-cases/consultations/create-consultation.use-case';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';

export interface SchedulePendingConsultationInput {
  id: string;
  /** Doctor's profile ID — required when called from the doctor endpoint. */
  doctorId?: string;
  scheduledAt: Date;
  officeId?: string | null;
  appointmentMode?: string | null;
  /** Sequelize transaction for atomicity when called within a booking flow. */
  transaction?: Transaction;
}

/**
 * SchedulePendingConsultationUseCase
 *
 * Transitions a pending consultation from 'pending_scheduling' to 'scheduled'
 * by creating a linked appointment (and optionally a consultation).
 *
 * Steps:
 *   1. Load and verify the pending consultation (ownership + schedulable check).
 *   1c. Resolve patient snapshot fields (best-effort — appointment is always created).
 *   2. Check appointment slot availability (overlap guard).
 *   3. Create the appointment with the patient snapshot.
 *   4. Commit the transaction. The consultation FK requires the appointment to
 *      exist before it can be inserted — see note in step 6.
 *   5. Update the pending consultation to 'scheduled' (consultationId still null).
 *   6. Create the consultation AFTER the commit; update the appointment and
 *      pending consultation with the new consultationId (best-effort).
 *
 * SECURITY:
 *   - When doctorId is supplied, findByIdAndDoctor enforces ownership (anti-IDOR).
 *   - Slot duration defaults to 30 min (same as legacy appointments).
 *   - Patient PII is NEVER logged.
 */
@Injectable()
export class SchedulePendingConsultationUseCase {
  private readonly logger = new Logger(SchedulePendingConsultationUseCase.name);

  constructor(
    @Inject(PENDING_CONSULTATION_REPOSITORY)
    private readonly pendingRepo: IPendingConsultationRepository,
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly sequelize: Sequelize,
    @Optional()
    @Inject(CreateConsultationUseCase)
    private readonly createConsultationUC: CreateConsultationUseCase | null = null,
    @Optional()
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository | null = null,
  ) {}

  async execute(input: SchedulePendingConsultationInput): Promise<PendingConsultation> {
    // 1a. Load pending consultation (scoped to doctor when doctorId provided)
    const entity = input.doctorId
      ? await this.pendingRepo.findByIdAndDoctor(input.id, input.doctorId)
      : await this.pendingRepo.findById(input.id);

    if (!entity) throw new PendingConsultationNotFoundError(input.id);

    // 1b. Check schedulable
    if (entity.status !== 'pending_scheduling') {
      throw new PendingConsultationNotSchedulableError(input.id);
    }

    // Distinguish expired from other non-schedulable states
    if (entity.expiresAt !== null && entity.expiresAt <= new Date()) {
      throw new PendingConsultationExpiredError(input.id);
    }

    // 1c. Resolve patient snapshot (best-effort).
    //     If the lookup fails or the patient is not found, the appointment is still
    //     created — the agenda will fall back to "Paciente" for missing names, which
    //     is the same behavior as before this fix. PII is never logged.
    let patientName: string | null = null;
    let patientPhone: string | null = null;
    let patientEmail: string | null = null;
    let patientCedula: string | null = null;

    if (this.patientRepo) {
      try {
        const patient = await this.patientRepo.findById(entity.patientId, entity.doctorId);
        if (patient) {
          patientName = patient.fullName;
          patientPhone = patient.phone ?? null;
          patientEmail = patient.email ?? null;
          patientCedula = patient.cedula ?? null;
        } else {
          this.logger.warn(
            `[schedule-pending] Patient not found for pending consultation ${input.id}; ` +
              `appointment will be created without name snapshot.`,
          );
        }
      } catch (err: unknown) {
        this.logger.warn(
          `[schedule-pending] Could not resolve patient snapshot for pending ` +
            `${input.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    /**
     * Appointment ID captured inside the transaction so we can link the
     * consultation after the commit (the FK requires the appointment to be visible
     * in Postgres before the consultation INSERT can succeed).
     */
    let appointmentToLink: string | null = null;

    const scheduledPending = await this.sequelize.transaction(async (tx: Transaction) => {
      // 2. Overlap check for the doctor's schedule
      const slotDuration = 30;
      const hasConflict = await this.appointmentRepo.hasOverlap({
        doctorId: entity.doctorId,
        scheduledAt: input.scheduledAt,
        durationMinutes: slotDuration,
      });
      if (hasConflict) {
        throw new AppointmentConflictError(input.scheduledAt);
      }

      // 3. Create appointment with patient snapshot
      const now = new Date();
      const appointment = Appointment.create({
        id: randomUUID(),
        doctorId: entity.doctorId,
        patientId: entity.patientId,
        authUserId: entity.authUserId,
        consultationId: null,
        patientName,
        patientPhone,
        patientEmail,
        patientCedula,
        scheduledAt: input.scheduledAt,
        status: 'scheduled',
        appointmentMode: (input.appointmentMode ?? entity.appointmentMode ?? 'presencial') as
          | 'presencial'
          | 'online',
        source: 'pending_consultation',
        planName: entity.planName,
        planPrice: null,
        paymentMethod: null,
        paymentReference: null,
        paymentReceiptUrl: null,
        insuranceName: null,
        bcvRate: null,
        amountBs: null,
        packageId: entity.packageId,
        sessionNumber: entity.sessionNumber,
        chiefComplaint: null,
        appointmentCode: null,
        paymentId: entity.paymentId,
        meetLink: null,
        officeId: input.officeId ?? entity.officeId,
        googleCalendarEventId: null,
        durationMinutes: slotDuration,
        createdAt: now,
        updatedAt: now,
      });

      const savedAppointment = await this.appointmentRepo.save(appointment, tx);

      /*
        4. The consultation is created AFTER the transaction commits.

        `CreateConsultationUseCase` inserts via a separate connection where the
        appointment row is not yet visible (the transaction has not committed).
        Postgres rejects the INSERT with:
          violates foreign key constraint "consultations_appointment_id_fkey"
        The error was previously swallowed inside the same transaction's catch,
        so the appointment was persisted without a consultation — the session
        never appeared in the Consultas module. Verified in staging 2026-09-11
        when scheduling session 3 of a package.

        We capture the ID here and run the creation after the commit, same
        pattern as create-booking.use-case.
      */
      appointmentToLink = savedAppointment.id;

      // 5. Update pending consultation to 'scheduled'.
      //    consultationId will be back-filled in step 6 once the FK is satisfiable.
      const scheduled = entity.markScheduled(savedAppointment.id, null);
      return this.pendingRepo.save(scheduled, tx);
    });

    // --- 6. Create the consultation now that the appointment row is committed ----
    // Best-effort: if this fails the appointment and the pending consultation are
    // already persisted correctly; only the consultation link is missing.
    if (appointmentToLink && this.createConsultationUC && entity.patientId) {
      try {
        const consultation = await this.createConsultationUC.execute({
          doctorId: entity.doctorId,
          patientId: entity.patientId,
          appointmentId: appointmentToLink,
          consultationDate: input.scheduledAt,
          chiefComplaint: null,
          amount: null,
        });
        await this.appointmentRepo.updateConsultationId(appointmentToLink, consultation.id);
        // Back-fill consultationId on the pending consultation record.
        const linked = scheduledPending.withConsultationId(consultation.id);
        await this.pendingRepo.save(linked);
        return linked;
      } catch (err: unknown) {
        this.logger.warn(
          `[schedule-pending] Could not auto-create consultation for pending ` +
            `${input.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return scheduledPending;
  }
}
