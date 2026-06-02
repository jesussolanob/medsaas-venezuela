import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type { WhereOptions } from 'sequelize';
import { Op } from 'sequelize';

import { PatientModel } from '../../../../patients/infrastructure/database/models/patient.model';
import { AppointmentModel } from '../../../../appointments/infrastructure/database/models/appointment.model';
import { PatientPackageModel } from '../../../../packages/infrastructure/database/models/patient-package.model';
import { PrescriptionModel } from '../../../../prescriptions/infrastructure/database/models/prescription.model';
import { PatientMessageModel } from '../models/patient-message.model';
import { CryptoService } from '../../../../../infrastructure/crypto/crypto.service';
import { DecryptionError } from '../../../../prescriptions/domain/errors/decryption.error';
import type {
  AppointmentSummary,
  PackageSummary,
} from '../../../domain/entities/patient-dashboard.entity';
import type {
  IPatientPortalRepository,
  PatientAppointmentsResult,
  PatientMessageRow,
} from '../../../domain/repositories/patient-portal.repository';
import type { Appointment } from '../../../../appointments/domain/entities/appointment.entity';
import type { Prescription } from '../../../../prescriptions/domain/entities/prescription.entity';
import type { Patient } from '../../../../patients/domain/entities/patient.entity';
import { Patient as PatientEntity } from '../../../../patients/domain/entities/patient.entity';
import { Prescription as PrescriptionEntity } from '../../../../prescriptions/domain/entities/prescription.entity';
import { Appointment as AppointmentEntity } from '../../../../appointments/domain/entities/appointment.entity';

interface DoctorRow {
  id: string;
  full_name: string;
  booking_token: string | null;
}

// Mirrors the same coercion used in SequelizePatientRepository.
// Returns null for legacy DB values outside the known PatientSource union.
const VALID_SOURCE_VALUES: ReadonlyArray<Patient['source']> = [
  'booking',
  'manual',
  'import',
  'invitation',
];

function parseSource(raw: string | null): Patient['source'] {
  if (raw === null) return null;
  const found = VALID_SOURCE_VALUES.find((v) => v === raw);
  return found ?? null;
}

/**
 * Sequelize implementation of IPatientPortalRepository.
 *
 * SCOPE INVARIANT: every query filters by auth_user_id (for appointments and
 * patient_packages) or by the set of patient_id(s) derived from auth_user_id
 * (for prescriptions and patient_messages). No row from another patient can
 * ever appear in the results.
 *
 * ENCRYPTION BOUNDARY: prescriptions.medication and prescriptions.dosage are
 * decrypted here before returning to the application layer.
 *
 * HIGH — AUTH_USER_ID INTEGRITY (security audit 2026-06-02):
 * appointments.auth_user_id and patient_packages.auth_user_id are NULLABLE in
 * the DB schema (patient-created without a portal account, or legacy rows).
 * When those columns are NULL, the portal simply cannot see those rows — the
 * WHERE { authUserId: user.sub } filter excludes them. This is not a bypass;
 * it is a data-visibility gap: unlinked rows are invisible to the portal.
 *
 * The gap is acceptable for Etapa 1 (all new appointments and packages created
 * through the API after the patient-portal launch should always carry
 * auth_user_id). Before Etapa 2/production, add a CHECK NOT NULL constraint on
 * appointments.auth_user_id and patient_packages.auth_user_id via migration,
 * and ensure the booking flow always populates auth_user_id when the patient
 * has a portal account.
 */
@Injectable()
export class SequelizePatientPortalRepository implements IPatientPortalRepository {
  constructor(
    @InjectModel(PatientModel)
    private readonly patientModel: typeof PatientModel,
    @InjectModel(AppointmentModel)
    private readonly appointmentModel: typeof AppointmentModel,
    @InjectModel(PatientPackageModel)
    private readonly packageModel: typeof PatientPackageModel,
    @InjectModel(PrescriptionModel)
    private readonly prescriptionModel: typeof PrescriptionModel,
    @InjectModel(PatientMessageModel)
    private readonly messageModel: typeof PatientMessageModel,
    private readonly crypto: CryptoService,
    private readonly sequelize: Sequelize,
  ) {}

