import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes } from 'sequelize';
import type { Transaction, WhereOptions } from 'sequelize';
import type { AppointmentStatus, AppointmentMode } from '@delta/shared-types';
import { Appointment } from '../../../domain/entities/appointment.entity';
import type {
  IAppointmentRepository,
  AppointmentListFilters,
  AppointmentListResult,
  OverlapParams,
  PatientOverlapParams,
  PackageInfo,
  AuditLogEntry,
} from '../../../domain/repositories/appointment.repository';
import { AppointmentModel } from '../models/appointment.model';
import { AppointmentChangesLogModel } from '../models/appointment-changes-log.model';

// patient_packages is queried directly via raw SQL to avoid coupling to the
// (not-yet-existing) packages module. No Sequelize model import needed.
import { Sequelize } from 'sequelize-typescript';

const ACTIVE_STATUSES = ['scheduled', 'confirmed', 'pending', 'accepted'];

/**
 * Common raw-SQL row shape returned by appointment queries.
 * The enriched list query also provides the optional joined fields;
 * the upcoming-without-event query omits them (they arrive as undefined
 * and are defaulted to null in rawRowToDomain).
 */
interface RawAppointmentRow {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  auth_user_id: string | null;
  consultation_id: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  patient_email: string | null;
  patient_cedula: string | null;
  scheduled_at: string;
  status: string;
  appointment_mode: string;
  source: string | null;
  plan_name: string | null;
  plan_price: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  payment_receipt_url: string | null;
  insurance_name: string | null;
  bcv_rate: string | null;
  amount_bs: string | null;
  package_id: string | null;
  session_number: number | null;
  chief_complaint: string | null;
  appointment_code: string | null;
  payment_id: string | null;
  meet_link: string | null;
  office_id: string | null;
  google_calendar_event_id: string | null;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
  // Present only in the enriched paginated list query (LEFT JOIN consultations)
  consultation_payment_status?: string | null;
  consultation_code?: string | null;
  // Present only in the enriched detail query (LEFT JOIN doctor_offices)
  office_name?: string | null;
}

interface PackageRow {
  id: string;
  doctor_id: string;
  used_sessions: string | number;
  total_sessions: string | number;
  status: string;
}

@Injectable()
export class SequelizeAppointmentRepository implements IAppointmentRepository {
  constructor(
    @InjectModel(AppointmentModel)
    private readonly appointmentModel: typeof AppointmentModel,
    @InjectModel(AppointmentChangesLogModel)
    private readonly changesLogModel: typeof AppointmentChangesLogModel,
    private readonly sequelize: Sequelize,
  ) {}

  async findById(id: string): Promise<Appointment | null> {
    const row = await this.appointmentModel.findByPk(id);
    if (!row) return null;
    return this.toDomain(row);
  }

