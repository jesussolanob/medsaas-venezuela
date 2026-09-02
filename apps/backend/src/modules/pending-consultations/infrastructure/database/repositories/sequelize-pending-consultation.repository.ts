import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import type { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { randomUUID } from 'crypto';
import { PendingConsultation } from '../../../domain/entities/pending-consultation.entity';
import type {
  IPendingConsultationRepository,
  PendingConsultationListFilters,
  PendingConsultationBulkCreateItem,
  PackageUsageRow,
} from '../../../domain/repositories/pending-consultation.repository';
import { PendingConsultationModel } from '../models/pending-consultation.model';
import type { PendingConsultationStatus } from '@delta/shared-types';

/**
 * Raw row returned by the getPackageUsage query.
 *
 * The counters are cast to `::int` in the SQL, so node-postgres delivers them
 * as JS numbers — NOT as the strings that a bare bigint COUNT would produce.
 * Typing them as string here would be a lie that happens to survive because
 * parseInt() coerces; better to say what actually comes down the wire.
 */
interface PackageUsageRawRow {
  patient_id: string;
  plan_name: string;
  /** INTEGER from pricing_plans — delivered as number by pg driver. */
  total_sessions: number | null;
  attended: number;
  scheduled: number;
  no_show: number;
  pending_scheduling: number;
}

@Injectable()
export class SequelizePendingConsultationRepository implements IPendingConsultationRepository {
  constructor(
    @InjectModel(PendingConsultationModel)
    private readonly model: typeof PendingConsultationModel,
    private readonly sequelize: Sequelize,
  ) {}

  async findById(id: string): Promise<PendingConsultation | null> {
    const row = await this.model.findByPk(id);
    if (!row) return null;
    return this.toDomain(row);
  }

  async findByIdAndDoctor(id: string, doctorId: string): Promise<PendingConsultation | null> {
    const row = await this.model.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async findByDoctor(filters: PendingConsultationListFilters): Promise<PendingConsultation[]> {
    const where: Record<string, unknown> = { doctorId: filters.doctorId };
    if (filters.status) {
      where['status'] = filters.status;
    }

    const rows = await this.model.findAll({
      where: where as WhereOptions,
      order: [['createdAt', 'DESC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findExpired(limit = 500): Promise<PendingConsultation[]> {
    const rows = await this.model.findAll({
      where: {
        status: 'pending_scheduling' as PendingConsultationStatus,
        expiresAt: { [Op.lt]: new Date() },
      } as WhereOptions,
      limit,
      order: [['expiresAt', 'ASC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async bulkCreate(
    items: PendingConsultationBulkCreateItem[],
    transaction?: Transaction,
  ): Promise<PendingConsultation[]> {
    const now = new Date();
    const records = items.map((item) => ({
      id: randomUUID(),
      doctorId: item.doctorId,
      patientId: item.patientId,
      authUserId: item.authUserId ?? null,
      packageId: item.packageId ?? null,
      paymentId: item.paymentId ?? null,
      planName: item.planName,
      officeId: item.officeId ?? null,
      appointmentMode: item.appointmentMode ?? null,
      sessionNumber: item.sessionNumber,
      status: 'pending_scheduling' as PendingConsultationStatus,
      expiresAt: item.expiresAt ?? null,
      scheduledAppointmentId: null,
      consultationId: null,
      reminderStage: 0,
      lastReminderAt: null,
      createdAt: now,
      updatedAt: now,
    }));

    const rows = await this.model.bulkCreate(records, { transaction });
    return rows.map((r) => this.toDomain(r));
  }

  async save(entity: PendingConsultation, transaction?: Transaction): Promise<PendingConsultation> {
    const [row] = await this.model.upsert(
      {
        id: entity.id,
        doctorId: entity.doctorId,
        patientId: entity.patientId,
        authUserId: entity.authUserId,
        packageId: entity.packageId,
        paymentId: entity.paymentId,
        planName: entity.planName,
        officeId: entity.officeId,
        appointmentMode: entity.appointmentMode,
        sessionNumber: entity.sessionNumber,
        status: entity.status,
        expiresAt: entity.expiresAt,
        scheduledAppointmentId: entity.scheduledAppointmentId,
        consultationId: entity.consultationId,
        reminderStage: entity.reminderStage,
        lastReminderAt: entity.lastReminderAt,
        updatedAt: entity.updatedAt,
      },
      { transaction, returning: true },
    );
    return this.toDomain(row);
  }

  async bulkExpire(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    // IN (:ids), NO "= ANY(:ids)": con `replacements` Sequelize sustituye el
    // arreglo por literales entrecomillados y Postgres intenta leerlos como un
    // arreglo → "malformed array literal". Este UPDATE es el que marca vencidas
    // las preconsultas: con ANY fallaba entero y ninguna vencía nunca.
    await this.model.sequelize?.query(
      `UPDATE pending_consultations
       SET status = 'expired', updated_at = NOW()
       WHERE id IN (:ids) AND status = 'pending_scheduling'`,
      {
        replacements: { ids },
        type: QueryTypes.UPDATE,
      },
    );
  }

  async findDueForReminder(limit = 200): Promise<PendingConsultation[]> {
    const rows = await this.model.findAll({
      where: {
        status: 'pending_scheduling' as PendingConsultationStatus,
        [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
      } as WhereOptions,
      order: [['createdAt', 'ASC']],
      limit,
    });
    return rows.map((r) => this.toDomain(r));
  }

  async updateReminderStage(id: string, stage: number, lastReminderAt: Date): Promise<void> {
    await this.model.update(
      { reminderStage: stage, lastReminderAt, updatedAt: new Date() },
      {
        where: {
          id,
          status: 'pending_scheduling' as PendingConsultationStatus,
        } as WhereOptions,
      },
    );
  }

  async getPackageUsage(doctorId: string, patientId?: string): Promise<PackageUsageRow[]> {
    /**
     * Strategy: UNION ALL of two source tables → aggregate by plan_name → join
     * pricing_plans for sessions_count → filter to real packages only.
     *
     * Two sources:
     *   1. appointments: contributes attended/scheduled/no_show buckets.
     *      Cancelled status is excluded (does not count in any bucket).
     *   2. pending_consultations: contributes pending_scheduling count only.
     *      'scheduled' rows are excluded because they already have an
     *      appointment that is counted in source 1 — avoiding double-count.
     *      'cancelled' and 'expired' rows are also excluded.
     *
     * After aggregation, only plans with sessions_count > 1 OR at least one
     * pending_scheduling row are included. This filters out single-session
     * "consultas sueltas" (e.g. five separate "Consulta general" appointments
     * that would otherwise show as "5 atendidas de 1").
     *
     * Grouped by (patient_id, plan_name) — NOT by payment_id, because payment_id
     * can be null when the doctor creates a package manually. If the patient buys
     * the same plan twice, counts accumulate in one row — documented and accepted.
     *
     * `patientId` is OPTIONAL: without it the query returns every patient of the
     * doctor in ONE grouped pass. The patients list renders a badge per row and
     * loads up to 100 patients per page — one query per patient would be an N+1.
     * Ownership is still enforced by the doctor_id filter on both sources.
     *
     * No PII (patient name, plan details beyond the plan_name) is logged.
     */
    // Filtro opcional por paciente. Se interpola solo el fragmento fijo; el valor
    // sigue viajando como replacement, así que no hay superficie de inyección.
    const patientFilter = patientId ? 'AND patient_id = :patientId' : '';

    const rows = await this.sequelize.query<PackageUsageRawRow>(
      `WITH raw AS (
         -- Source 1: appointments → attended / scheduled / no_show
         SELECT
           patient_id,
           plan_name,
           COUNT(*) FILTER (WHERE status = 'completed')                        AS attended,
           COUNT(*) FILTER (WHERE status IN ('scheduled', 'confirmed'))        AS scheduled,
           COUNT(*) FILTER (WHERE status = 'no_show')                          AS no_show,
           0::bigint                                                           AS pending_scheduling
         FROM appointments
         WHERE doctor_id  = :doctorId
           ${patientFilter}
           AND patient_id IS NOT NULL
           AND plan_name  IS NOT NULL
           AND status    != 'cancelled'
         GROUP BY patient_id, plan_name

         UNION ALL

         -- Source 2: pending_consultations → pending_scheduling only.
         -- 'scheduled' rows already have an appointment (counted above).
         SELECT
           patient_id,
           plan_name,
           0::bigint AS attended,
           0::bigint AS scheduled,
           0::bigint AS no_show,
           COUNT(*) FILTER (WHERE status = 'pending_scheduling')               AS pending_scheduling
         FROM pending_consultations
         WHERE doctor_id  = :doctorId
           ${patientFilter}
           AND plan_name  IS NOT NULL
         GROUP BY patient_id, plan_name
       ),
       combined AS (
         SELECT
           patient_id,
           plan_name,
           SUM(attended)            AS attended,
           SUM(scheduled)           AS scheduled,
           SUM(no_show)             AS no_show,
           SUM(pending_scheduling)  AS pending_scheduling
         FROM raw
         GROUP BY patient_id, plan_name
       )
       SELECT
         c.patient_id::text,
         c.plan_name,
         -- Subconsulta escalar, NO join: el especialista puede repetir el nombre
         -- de un servicio y un JOIN por nombre duplicaría la fila del paquete.
         -- Mismo criterio que usa el repositorio de consultas para este dato.
         (SELECT pp.sessions_count
            FROM pricing_plans pp
           WHERE pp.doctor_id = :doctorId
             AND pp.name      = c.plan_name
           ORDER BY pp.is_active DESC, pp.created_at DESC
           LIMIT 1)                     AS total_sessions,
         c.attended::int,
         c.scheduled::int,
         c.no_show::int,
         c.pending_scheduling::int
       FROM combined c
       WHERE
         -- Solo combos de verdad: un plan de sesión única no es un paquete y
         -- saldría como "5 atendidas de 1", que no significa nada.
         (COALESCE((SELECT pp.sessions_count
                      FROM pricing_plans pp
                     WHERE pp.doctor_id = :doctorId
                       AND pp.name      = c.plan_name
                     ORDER BY pp.is_active DESC, pp.created_at DESC
                     LIMIT 1), 0) > 1
          OR c.pending_scheduling > 0)
         -- Y con algo que mostrar: si quedó todo en cancelado, no hay fila.
         AND (c.attended + c.scheduled + c.no_show + c.pending_scheduling) > 0
       ORDER BY c.patient_id, c.plan_name`,
      {
        replacements: patientId ? { doctorId, patientId } : { doctorId },
        type: QueryTypes.SELECT,
      },
    );

    // Number() y no parseInt(): el `::int` del SQL hace que pg entregue números,
    // pero un COUNT sin castear llegaría como string. Number() da lo mismo con
    // los dos y no depende de que nadie recuerde mantener el cast.
    return rows.map((r) => ({
      patientId: r.patient_id,
      planName: r.plan_name,
      totalSessions: r.total_sessions != null ? Number(r.total_sessions) : null,
      attended: Number(r.attended),
      scheduled: Number(r.scheduled),
      noShow: Number(r.no_show),
      pendingScheduling: Number(r.pending_scheduling),
    }));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: PendingConsultationModel): PendingConsultation {
    return PendingConsultation.create({
      id: row.id,
      doctorId: row.doctorId,
      patientId: row.patientId,
      authUserId: row.authUserId,
      packageId: row.packageId,
      paymentId: row.paymentId,
      planName: row.planName,
      officeId: row.officeId,
      appointmentMode: row.appointmentMode,
      sessionNumber: Number(row.sessionNumber),
      status: row.status,
      expiresAt: row.expiresAt,
      scheduledAppointmentId: row.scheduledAppointmentId,
      consultationId: row.consultationId,
      reminderStage: Number(row.reminderStage),
      lastReminderAt: row.lastReminderAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