  // ---------------------------------------------------------------------------
  // Patient records lookup
  // ---------------------------------------------------------------------------

  /**
   * Returns all patient_id(s) associated with this auth_user_id.
   * One patient may have records under multiple doctors.
   */
  async findPatientIdsByAuthUserId(authUserId: string): Promise<string[]> {
    const rows = await this.patientModel.findAll({
      where: { authUserId } as WhereOptions,
      attributes: ['id'],
    });
    return rows.map((r) => r.id);
  }

  /**
   * Returns all patient rows for this auth_user_id, decrypting PHI fields.
   * Used for the profile endpoints.
   */
  async findPatientsByAuthUserId(authUserId: string): Promise<Patient[]> {
    const rows = await this.patientModel.findAll({
      where: { authUserId } as WhereOptions,
      order: [['createdAt', 'DESC']],
    });
    return rows.map((r) => this.patientToDomain(r));
  }

  /**
   * Returns a single patient row by ID, scoped to authUserId to prevent IDOR.
   */
  async findPatientByIdAndAuthUserId(id: string, authUserId: string): Promise<Patient | null> {
    const row = await this.patientModel.findOne({
      where: { id, authUserId } as WhereOptions,
    });
    if (!row) return null;
    return this.patientToDomain(row);
  }

  /**
   * Updates non-PHI fields on the patient record, scoped by both ID and authUserId.
   */
  async updatePatient(
    id: string,
    authUserId: string,
    fields: { address?: string | null; city?: string | null; notes?: string | null },
  ): Promise<Patient | null> {
    await this.patientModel.update(fields, {
      where: { id, authUserId } as WhereOptions,
    });
    const updated = await this.patientModel.findOne({
      where: { id, authUserId } as WhereOptions,
    });
    if (!updated) return null;
    return this.patientToDomain(updated);
  }

  // ---------------------------------------------------------------------------
  // Appointments
  // ---------------------------------------------------------------------------

  /**
   * Returns the next upcoming appointment for the patient, scoped by auth_user_id.
   * "Upcoming" = status in (scheduled, confirmed) AND scheduled_at > now().
   */
  async findNextAppointment(authUserId: string): Promise<AppointmentSummary | null> {
    const row = await this.appointmentModel.findOne({
      where: {
        authUserId,
        status: { [Op.in]: ['scheduled', 'confirmed'] },
        scheduledAt: { [Op.gt]: new Date() },
      } as WhereOptions,
      order: [['scheduledAt', 'ASC']],
    });

    if (!row) return null;

    const doctorName = await this.resolveDoctorName(row.doctorId);

    return {
      id: row.id,
      scheduledAt: row.scheduledAt,
      status: row.status,
      appointmentMode: row.appointmentMode,
      planName: row.planName,
      doctorId: row.doctorId,
      doctorName,
    };
  }

  /**
   * Counts total appointments for this auth_user_id regardless of status.
   */
  async countAppointments(authUserId: string): Promise<number> {
    return this.appointmentModel.count({
      where: { authUserId } as WhereOptions,
    });
  }

  /**
   * Lists appointments for this auth_user_id, paginated, newest first.
   */
  async listAppointments(
    authUserId: string,
    page: number,
    limit: number,
  ): Promise<PatientAppointmentsResult> {
    const offset = (page - 1) * limit;
    const { count, rows } = await this.appointmentModel.findAndCountAll({
      where: { authUserId } as WhereOptions,
      order: [['scheduledAt', 'DESC']],
      limit,
      offset,
    });

    const items = rows.map((r) => this.appointmentToDomain(r));
    return { items, total: count as number, page, limit };
  }

  // ---------------------------------------------------------------------------
  // Packages
  // ---------------------------------------------------------------------------

