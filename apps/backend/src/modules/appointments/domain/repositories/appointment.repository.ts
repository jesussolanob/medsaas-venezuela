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

  /** Persist a new appointment and return the saved domain entity. */
  save(appointment: Appointment): Promise<Appointment>;

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
}
