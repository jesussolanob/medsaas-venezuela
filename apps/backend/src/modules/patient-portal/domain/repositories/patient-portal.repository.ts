import type { AppointmentSummary, PackageSummary } from '../entities/patient-dashboard.entity';
import type { Patient } from '../../../patients/domain/entities/patient.entity';
import type { Appointment } from '../../../appointments/domain/entities/appointment.entity';
import type { Prescription } from '../../../prescriptions/domain/entities/prescription.entity';

export const PATIENT_PORTAL_REPOSITORY = Symbol('IPatientPortalRepository');

export interface PatientAppointmentsResult {
  items: Appointment[];
  total: number;
  page: number;
  limit: number;
}

export interface PatientMessageRow {
  id: string;
  patientId: string;
  doctorId: string;
  body: string;
  direction: 'patient_to_doctor' | 'doctor_to_patient';
  readAt: Date | null;
  createdAt: Date;
}

/**
 * Portal-specific repository interface — lives in domain/ per DDD.
 *
 * All methods enforce the auth_user_id scope — callers must pass authUserId
 * derived from the authenticated user's token (user.sub), never from the
 * request body or path parameters.
 *
 * NOTE: auth_user_id is nullable in the DB schema by design — patients created
 * by the doctor without a portal account have auth_user_id = NULL. Those rows
 * are simply invisible in the portal (they fail the WHERE auth_user_id = user.sub
 * filter), which is the correct and safe behavior. This is not a security gap:
 * only patients who have authenticated and linked their account can access the
 * portal, and they only ever see their own rows.
 */
export interface IPatientPortalRepository {
  /** Returns all patient_id UUIDs associated with this auth_user_id. */
  findPatientIdsByAuthUserId(authUserId: string): Promise<string[]>;

  /** Returns all patient rows for this auth_user_id (one per doctor). */
  findPatientsByAuthUserId(authUserId: string): Promise<Patient[]>;

  /** Returns a single patient row scoped to authUserId (anti-IDOR). */
  findPatientByIdAndAuthUserId(id: string, authUserId: string): Promise<Patient | null>;

  /** Updates non-PHI patient fields, scoped to authUserId. */
  updatePatient(
    id: string,
    authUserId: string,
    fields: { address?: string | null; city?: string | null; notes?: string | null },
  ): Promise<Patient | null>;

  /** Returns the next upcoming appointment for this auth_user_id. */
  findNextAppointment(authUserId: string): Promise<AppointmentSummary | null>;

  /** Counts total appointments for this auth_user_id. */
  countAppointments(authUserId: string): Promise<number>;

  /** Lists appointments for this auth_user_id, paginated, newest first. */
  listAppointments(
    authUserId: string,
    page: number,
    limit: number,
  ): Promise<PatientAppointmentsResult>;

  /** Returns active packages with doctor info for this auth_user_id. */
  findActivePackages(authUserId: string): Promise<PackageSummary[]>;

  /** Lists all packages (active + completed) for this auth_user_id with doctor info. */
  listPackages(authUserId: string): Promise<PackageSummary[]>;

  /** Lists prescriptions for the given patient IDs with PHI decrypted. */
  listPrescriptions(patientIds: string[]): Promise<Prescription[]>;

  /** Lists messages for the given patient IDs, chronological, optionally filtered by doctorId. */
  listMessages(patientIds: string[], doctorId?: string): Promise<PatientMessageRow[]>;

  /** Inserts a patient_to_doctor message. */
  insertMessage(patientId: string, doctorId: string, body: string): Promise<PatientMessageRow>;

  /**
   * Returns a patient_id belonging to both authUserId and doctorId.
   * Returns null when no relationship exists.
   * Used to validate send-message authorization.
   */
  findPatientIdForDoctorRelationship(authUserId: string, doctorId: string): Promise<string | null>;
}