  /**
   * Returns active packages for this auth_user_id with doctor info.
   *
   * TODO (N+1 optimization): currently issues 2 queries per package to resolve
   * doctor name and booking link. When a patient has more than ~5 packages,
   * batch the lookups by collecting unique doctorIds first, then:
   *   const names = await sequelize.query('SELECT id, full_name FROM profiles WHERE id IN (:ids)', ...)
   *   const tokens = await sequelize.query('SELECT doctor_id, token FROM doctor_invitations WHERE doctor_id IN (:ids)', ...)
   * Then resolve from in-memory maps. For Etapa 1 (1-3 packages typical), the
   * current approach is acceptable.
   */
  async findActivePackages(authUserId: string): Promise<PackageSummary[]> {
    const rows = await this.packageModel.findAll({
      where: { authUserId, status: 'active' } as WhereOptions,
      order: [['createdAt', 'DESC']],
    });

    const summaries: PackageSummary[] = [];
    for (const row of rows) {
      const doctorName = await this.resolveDoctorName(row.doctorId);
      const bookingLink = await this.resolveDoctorBookingLink(row.doctorId);
      summaries.push({
        id: row.id,
        planName: row.planName,
        totalSessions: Number(row.totalSessions),
        usedSessions: Number(row.usedSessions),
        remainingSessions: Number(row.totalSessions) - Number(row.usedSessions),
        status: row.status,
        doctorId: row.doctorId,
        doctorName,
        bookingLink,
      });
    }
    return summaries;
  }

  /**
   * Lists all packages (active and completed) for this auth_user_id, with doctor info.
   *
   * TODO (N+1 optimization): same as findActivePackages — batch doctor lookups
   * when patient package counts grow beyond ~5.
   */
  async listPackages(authUserId: string): Promise<PackageSummary[]> {
    const rows = await this.packageModel.findAll({
      where: { authUserId } as WhereOptions,
      order: [['createdAt', 'DESC']],
    });

    const summaries: PackageSummary[] = [];
    for (const row of rows) {
      const doctorName = await this.resolveDoctorName(row.doctorId);
      const bookingLink = await this.resolveDoctorBookingLink(row.doctorId);
      summaries.push({
        id: row.id,
        planName: row.planName,
        totalSessions: Number(row.totalSessions),
        usedSessions: Number(row.usedSessions),
        remainingSessions: Number(row.totalSessions) - Number(row.usedSessions),
        status: row.status,
        doctorId: row.doctorId,
        doctorName,
        bookingLink,
      });
    }
    return summaries;
  }

  // ---------------------------------------------------------------------------
  // Prescriptions
  // ---------------------------------------------------------------------------

