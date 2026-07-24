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
 *   2. Check appointment slot availability (overlap guard).
 *   3. Create the appointment (status: 'scheduled').
 *   4. Auto-create a consultation (best-effort, same as CreateAppointmentUseCase).
 *   5. Update the pending consultation to 'scheduled' with the appointment/consultation IDs.
 *
 * The entire operation runs inside a Sequelize transaction.
 *
 * SECURITY:
 *   - When doctorId is supplied, findByIdAndDoctor enforces ownership (anti-IDOR).
 *   - Slot duration defaults to 30 min (same as legacy appointments).
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

    return this.sequelize.transaction(async (tx: Transaction) => {
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

      // 3. Create appointment
      const now = new Date();
      const appointment = Appointment.create({
        id: randomUUID(),
        doctorId: entity.doctorId,
        patientId: entity.patientId,
        authUserId: entity.authUserId,
        consultationId: null,
        patientName: null,
        patientPhone: null,
        patientEmail: null,
        patientCedula: null,
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

      // 4. Auto-create consultation (best-effort)
      let consultationId: string | null = null;
      if (this.createConsultationUC && entity.patientId) {
        try {
          const consultation = await this.createConsultationUC.execute({
            doctorId: entity.doctorId,
            patientId: entity.patientId,
            appointmentId: savedAppointment.id,
            consultationDate: input.scheduledAt,
            chiefComplaint: null,
            amount: null,
          });
          consultationId = consultation.id;
          await this.appointmentRepo.updateConsultationId(savedAppointment.id, consultation.id);
        } catch (err: unknown) {
          this.logger.warn(
            `[schedule-pending] Could not auto-create consultation for pending ` +
              `${input.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // 5. Update pending consultation to 'scheduled'
      const scheduled = entity.markScheduled(savedAppointment.id, consultationId);
      return this.pendingRepo.save(scheduled, tx);
    });
  }
}
