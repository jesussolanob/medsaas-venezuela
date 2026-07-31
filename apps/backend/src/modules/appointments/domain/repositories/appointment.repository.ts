import type { Transaction } from 'sequelize';
import type { AppointmentStatus } from '@delta/shared-types';
import type { Appointment } from '../entities/appointment.entity';

export const APPOINTMENT_REPOSITORY = Symbol('IAppointmentRepository');

export interface AppointmentListFilters {
  doctorId: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: AppointmentStatus;
  page: number;
  limit: number;
}

export interface AppointmentListResult {
  items: Appointment[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Overlap detection input.
 * Two appointments overlap when their intervals intersect:
 *   existing.scheduled_at < newEnd AND existing_end > newStart
 * where newEnd = scheduledAt + durationMinutes and existing_end = existing.scheduled_at + COALESCE(existing.duration_minutes, 30).
 */
export interface OverlapParams {
  doctorId: string;
  scheduledAt: Date;
  /** Duration of the new appointment in minutes. Used to compute [scheduledAt, scheduledAt + durationMinutes). */
  durationMinutes: number;
  /** When rescheduling, exclude this appointment ID from the conflict check so the appointment does not conflict with itself. */
  excludeId?: string;
}

/**
 * Patient overlap detection input.
 * Checks whether the patient already has an active appointment (with ANY doctor)
 * whose interval intersects with [scheduledAt, scheduledAt + durationMinutes).
 * Cross-doctor: does NOT filter by doctorId.
 */
export interface PatientOverlapParams {
  patientId: string;
  scheduledAt: Date;
  /** Duration of the new appointment in minutes. */
  durationMinutes: number;
  /** When rescheduling, exclude this appointment ID from the check so the patient does not conflict with themselves. */
  excludeId?: string;
}

export interface PackageInfo {
  id: string;
  doctorId: string;
  usedSessions: number;
  totalSessions: number;
  status: string;
}

export interface AuditLogEntry {
  appointmentId: string;
  actorId: string;
  oldStatus: AppointmentStatus | null;
  /** `'deleted'` is used by DeleteAppointmentUseCase to log hard-delete events. */
  newStatus: AppointmentStatus | 'deleted';
}

export interface IAppointmentRepository {
  /** Fetch a single appointment by ID. Returns null if not found. */
  findById(id: string): Promise<Appointment | null>;

  /** List appointments with pagination and optional filters. */
  list(filters: AppointmentListFilters): Promise<AppointmentListResult>;

  /**
   * Persist a new appointment and return the saved domain entity.
   * An optional Sequelize Transaction may be supplied for atomic booking flows.
   */
  save(appointment: Appointment, transaction?: Transaction): Promise<Appointment>;

  /** Update the status of an existing appointment. Returns the updated entity. */
  updateStatus(id: string, status: AppointmentStatus): Promise<Appointment>;

  /**
   * Returns true when the new appointment interval overlaps with any active appointment for the doctor.
   * Two intervals [A, A+Da) and [B, B+Db) overlap when A < B+Db AND B < A+Da.
   * Legacy rows with null duration_minutes are treated as 30 minutes via COALESCE.
   */
  hasOverlap(params: OverlapParams): Promise<boolean>;

  /**
   * Returns true when the patient already has an active appointment (with ANY doctor)
   * whose interval overlaps with [scheduledAt, scheduledAt + durationMinutes).
   * Cross-doctor check — does NOT filter by doctorId.
   * Legacy rows with null duration_minutes are treated as 30 minutes via COALESCE.
   */
  hasPatientOverlap(params: PatientOverlapParams): Promise<boolean>;

  /** Fetch package info for optimistic lock validation. */
  findPackageById(packageId: string): Promise<PackageInfo | null>;

  /**
   * Increment used_sessions with an optimistic lock.
   * Executes: UPDATE patient_packages SET used_sessions = used_sessions + 1
   *           WHERE id = :id AND used_sessions = :currentUsedSessions
   * Returns true when the update succeeded (rowsAffected === 1).
   */
  incrementPackageSessions(packageId: string, currentUsedSessions: number): Promise<boolean>;

  /** Append an entry to appointment_changes_log. */
  logStatusChange(entry: AuditLogEntry): Promise<void>;

  /**
   * Returns all active (scheduled/confirmed) appointments for a doctor
   * within a date range [from, to] inclusive.
   * Used by the slot-availability use case to determine occupied slots.
   */
  findActiveByDoctorAndDateRange(doctorId: string, from: Date, to: Date): Promise<Appointment[]>;

  /**
   * Updates the scheduledAt of an existing appointment.
   * Returns the updated entity.
   */
  updateScheduledAt(id: string, scheduledAt: Date): Promise<Appointment>;

  /**
   * Finds a single appointment by ID scoped to doctorId (anti-IDOR for detail views).
   * Returns null when the appointment does not exist or belongs to another doctor.
   */
  findByIdForDoctor(id: string, doctorId: string): Promise<Appointment | null>;

  /**
   * Persists the meet_link for an existing appointment (online booking flow).
   * Used after calendar event creation to store Google Meet or Jitsi URL.
   */
  updateMeetLink(id: string, meetLink: string): Promise<void>;

  /**
   * Persists the Google Calendar event ID for an existing appointment.
   * Used after a successful Google Meet event creation so the event can be
   * cancelled later when the appointment is cancelled.
   * Only called when eventId is a non-empty string.
   */
  updateGoogleEventId(id: string, eventId: string): Promise<void>;

  /**
   * Links a consultation to an appointment by persisting the consultation_id FK.
   * Called after a consultation is auto-created on appointment confirmation.
   * Returns the updated appointment entity.
   */
  updateConsultationId(id: string, consultationId: string): Promise<Appointment>;

  /**
   * Hard-deletes an appointment row by primary key.
   * The caller is responsible for deleting linked consultations first and
   * writing an audit log entry before calling this method.
   */
  deleteById(id: string): Promise<void>;

  /**
   * Finds the first completed appointment whose payment_id matches the given
   * paymentId. Used by DispatchPendingConsultationRemindersUseCase to determine
   * the anchor date (when session 1 was attended) for escalated reminders.
   * Returns null when no matching completed appointment exists.
   */
  findFirstCompletedByPaymentId(paymentId: string): Promise<Appointment | null>;

  /**
   * Finds upcoming active appointments for a doctor that have no Google Calendar
   * event yet (google_calendar_event_id IS NULL). Used by the calendar-sync backfill.
   *
   * Scoped to: doctor_id = doctorId, status IN ('scheduled','confirmed'),
   *            scheduled_at >= from, ordered ASC, limited to `limit` rows.
   * NEVER logs PII.
   */
  findUpcomingWithoutCalendarEvent(
    doctorId: string,
    from: Date,
    limit: number,
  ): Promise<Appointment[]>;
}