  /**
   * Lists prescriptions for all patient_id(s) belonging to this auth_user_id.
   * Decrypts medication and dosage fields.
   */
  async listPrescriptions(patientIds: string[]): Promise<Prescription[]> {
    if (patientIds.length === 0) return [];

    const rows = await this.prescriptionModel.findAll({
      where: { patientId: { [Op.in]: patientIds } } as WhereOptions,
      order: [['createdAt', 'DESC']],
    });

    return rows.map((r) => this.prescriptionToDomain(r));
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  /**
   * Lists messages for all patient_id(s) belonging to this auth_user_id, chronological.
   * Optionally filtered by doctorId.
   */
  async listMessages(patientIds: string[], doctorId?: string): Promise<PatientMessageRow[]> {
    if (patientIds.length === 0) return [];

    const where: Record<string, unknown> = {
      patientId: { [Op.in]: patientIds },
    };
    if (doctorId) {
      where['doctorId'] = doctorId;
    }

    const rows = await this.messageModel.findAll({
      where: where as WhereOptions,
      order: [['createdAt', 'ASC']],
    });

    return rows.map((r) => ({
      id: r.id,
      patientId: r.patientId,
      doctorId: r.doctorId,
      body: r.body,
      direction: r.direction as 'patient_to_doctor' | 'doctor_to_patient',
      readAt: r.readAt,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Inserts a new patient_to_doctor message.
   * Caller must already have verified that patientId belongs to authUserId.
   */
  async insertMessage(
    patientId: string,
    doctorId: string,
    body: string,
  ): Promise<PatientMessageRow> {
    const row = await this.messageModel.create({
      patientId,
      doctorId,
      body,
      direction: 'patient_to_doctor',
      readAt: null,
    });

    return {
      id: row.id,
      patientId: row.patientId,
      doctorId: row.doctorId,
      body: row.body,
      direction: 'patient_to_doctor',
      readAt: null,
      createdAt: row.createdAt,
    };
  }

  /**
   * Returns a patient_id that belongs to both the given authUserId and doctorId.
   * Returns null if no relationship exists — used to validate send-message auth.
   */
  async findPatientIdForDoctorRelationship(
    authUserId: string,
    doctorId: string,
  ): Promise<string | null> {
    const row = await this.patientModel.findOne({
      where: { authUserId, doctorId } as WhereOptions,
      attributes: ['id'],
    });
    return row?.id ?? null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async resolveDoctorName(doctorId: string): Promise<string | null> {
    const rows = await this.sequelize.query<DoctorRow>(
      'SELECT id, full_name FROM profiles WHERE id = :doctorId LIMIT 1',
      { replacements: { doctorId }, type: QueryTypes.SELECT },
    );
    return rows[0]?.full_name ?? null;
  }

  private async resolveDoctorBookingLink(doctorId: string): Promise<string | null> {
    const rows = await this.sequelize.query<{ token: string }>(
      'SELECT token FROM doctor_invitations WHERE doctor_id = :doctorId AND is_active = true LIMIT 1',
      { replacements: { doctorId }, type: QueryTypes.SELECT },
    );
    if (!rows[0]) return null;
    return `/book/${rows[0].token}`;
  }

  private patientToDomain(row: PatientModel): Patient {
    return PatientEntity.create({
      id: row.id,
      doctorId: row.doctorId,
      authUserId: row.authUserId,
      fullName: this.crypto.decrypt(row.fullName),
      cedula: row.cedula ? this.crypto.decrypt(row.cedula) : null,
      phone: row.phone ? this.crypto.decrypt(row.phone) : null,
      email: row.email ? this.crypto.decrypt(row.email) : null,
      source: parseSource(row.source),
      birthDate: row.birthDate,
      age: row.age,
      sex: (row.sex as Patient['sex']) ?? null,
      bloodType: row.bloodType,
      allergies: row.allergies,
      chronicConditions: row.chronicConditions,
      address: row.address,
      city: row.city,
      emergencyContactName: row.emergencyContactName,
      emergencyContactPhone: row.emergencyContactPhone,
      notes: row.notes,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private prescriptionToDomain(row: PrescriptionModel): Prescription {
    return PrescriptionEntity.create({
      id: row.id,
      doctorId: row.doctorId,
      patientId: row.patientId,
      consultationId: row.consultationId,
      medication: this.requireDecrypt(row.medication, 'medication'),
      dosage: this.safeDecrypt(row.dosage, 'dosage'),
      frequency: row.frequency,
      duration: row.duration,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private appointmentToDomain(row: AppointmentModel): Appointment {
    return AppointmentEntity.create({
      id: row.id,
      doctorId: row.doctorId,
      patientId: row.patientId,
      authUserId: row.authUserId,
      consultationId: row.consultationId,
      patientName: row.patientName,
      patientPhone: row.patientPhone,
      patientEmail: row.patientEmail,
      patientCedula: row.patientCedula,
      scheduledAt: row.scheduledAt,
      status: row.status,
      appointmentMode: row.appointmentMode,
      source: row.source,
      planName: row.planName,
      planPrice: row.planPrice !== null ? Number(row.planPrice) : null,
      paymentMethod: row.paymentMethod,
      paymentReference: row.paymentReference,
      paymentReceiptUrl: row.paymentReceiptUrl,
      insuranceName: row.insuranceName,
      bcvRate: row.bcvRate !== null ? Number(row.bcvRate) : null,
      amountBs: row.amountBs !== null ? Number(row.amountBs) : null,
      packageId: row.packageId,
      sessionNumber: row.sessionNumber,
      chiefComplaint: row.chiefComplaint,
      appointmentCode: row.appointmentCode,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private safeDecrypt(value: string | null, field: string): string | null {
    if (!value) return null;
    try {
      return this.crypto.decrypt(value);
    } catch {
      throw new DecryptionError(field);
    }
  }

  private requireDecrypt(value: string | null, field: string): string {
    const decrypted = this.safeDecrypt(value, field);
    if (decrypted === null) {
      throw new DecryptionError(field);
    }
    return decrypted;
  }
}