  async list(filters: AppointmentListFilters): Promise<AppointmentListResult> {
    // Build WHERE conditions dynamically for raw SQL (needed for the LEFT JOIN enrichment)
    const conditions: string[] = ['a.doctor_id = :doctorId'];
    const replacements: Record<string, unknown> = { doctorId: filters.doctorId };

    if (filters.status) {
      conditions.push('a.status = :status');
      replacements['status'] = filters.status;
    }
    if (filters.dateFrom) {
      conditions.push('a.scheduled_at >= :dateFrom');
      replacements['dateFrom'] = filters.dateFrom;
    }
    if (filters.dateTo) {
      conditions.push('a.scheduled_at <= :dateTo');
      replacements['dateTo'] = filters.dateTo;
    }

    const where = conditions.join(' AND ');
    const offset = (filters.page - 1) * filters.limit;

    // COUNT (no JOIN needed — avoids inflating count via LEFT JOIN)
    const countRows = await this.sequelize.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM appointments a WHERE ${where}`,
      { replacements, type: QueryTypes.SELECT },
    );
    const total = parseInt(countRows[0]?.cnt ?? '0', 10);

    // LIST with LEFT JOIN to consultations to expose consultation payment_status
    const rows = await this.sequelize.query<RawAppointmentRow>(
      `SELECT
         a.id, a.doctor_id, a.patient_id, a.auth_user_id, a.consultation_id,
         a.patient_name, a.patient_phone, a.patient_email, a.patient_cedula,
         a.scheduled_at, a.status, a.appointment_mode, a.source,
         a.plan_name, a.plan_price, a.payment_method, a.payment_reference, a.payment_receipt_url,
         a.insurance_name, a.bcv_rate, a.amount_bs, a.package_id, a.session_number,
         a.chief_complaint, a.appointment_code, a.payment_id, a.meet_link, a.office_id,
         a.google_calendar_event_id, a.duration_minutes, a.created_at, a.updated_at,
         c.payment_status AS consultation_payment_status,
         c.consultation_code AS consultation_code
       FROM appointments a
       LEFT JOIN consultations c ON c.id = a.consultation_id
       WHERE ${where}
       ORDER BY a.scheduled_at ASC
       LIMIT :limit OFFSET :offset`,
      {
        replacements: { ...replacements, limit: filters.limit, offset },
        type: QueryTypes.SELECT,
      },
    );

    return {
      items: rows.map((r) => this.rawRowToDomain(r)),
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async save(appointment: Appointment, transaction?: Transaction): Promise<Appointment> {
    const row = await this.appointmentModel.create(
      {
        id: appointment.id,
        doctorId: appointment.doctorId,
        patientId: appointment.patientId,
        authUserId: appointment.authUserId,
        consultationId: appointment.consultationId,
        patientName: appointment.patientName,
        patientPhone: appointment.patientPhone,
        patientEmail: appointment.patientEmail,
        patientCedula: appointment.patientCedula,
        scheduledAt: appointment.scheduledAt,
        status: appointment.status,
        appointmentMode: appointment.appointmentMode,
        source: appointment.source,
        planName: appointment.planName,
        planPrice: appointment.planPrice,
        paymentMethod: appointment.paymentMethod,
        paymentReference: appointment.paymentReference,
        paymentReceiptUrl: appointment.paymentReceiptUrl,
        insuranceName: appointment.insuranceName,
        bcvRate: appointment.bcvRate,
        amountBs: appointment.amountBs,
        packageId: appointment.packageId,
        sessionNumber: appointment.sessionNumber,
        chiefComplaint: appointment.chiefComplaint,
        appointmentCode: appointment.appointmentCode,
        paymentId: appointment.paymentId ?? null,
        meetLink: appointment.meetLink ?? null,
        officeId: appointment.officeId ?? null,
        googleCalendarEventId: appointment.googleCalendarEventId ?? null,
        durationMinutes: appointment.durationMinutes ?? null,
      },
      { transaction },
    );
    return this.toDomain(row);
  }

  /**
   * Persists the meet_link for an existing appointment.
   * Used by the booking flow after calendar event creation.
   */
  async updateMeetLink(id: string, meetLink: string): Promise<void> {
    await this.appointmentModel.update({ meetLink }, { where: { id } });
  }

  /**
   * Persists the Google Calendar event ID for an existing appointment.
   * Used by the booking flow after a successful Google Meet event creation.
   */
  async updateGoogleEventId(id: string, eventId: string): Promise<void> {
    await this.appointmentModel.update({ googleCalendarEventId: eventId }, { where: { id } });
  }

  async updateConsultationId(id: string, consultationId: string): Promise<Appointment> {
    await this.appointmentModel.update({ consultationId }, { where: { id } });
    const updated = await this.appointmentModel.findByPk(id);
    return this.toDomain(updated as AppointmentModel);
  }

  async deleteById(id: string): Promise<void> {
    await this.appointmentModel.destroy({ where: { id } });
  }

  async updateStatus(id: string, status: AppointmentStatus): Promise<Appointment> {
    await this.appointmentModel.update({ status }, { where: { id } });
    const updated = await this.appointmentModel.findByPk(id);
    // findByPk after successful update should never be null
    return this.toDomain(updated as AppointmentModel);
  }

  /**
   * Returns true when the new appointment interval [scheduledAt, scheduledAt + durationMinutes)
   * overlaps with any active appointment for the given doctor.
   *
   * Overlap condition (half-open intervals):
   *   existing.scheduled_at < :newEnd
   *   AND (existing.scheduled_at + COALESCE(existing.duration_minutes, 30) * INTERVAL '1 minute') > :newStart
   *
   * Legacy rows with NULL duration_minutes are treated as 30-minute slots via COALESCE.
   */
  async hasOverlap(params: OverlapParams): Promise<boolean> {
    const newStart = params.scheduledAt;
    const newEnd = new Date(params.scheduledAt.getTime() + params.durationMinutes * 60 * 1000);

    const excludeClause = params.excludeId ? `AND id <> :excludeId` : '';

    interface CountRow {
      cnt: string | number;
    }

    const rows = await this.sequelize.query<CountRow>(
      `SELECT COUNT(*) AS cnt
       FROM appointments
       WHERE doctor_id = :doctorId
         AND status IN (:activeStatuses)
         AND scheduled_at < :newEnd
         AND (scheduled_at + COALESCE(duration_minutes, 30) * INTERVAL '1 minute') > :newStart
         ${excludeClause}`,
      {
        replacements: {
          doctorId: params.doctorId,
          activeStatuses: ACTIVE_STATUSES,
          newStart,
          newEnd,
          ...(params.excludeId ? { excludeId: params.excludeId } : {}),
        },
        type: QueryTypes.SELECT,
      },
    );

    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  /**
   * Returns true when the patient already has an active appointment (with ANY doctor)
   * whose interval overlaps with [scheduledAt, scheduledAt + durationMinutes).
   *
   * Cross-doctor: does NOT filter by doctor_id — a patient cannot be in two places at once.
   * Legacy rows with NULL duration_minutes are treated as 30-minute slots via COALESCE.
   */
  async hasPatientOverlap(params: PatientOverlapParams): Promise<boolean> {
    const newStart = params.scheduledAt;
    const newEnd = new Date(params.scheduledAt.getTime() + params.durationMinutes * 60 * 1000);

    const excludeClause = params.excludeId ? `AND id <> :excludeId` : '';

    interface CountRow {
      cnt: string | number;
    }

    const rows = await this.sequelize.query<CountRow>(
      `SELECT COUNT(*) AS cnt
       FROM appointments
       WHERE patient_id = :patientId
         AND status IN (:activeStatuses)
         AND scheduled_at < :newEnd
         AND (scheduled_at + COALESCE(duration_minutes, 30) * INTERVAL '1 minute') > :newStart
         ${excludeClause}`,
      {
        replacements: {
          patientId: params.patientId,
          activeStatuses: ACTIVE_STATUSES,
          newStart,
          newEnd,
          ...(params.excludeId ? { excludeId: params.excludeId } : {}),
        },
        type: QueryTypes.SELECT,
      },
    );

    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  async findPackageById(packageId: string): Promise<PackageInfo | null> {
    // QueryTypes.SELECT returns the rows directly as an array (no [rows, meta] tuple).
    const rows = await this.sequelize.query<PackageRow>(
      `SELECT id, doctor_id, used_sessions, total_sessions, status
       FROM patient_packages
       WHERE id = :packageId
       LIMIT 1`,
      { replacements: { packageId }, type: QueryTypes.SELECT },
    );

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      doctorId: row.doctor_id,
      usedSessions: Number(row.used_sessions),
      totalSessions: Number(row.total_sessions),
      status: row.status,
    };
  }

  async incrementPackageSessions(packageId: string, currentUsedSessions: number): Promise<boolean> {
    // QueryTypes.UPDATE returns [undefined, affectedCount: number] — no casting required.
    const [, affectedCount] = await this.sequelize.query(
      `UPDATE patient_packages
       SET used_sessions = used_sessions + 1,
           updated_at    = now()
       WHERE id             = :packageId
         AND used_sessions  = :currentUsedSessions`,
      {
        replacements: { packageId, currentUsedSessions },
        type: QueryTypes.UPDATE,
      },
    );

    return affectedCount === 1;
  }

  async logStatusChange(entry: AuditLogEntry): Promise<void> {
    await this.changesLogModel.create({
      appointmentId: entry.appointmentId,
      actorId: entry.actorId,
      oldStatus: entry.oldStatus ?? null,
      newStatus: entry.newStatus,
    });
  }

  async findActiveByDoctorAndDateRange(
    doctorId: string,
    from: Date,
    to: Date,
  ): Promise<Appointment[]> {
    const rows = await this.appointmentModel.findAll({
      where: {
        doctorId,
        scheduledAt: { [Op.between]: [from, to] },
        status: { [Op.in]: ACTIVE_STATUSES },
      },
      order: [['scheduledAt', 'ASC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async updateScheduledAt(id: string, scheduledAt: Date): Promise<Appointment> {
    await this.appointmentModel.update({ scheduledAt }, { where: { id } });
    const updated = await this.appointmentModel.findByPk(id);
    return this.toDomain(updated as AppointmentModel);
  }

  async findByIdForDoctor(id: string, doctorId: string): Promise<Appointment | null> {
    const row = await this.appointmentModel.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  /**
   * Finds a single appointment by ID scoped to doctorId, enriched with:
   *   - consultation_code and payment_status via LEFT JOIN consultations
   *   - office_name via LEFT JOIN doctor_offices
   *
   * SECURITY: WHERE clause includes doctor_id = :doctorId to enforce ownership
   * at the repository (SQL) level — not just at the use-case level. This is the
   * correct anti-IDOR pattern (defence in depth). Returns null for appointments
   * that do not exist or belong to another doctor — indistinguishable (anti-enumeration).
   *
   * NOTE: Full PII is returned (no masking). This endpoint is owner-scoped and
   * does NOT require an audit entry — see ADR-005 for the precedent.
   */
  async findByIdScopedEnriched(id: string, doctorId: string): Promise<Appointment | null> {
    const rows = await this.sequelize.query<RawAppointmentRow>(
      `SELECT
         a.id, a.doctor_id, a.patient_id, a.auth_user_id, a.consultation_id,
         a.patient_name, a.patient_phone, a.patient_email, a.patient_cedula,
         a.scheduled_at, a.status, a.appointment_mode, a.source,
         a.plan_name, a.plan_price, a.payment_method, a.payment_reference, a.payment_receipt_url,
         a.insurance_name, a.bcv_rate, a.amount_bs, a.package_id, a.session_number,
         a.chief_complaint, a.appointment_code, a.payment_id, a.meet_link, a.office_id,
         a.google_calendar_event_id, a.duration_minutes, a.created_at, a.updated_at,
         c.payment_status   AS consultation_payment_status,
         c.consultation_code AS consultation_code,
         o.name             AS office_name
       FROM appointments a
       LEFT JOIN consultations c ON c.id = a.consultation_id
       LEFT JOIN doctor_offices o ON o.id = a.office_id
       WHERE a.id = :id
         AND a.doctor_id = :doctorId
       LIMIT 1`,
      {
        replacements: { id, doctorId },
        type: QueryTypes.SELECT,
      },
    );

    const row = rows[0];
    if (!row) return null;
    return this.rawRowToDomain(row);
  }

  async findFirstCompletedByPaymentId(paymentId: string): Promise<Appointment | null> {
    const row = await this.appointmentModel.findOne({
      where: {
        paymentId,
        status: 'completed',
      } as WhereOptions,
      order: [['updatedAt', 'ASC']],
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async findUpcomingWithoutCalendarEvent(
    doctorId: string,
    from: Date,
    limit: number,
  ): Promise<Appointment[]> {
    const rows = await this.sequelize.query<RawAppointmentRow>(
      `SELECT
         id, doctor_id, patient_id, auth_user_id, consultation_id,
         patient_name, patient_phone, patient_email, patient_cedula,
         scheduled_at, status, appointment_mode, source,
         plan_name, plan_price, payment_method, payment_reference, payment_receipt_url,
         insurance_name, bcv_rate, amount_bs, package_id, session_number,
         chief_complaint, appointment_code, payment_id, meet_link, office_id,
         google_calendar_event_id, duration_minutes, created_at, updated_at
       FROM appointments
       WHERE doctor_id = :doctorId
         AND google_calendar_event_id IS NULL
         AND scheduled_at >= :from
         AND status IN ('scheduled', 'confirmed')
       ORDER BY scheduled_at ASC
       LIMIT :limit`,
      {
        replacements: { doctorId, from, limit },
        type: QueryTypes.SELECT,
      },
    );

    return rows.map((r) => this.rawRowToDomain(r));
  }

  /** Maps a raw SQL row (snake_case) to a domain Appointment. */
  private rawRowToDomain(r: RawAppointmentRow): Appointment {
    return Appointment.create({
      id: r.id,
      doctorId: r.doctor_id,
      patientId: r.patient_id,
      authUserId: r.auth_user_id,
      consultationId: r.consultation_id,
      patientName: r.patient_name,
      patientPhone: r.patient_phone,
      patientEmail: r.patient_email,
      patientCedula: r.patient_cedula,
      scheduledAt: new Date(r.scheduled_at),
      status: r.status as AppointmentStatus,
      appointmentMode: r.appointment_mode as AppointmentMode,
      source: r.source,
      planName: r.plan_name,
      planPrice: r.plan_price !== null ? Number(r.plan_price) : null,
      paymentMethod: r.payment_method,
      paymentReference: r.payment_reference,
      paymentReceiptUrl: r.payment_receipt_url,
      insuranceName: r.insurance_name,
      bcvRate: r.bcv_rate !== null ? Number(r.bcv_rate) : null,
      amountBs: r.amount_bs !== null ? Number(r.amount_bs) : null,
      packageId: r.package_id,
      sessionNumber: r.session_number,
      chiefComplaint: r.chief_complaint,
      appointmentCode: r.appointment_code,
      paymentId: r.payment_id,
      meetLink: r.meet_link,
      officeId: r.office_id,
      googleCalendarEventId: r.google_calendar_event_id,
      durationMinutes: r.duration_minutes,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
      paymentStatus: r.consultation_payment_status ?? null,
      consultationCode: r.consultation_code ?? null,
      officeName: r.office_name ?? null,
    });
  }

  private toDomain(row: AppointmentModel): Appointment {
    return Appointment.create({
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
      paymentId: row.paymentId ?? null,
      meetLink: row.meetLink ?? null,
      officeId: row.officeId ?? null,
      googleCalendarEventId: row.googleCalendarEventId ?? null,
      durationMinutes: row.durationMinutes ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
