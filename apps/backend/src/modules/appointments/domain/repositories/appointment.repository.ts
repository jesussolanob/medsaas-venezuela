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

/** Conflict detection input for a slot. */
export interface SlotConflictParams {
  doctorId: string;
  scheduledAt: Date;
  excludeId?: string;
}

/** Duplicate detection: same patient within ±15 minutes. */
export interface DuplicateCheckParams {
  patientId: string;
  scheduledAt: Date;
  windowMinutes?: number;
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
  newStatus: AppointmentStatus;
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

  /** Returns true when the doctor slot is already occupied by an active appointment. */
  hasSlotConflict(params: SlotConflictParams): Promise<boolean>;

  /**
   * Returns true when the patient already has an appointment within the given
   * time window around scheduledAt. Defaults to ±15 minutes.
   */
  hasDuplicate(params: DuplicateCheckParams): Promise<boolean>;

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
   * Returns all appointments that share the same consultation_id as the given appointment.
   * Used to build the reschedule chain for cita-360 detail view.
   * Excludes the source appointment itself. Scoped to doctorId for anti-IDOR.
   */
  findRescheduleChain(consultationId: string, excludeId: string, doctorId: string): Promise<Appointment[]>;

  /**
   * Returns all audit log entries for the given appointment, ordered by created_at ASC.
   * Used by the cita-360 detail view to display the change history.
   */
  findChangeLogs(appointmentId: string): Promise<ChangeLogEntry[]>;

  /**
   * Finds a single appointment by ID scoped to doctorId (anti-IDOR for detail views).
   * Returns null when the appointment does not exist or belongs to another doctor.
   */
  findByIdForDoctor(id: string, doctorId: string): Promise<Appointment | null>;
}

/** Audit log entry returned by findChangeLogs. */
export interface ChangeLogEntry {
  id: string;
  appointmentId: string;
  actorId: string;
  oldStatus: string | null;
  newStatus: string;
  createdAt: Date;
}
