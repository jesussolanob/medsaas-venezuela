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
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../../finances/domain/repositories/payment.repository';

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
    @Optional()
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository | null = null,
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

    /** Cita a la que hay que colgarle la consulta una vez commiteada la transacción. */
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

      /*
        4. La consulta se crea DESPUÉS del commit, no acá.

        `CreateConsultationUseCase` escribe por otra conexión, donde la cita recién
        insertada todavía no existe, así que Postgres rechazaba el INSERT con
        `violates foreign key constraint "consultations_appointment_id_fkey"`. El
        error caía en este mismo `catch`, que solo logueaba un warning: la cita
        quedaba agendada y SIN consulta, y la pantalla decía que todo salió bien.
        Verificado en staging el 2026-09-11 agendando la sesión 3 de un paquete.

        Se anota la cita y se continúa; el enlace se completa fuera de la
        transacción, igual que en el booking (ver create-booking.use-case).
      */
      appointmentToLink = savedAppointment.id;

      // 5. Update pending consultation to 'scheduled'
      //    `consultationId` se completa en el paso 6, tras el commit.
      const scheduled = entity.markScheduled(savedAppointment.id, null);
      return this.pendingRepo.save(scheduled, tx);
    });

    // --- 6. Consulta de la sesión, ya con la cita commiteada -------------------
    // Best-effort: si falla, la cita igual quedó agendada. Pero ahora la FK sí ve
    // la fila, así que el camino feliz funciona.
    if (appointmentToLink && this.createConsultationUC && entity.patientId) {
      try {
        // Estado del pago que cubre la sesión (2..N de un paquete): la consulta
        // nace con amount=0 y hereda ese estado, así no aparece en "Por cobrar".
        let initialPaymentStatus: 'pending' | 'approved' | undefined;
        let inheritedMethod: string | null | undefined;
        let inheritedReference: string | null | undefined;
        let coveredAmount: number | null = null;

        if (entity.paymentId && this.paymentRepo) {
          const parentPayment = await this.paymentRepo.findByIdForDoctor(
            entity.paymentId,
            entity.doctorId,
          );
          if (parentPayment) {
            initialPaymentStatus = parentPayment.status;
            inheritedMethod = parentPayment.methodSnapshot;
            inheritedReference = parentPayment.paymentReference;
            coveredAmount = 0; // el precio base ya se pagó en la primera sesión
          }
        }

        const consultation = await this.createConsultationUC.execute({
          doctorId: entity.doctorId,
          patientId: entity.patientId,
          appointmentId: appointmentToLink,
          consultationDate: input.scheduledAt,
          chiefComplaint: null,
          amount: coveredAmount,
          initialPaymentStatus,
          paymentMethod: inheritedMethod,
          paymentReference: inheritedReference,
        });
        await this.appointmentRepo.updateConsultationId(appointmentToLink, consultation.id);
        // La preconsulta también guarda el vínculo a la consulta.
        await this.pendingRepo.save(
          scheduledPending.withConsultationId(consultation.id),
          undefined,
        );
        return scheduledPending.withConsultationId(consultation.id);
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
