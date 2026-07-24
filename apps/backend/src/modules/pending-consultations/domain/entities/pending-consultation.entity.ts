import type { PendingConsultationStatus } from '@delta/shared-types';

/**
 * PendingConsultation domain entity.
 *
 * Represents a pre-paid consultation session that is waiting to be scheduled.
 * Created when a patient purchases a multi-session service but does not
 * schedule all sessions immediately.
 *
 * Invariants enforced here:
 *   - isSchedulable() combines status check and expiry check.
 *   - markScheduled() returns a new immutable copy with updated fields.
 *   - markCancelled() / markExpired() return new copies.
 *   - No imports from NestJS or Sequelize.
 */
export class PendingConsultation {
  constructor(
    public readonly id: string,
    public readonly doctorId: string,
    public readonly patientId: string,
    public readonly authUserId: string | null,
    public readonly packageId: string | null,
    public readonly paymentId: string | null,
    public readonly planName: string,
    public readonly officeId: string | null,
    public readonly appointmentMode: string | null,
    public readonly sessionNumber: number,
    public readonly status: PendingConsultationStatus,
    public readonly expiresAt: Date | null,
    public readonly scheduledAppointmentId: string | null,
    public readonly consultationId: string | null,
    public readonly reminderStage: number,
    public readonly lastReminderAt: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  /**
   * Returns true when this pending consultation can still be scheduled.
   * Conditions: status must be 'pending_scheduling' AND either no expiry is set
   * or the expiry date is in the future.
   */
  isSchedulable(): boolean {
    if (this.status !== 'pending_scheduling') return false;
    if (this.expiresAt === null) return true;
    return this.expiresAt > new Date();
  }

  /**
   * Returns a new PendingConsultation with status='scheduled' and the linked
   * appointment/consultation IDs set.
   * Does NOT mutate — returns an immutable copy.
   */
  markScheduled(appointmentId: string, consultationId: string | null): PendingConsultation {
    return new PendingConsultation(
      this.id,
      this.doctorId,
      this.patientId,
      this.authUserId,
      this.packageId,
      this.paymentId,
      this.planName,
      this.officeId,
      this.appointmentMode,
      this.sessionNumber,
      'scheduled',
      this.expiresAt,
      appointmentId,
      consultationId,
      this.reminderStage,
      this.lastReminderAt,
      this.createdAt,
      new Date(),
    );
  }

  /**
   * Returns a new PendingConsultation with status='cancelled'.
   */
  markCancelled(): PendingConsultation {
    return new PendingConsultation(
      this.id,
      this.doctorId,
      this.patientId,
      this.authUserId,
      this.packageId,
      this.paymentId,
      this.planName,
      this.officeId,
      this.appointmentMode,
      this.sessionNumber,
      'cancelled',
      this.expiresAt,
      this.scheduledAppointmentId,
      this.consultationId,
      this.reminderStage,
      this.lastReminderAt,
      this.createdAt,
      new Date(),
    );
  }

  /**
   * Returns a new PendingConsultation with status='expired'.
   */
  markExpired(): PendingConsultation {
    return new PendingConsultation(
      this.id,
      this.doctorId,
      this.patientId,
      this.authUserId,
      this.packageId,
      this.paymentId,
      this.planName,
      this.officeId,
      this.appointmentMode,
      this.sessionNumber,
      'expired',
      this.expiresAt,
      this.scheduledAppointmentId,
      this.consultationId,
      this.reminderStage,
      this.lastReminderAt,
      this.createdAt,
      new Date(),
    );
  }

  /** Factory — creates a PendingConsultation from raw params without persisting. */
  static create(params: PendingConsultationCreateParams): PendingConsultation {
    return new PendingConsultation(
      params.id,
      params.doctorId,
      params.patientId,
      params.authUserId ?? null,
      params.packageId ?? null,
      params.paymentId ?? null,
      params.planName,
      params.officeId ?? null,
      params.appointmentMode ?? null,
      params.sessionNumber,
      params.status,
      params.expiresAt ?? null,
      params.scheduledAppointmentId ?? null,
      params.consultationId ?? null,
      params.reminderStage ?? 0,
      params.lastReminderAt ?? null,
      params.createdAt,
      params.updatedAt,
    );
  }
}

export interface PendingConsultationCreateParams {
  id: string;
  doctorId: string;
  patientId: string;
  authUserId?: string | null;
  packageId?: string | null;
  paymentId?: string | null;
  planName: string;
  officeId?: string | null;
  appointmentMode?: string | null;
  sessionNumber: number;
  status: PendingConsultationStatus;
  expiresAt?: Date | null;
  scheduledAppointmentId?: string | null;
  consultationId?: string | null;
  reminderStage?: number;
  lastReminderAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
