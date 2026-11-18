import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, UniqueConstraintError } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { deriveOnboardingStep } from '@delta/shared-types';
import type {
  ISellerRepository,
  SellerProfile,
  SellerAdminRow,
  SellerSpecialistRow,
  SellerSpecialistWithStats,
  SellerPaymentDetails,
  SpecialistSellerAssignment,
  CreateSellerParams,
  CreateSoldSpecialistParams,
} from '../../../domain/repositories/seller.repository';
import { SellerProfileModel } from '../models/seller-profile.model';
import { SpecialistEmailConflictError } from '../../../domain/errors/specialist-email-conflict.error';
import { SellerNotFoundError } from '../../../domain/errors/seller-not-found.error';

/** Trial duration in days — matches the value used throughout the platform. */
const TRIAL_DURATION_DAYS = 30;

@Injectable()
export class SequelizeSellerRepository implements ISellerRepository {
  constructor(
    @InjectModel(SellerProfileModel)
    private readonly profileModel: typeof SellerProfileModel,
    private readonly sequelize: Sequelize,
  ) {}

  // ---------------------------------------------------------------------------
  // Seller profile management
  // ---------------------------------------------------------------------------

  async createSeller(params: CreateSellerParams): Promise<SellerProfile> {
    try {
      const row = await this.profileModel.create({
        id: params.id,
        fullName: params.fullName,
        email: params.email,
        role: 'seller',
        isActive: true,
        sellerCode: params.sellerCode,
        soldBy: null,
        plan: null,
        subscriptionStatus: null,
        specialty: null,
      } as Parameters<typeof SellerProfileModel.create>[0]);

      return {
        id: row.id,
        fullName: row.fullName,
        email: row.email,
        sellerCode: row.sellerCode!,
        createdAt: row.createdAt,
      };
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        // Unique violations can be on email OR seller_code (unlikely on code but handled).
        const existing = await this.profileModel.findOne({
          where: { email: { [Op.iLike]: params.email } },
        });
        if (existing) throw new SpecialistEmailConflictError();
      }
      throw err;
    }
  }

  async findById(id: string): Promise<SellerProfile | null> {
    const row = await this.profileModel.findOne({
      where: { id, role: 'seller' },
    });
    if (!row) return null;
    return {
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      sellerCode: row.sellerCode!,
      createdAt: row.createdAt,
    };
  }

  async findByCode(code: string): Promise<SellerProfile | null> {
    const row = await this.profileModel.findOne({
      where: { sellerCode: code, role: 'seller', isActive: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      sellerCode: row.sellerCode!,
      createdAt: row.createdAt,
    };
  }

  async codeExists(code: string): Promise<boolean> {
    const count = await this.profileModel.count({ where: { sellerCode: code } });
    return count > 0;
  }

  // ---------------------------------------------------------------------------
  // Specialist (sold_by) management
  // ---------------------------------------------------------------------------

  /**
   * Listado de vendedores para `/admin/sellers`.
   *
   * Son DOS consultas fijas (no N+1): los vendedores, y de una sola vez los
   * especialistas de todos ellos. El conteo se hace en memoria.
   *
   * A propósito NO se usa `GROUP BY` con `fn('COUNT', col('id'))`: por ese
   * camino Sequelize no mapea el atributo `soldBy` a la columna real `sold_by`
   * y genera `SELECT "soldBy" … GROUP BY "sold_by"`, que Postgres rechaza —
   * fue el 500 del primer intento. El volumen acá es de decenas de filas, así
   * que contar en JS sale gratis y usa solo construcciones ya probadas.
   */
  async listSellers(): Promise<SellerAdminRow[]> {
    const sellers = await this.profileModel.findAll({
      where: { role: 'seller' },
      order: [['createdAt', 'DESC']],
    });
    if (sellers.length === 0) return [];

    const sold = await this.profileModel.findAll({
      where: { soldBy: { [Op.in]: sellers.map((s) => s.id) } },
    });

    const bySeller = new Map<string, number>();
    for (const row of sold) {
      if (!row.soldBy) continue;
      bySeller.set(row.soldBy, (bySeller.get(row.soldBy) ?? 0) + 1);
    }

    return sellers.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      email: s.email,
      sellerCode: s.sellerCode ?? '',
      specialistsCount: bySeller.get(s.id) ?? 0,
      // Legacy rows that predate the column may return null; treat as active.
      isActive: s.isActive ?? true,
      createdAt: s.createdAt,
      lastSignInAt: s.lastSignInAt,
    }));
  }

  async listSoldSpecialists(sellerId: string): Promise<SellerSpecialistRow[]> {
    const rows = await this.profileModel.findAll({
      where: { soldBy: sellerId },
      order: [['createdAt', 'DESC']],
    });

    return rows.map(toSpecialistRow);
  }

  /**
   * Returns all specialists attributed to `sellerId`, enriched with aggregate
   * counts computed in ONE SQL query (no N+1).
   *
   * Consultation origin classification precedence (per consultation):
   *   1. appointment.source = 'booking_public'  → booking
   *   2. appointment.source = 'doctor_panel'    → doctor
   *   3. Otherwise (legacy 'booking', null, etc.) fall back to patients.source:
   *        patients.source = 'booking'           → booking
   *        patients.source = 'manual'            → doctor
   *        anything else / NULL                  → unclassified
   *
   * "Cancelled" means appointment.status IS DISTINCT FROM 'cancelled'.
   * Consultations with no linked appointment always count (appointment_id IS NULL).
   *
   * Raw SQL used instead of ORM:
   *   - Avoids column-mapping bugs with GROUP BY / COUNT (see listSellers comment).
   *   - Correlated subqueries keep the row count at exactly 1 per specialist.
   *   - Uses IN (:ids) syntax (never = ANY(:ids)) per project rules.
   *   - No COALESCE(enum_col, '') — uses IS DISTINCT FROM for enum comparisons.
   */
  async listSoldSpecialistsWithStats(sellerId: string): Promise<SellerSpecialistWithStats[]> {
    type RawRow = {
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
      cedula: string | null;
      seller_notes: string | null;
      is_active: boolean | null;
      specialty: string | null;
      plan: string | null;
      subscription_status: string | null;
      created_at: Date;
      last_sign_in_at: Date | null;
      onboarding_completed: boolean | null;
      onboarding_last_step: string | null;
      onboarding_office_skipped: boolean | null;
      onboarding_service_skipped: boolean | null;
      payment_methods_configured: boolean;
      offices_count: string; // Postgres returns bigint as string
      service_count: string;
      consultations_count: string;
      consultations_by_booking: string;
      consultations_by_doctor: string;
      consultations_unclassified: string;
    };

    const rows = await this.sequelize.query<RawRow>(
      `SELECT
         p.id,
         p.full_name,
         p.email,
         p.phone,
         p.cedula,
         p.seller_notes,
         COALESCE(p.is_active, true)                                       AS is_active,
         p.specialty,
         p.plan,
         p.subscription_status,
         p.created_at,
         p.last_sign_in_at,
         COALESCE(p.onboarding_completed, false)                           AS onboarding_completed,
         p.onboarding_last_step,
         COALESCE(p.onboarding_office_skipped, false)                      AS onboarding_office_skipped,
         COALESCE(p.onboarding_service_skipped, false)                     AS onboarding_service_skipped,
         -- payment_methods is TEXT[]; NULL or empty array → false.
         CASE
           WHEN p.payment_methods IS NOT NULL
            AND array_length(p.payment_methods, 1) > 0
           THEN true
           ELSE false
         END                                                               AS payment_methods_configured,
         -- Active offices
         (SELECT COUNT(*)
            FROM doctor_offices
           WHERE doctor_id = p.id
             AND is_active = true)                                         AS offices_count,
         -- Active services (needed for onboarding-step derivation)
         (SELECT COUNT(*)
            FROM pricing_plans
           WHERE doctor_id = p.id
             AND is_active = true)                                         AS service_count,
         -- Total consultations, excluding those with a cancelled appointment.
         -- Consultations without an appointment (appointment_id IS NULL) always count.
         (SELECT COUNT(*)
            FROM consultations c
           WHERE c.doctor_id = p.id
             AND (
               c.appointment_id IS NULL
               OR EXISTS (
                 SELECT 1 FROM appointments a
                  WHERE a.id = c.appointment_id
                    AND a.status IS DISTINCT FROM 'cancelled'
               )
             ))                                                            AS consultations_count,
         -- Origin: booking (public page).
         -- Trusts appointment.source = 'booking_public' first;
         -- falls back to patients.source = 'booking' when no reliable source.
         -- Legacy appointment.source = 'booking' is NOT trusted (see Task B ADR note).
         (SELECT COUNT(*)
            FROM consultations c
            LEFT JOIN appointments a  ON a.id  = c.appointment_id
            LEFT JOIN patients     pt ON pt.id = c.patient_id
           WHERE c.doctor_id = p.id
             AND (a.id IS NULL OR a.status IS DISTINCT FROM 'cancelled')
             AND (
               a.source = 'booking_public'
               OR (
                 a.source IS DISTINCT FROM 'booking_public'
                 AND a.source IS DISTINCT FROM 'doctor_panel'
                 AND pt.source = 'booking'
               )
             ))                                                            AS consultations_by_booking,
         -- Origin: doctor panel.
         (SELECT COUNT(*)
            FROM consultations c
            LEFT JOIN appointments a  ON a.id  = c.appointment_id
            LEFT JOIN patients     pt ON pt.id = c.patient_id
           WHERE c.doctor_id = p.id
             AND (a.id IS NULL OR a.status IS DISTINCT FROM 'cancelled')
             AND (
               a.source = 'doctor_panel'
               OR (
                 a.source IS DISTINCT FROM 'booking_public'
                 AND a.source IS DISTINCT FROM 'doctor_panel'
                 AND pt.source = 'manual'
               )
             ))                                                            AS consultations_by_doctor,
         -- Origin: unclassified.
         (SELECT COUNT(*)
            FROM consultations c
            LEFT JOIN appointments a  ON a.id  = c.appointment_id
            LEFT JOIN patients     pt ON pt.id = c.patient_id
           WHERE c.doctor_id = p.id
             AND (a.id IS NULL OR a.status IS DISTINCT FROM 'cancelled')
             AND a.source IS DISTINCT FROM 'booking_public'
             AND a.source IS DISTINCT FROM 'doctor_panel'
             AND (
               pt.source IS NULL
               OR (
                 pt.source IS DISTINCT FROM 'booking'
                 AND pt.source IS DISTINCT FROM 'manual'
               )
             ))                                                            AS consultations_unclassified
       FROM profiles p
       WHERE p.sold_by = :sellerId
       ORDER BY p.created_at DESC`,
      {
        replacements: { sellerId },
        type: QueryTypes.SELECT,
      },
    );

    return rows.map((r): SellerSpecialistWithStats => {
      const officesCount = parseInt(r.offices_count, 10);
      const serviceCount = parseInt(r.service_count, 10);

      const onboardingStep = deriveOnboardingStep({
        onboardingLastStep: r.onboarding_last_step,
        onboardingCompleted: r.onboarding_completed ?? false,
        onboardingOfficeSkipped: r.onboarding_office_skipped ?? false,
        onboardingServiceSkipped: r.onboarding_service_skipped ?? false,
        serviceCount,
        officeCount: officesCount,
        cedula: r.cedula,
        specialty: r.specialty,
        lastSignInAt: r.last_sign_in_at,
      });

      return {
        // SellerSpecialistRow fields
        id: r.id,
        fullName: r.full_name,
        email: r.email,
        phone: r.phone,
        cedula: r.cedula,
        sellerNotes: r.seller_notes,
        isActive: r.is_active ?? true,
        specialty: r.specialty,
        plan: r.plan,
        subscriptionStatus: r.subscription_status,
        createdAt: r.created_at,
        lastSignInAt: r.last_sign_in_at,
        onboardingCompleted: r.onboarding_completed ?? false,
        // Enriched stats
        officesCount,
        consultationsCount: parseInt(r.consultations_count, 10),
        onboardingStep,
        paymentMethodsConfigured: r.payment_methods_configured,
        consultationsByBooking: parseInt(r.consultations_by_booking, 10),
        consultationsByDoctor: parseInt(r.consultations_by_doctor, 10),
        consultationsUnclassified: parseInt(r.consultations_unclassified, 10),
      };
    });
  }

  async findSoldSpecialist(
    sellerId: string,
    specialistId: string,
  ): Promise<SellerSpecialistRow | null> {
    const row = await this.profileModel.findOne({
      where: { id: specialistId, soldBy: sellerId },
    });
    if (!row) return null;
    return toSpecialistRow(row);
  }

  async updateSoldSpecialistContact(
    sellerId: string,
    specialistId: string,
    patch: { phone?: string | null; sellerNotes?: string | null },
  ): Promise<SellerSpecialistRow | null> {
    // La lista blanca se arma acá y no se pasa el patch entero al update: si
    // mañana alguien agrega un campo al DTO, no viaja solo hasta `profiles`.
    const campos: Partial<SellerProfileModel> = {};
    if (patch.phone !== undefined) campos.phone = patch.phone;
    if (patch.sellerNotes !== undefined) campos.sellerNotes = patch.sellerNotes;

    if (Object.keys(campos).length === 0) {
      return this.findSoldSpecialist(sellerId, specialistId);
    }

    // El WHERE incluye soldBy: un id de otro vendedor no actualiza nada y cae
    // al null de abajo, indistinguible de "no existe".
    const [affected] = await this.profileModel.update(campos, {
      where: { id: specialistId, soldBy: sellerId },
    });

    if (affected === 0) return null;

    return this.findSoldSpecialist(sellerId, specialistId);
  }

  async createSoldSpecialist(params: CreateSoldSpecialistParams): Promise<SellerSpecialistRow> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + TRIAL_DURATION_DAYS);

    const t = await this.sequelize.transaction();
    try {
      const row = await this.profileModel.create(
        {
          id: params.id,
          fullName: params.fullName,
          email: params.email,
          role: 'doctor',
          isActive: true,
          plan: params.plan,
          subscriptionStatus: 'trialing',
          specialty: params.specialty ?? null,
          // phone y cedula LLEGABAN hasta acá y se descartaban en silencio: el
          // formulario del portal los pide, el DTO los acepta y el use case los
          // pasa, pero este create() no los escribía. El vendedor cargaba el
          // teléfono y la ficha decía "No cargado".
          phone: params.phone ?? null,
          cedula: params.cedula ?? null,
          soldBy: params.soldBy,
          // The seller loaded this specialist by hand from their own portal. It is
          // seller-originated work, so it earns the signup commission — what does
          // NOT earn it is an admin assigning a lead ('admin'). Tagged separately
          // from 'code' so the payout detail can tell the two apart.
          soldBySource: 'seller_manual',
          sellerCode: null,
          // When a seller pre-registers a specialist via the invitation flow,
          // set the wizard position so the specialist skips the profile step.
          // null = standard first-step flow (no invitation).
          onboardingLastStep: params.onboardingLastStep ?? null,
        } as Parameters<typeof SellerProfileModel.create>[0],
        { transaction: t },
      );

      // Create subscription row — mirrors the free_trial flow from createAdminDoctor.
      await this.sequelize.query(
        `INSERT INTO subscriptions
           (id, doctor_id, plan, status, price_usd, billing_cycle,
            current_period_start, current_period_end, trial_ends_at,
            cancelled_at, notes, created_at, updated_at)
         VALUES
           (uuid_generate_v4(), :doctorId, 'free_trial', 'trialing', 0, NULL,
            :now, :periodEnd, :periodEnd,
            NULL, NULL, now(), now())
         ON CONFLICT (doctor_id) DO NOTHING`,
        {
          replacements: { doctorId: params.id, now, periodEnd },
          transaction: t,
        },
      );

      await t.commit();
      return toSpecialistRow(row);
    } catch (err) {
      await t.rollback();
      if (err instanceof UniqueConstraintError) {
        const existing = await this.profileModel.findOne({
          where: { email: { [Op.iLike]: params.email } },
        });
        if (existing) throw new SpecialistEmailConflictError();
      }
      throw err;
    }
  }

  async linkSoldBy(specialistId: string, sellerId: string): Promise<void> {
    // UPDATE ... WHERE sold_by IS NULL: the DB guarantees the one-write rule even
    // under concurrent requests — only one of them can win the conditional update.
    //
    // sold_by_source travels WITH sold_by, in the same statement. This is the code
    // path, so it is always 'code'. Writing sold_by alone would leave the source
    // NULL, and AccrueSignupCommissionUseCase only pays when it reads 'code' —
    // the entry commission would silently never fire for anyone.
    await this.profileModel.update(
      { soldBy: sellerId, soldBySource: 'code' } as Partial<SellerProfileModel>,
      {
        where: { id: specialistId, soldBy: null },
      },
    );
  }

  async findByCedula(cedula: string): Promise<{ id: string } | null> {
    // Raw SQL for a case-insensitive, whitespace-trimmed cédula look-up.
    // UPPER() on both sides handles the common V-/E-/P- prefix variants.
    // Returns at most one row (application-level uniqueness — no DB constraint).
    // SECURITY: never log the cedula input.
    type Row = { id: string };
    const rows = await this.sequelize.query<Row>(
      `SELECT id FROM profiles
       WHERE UPPER(TRIM(cedula)) = UPPER(TRIM(:cedula))
         AND cedula IS NOT NULL
       LIMIT 1`,
      {
        replacements: { cedula },
        type: QueryTypes.SELECT,
      },
    );
    // rows[0]! is safe: length > 0 guard above.
    return rows.length > 0 ? { id: rows[0]!.id } : null;
  }

  // ---------------------------------------------------------------------------
  // Payment details (how Delta pays the seller their commissions)
  // ---------------------------------------------------------------------------

  async getSellerPaymentDetails(sellerId: string): Promise<SellerPaymentDetails | null> {
    const row = await this.profileModel.findOne({
      where: { id: sellerId, role: 'seller' },
      attributes: ['id', 'paymentDetails'],
    });
    if (!row) return null;
    return {
      sellerId: row.id,
      paymentDetails: (row.paymentDetails ?? {}) as Record<string, unknown>,
    };
  }

  async updateSellerPaymentDetails(
    sellerId: string,
    details: Record<string, unknown>,
  ): Promise<SellerPaymentDetails> {
    const row = await this.profileModel.findOne({
      where: { id: sellerId, role: 'seller' },
    });
    if (!row) throw new SellerNotFoundError();

    await row.update({ paymentDetails: details } as Partial<SellerProfileModel>);

    return {
      sellerId: row.id,
      paymentDetails: details,
    };
  }

  // ---------------------------------------------------------------------------
  // Specialist seller assignment (admin assign-seller flow)
  // ---------------------------------------------------------------------------

  async getSpecialistSellerAssignment(
    specialistId: string,
  ): Promise<SpecialistSellerAssignment | null> {
    const specialist = await this.profileModel.findOne({
      where: { id: specialistId },
      attributes: ['id', 'soldBy', 'soldBySource'],
    });
    if (!specialist) return null;

    if (!specialist.soldBy) {
      return {
        specialistId,
        sellerId: null,
        sellerName: null,
        soldBySource: null,
      };
    }

    // Fetch the seller's display name — two targeted point-reads, no JOIN needed
    // at this volume. SECURITY: sellerName is PII — never log.
    const seller = await this.profileModel.findOne({
      where: { id: specialist.soldBy, role: 'seller' },
      attributes: ['id', 'fullName'],
    });

    return {
      specialistId,
      sellerId: specialist.soldBy,
      sellerName: seller?.fullName ?? null,
      soldBySource: specialist.soldBySource,
    };
  }

  // ---------------------------------------------------------------------------
  // Self-deactivation
  // ---------------------------------------------------------------------------

  /**
   * Immediately deactivates the seller's own account.
   *
   * Uses `as Record<string, unknown>` to write the three deactivation columns
   * (deactivated_at, deactivated_by, deactivation_reason) that live on the
   * `profiles` table but are NOT declared on SellerProfileModel (to keep the
   * model focused on the columns needed by seller use cases).
   */
  async deactivateOwnAccount(sellerId: string, reason: string | null): Promise<void> {
    await this.profileModel.update(
      {
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedBy: 'self',
        deactivationReason: reason,
      } as Record<string, unknown>,
      { where: { id: sellerId, role: 'seller' } },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSpecialistRow(row: SellerProfileModel): SellerSpecialistRow {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone ?? null,
    cedula: row.cedula ?? null,
    sellerNotes: row.sellerNotes ?? null,
    isActive: row.isActive ?? true,
    specialty: row.specialty ?? null,
    plan: row.plan ?? null,
    subscriptionStatus: row.subscriptionStatus ?? null,
    createdAt: row.createdAt,
    lastSignInAt: row.lastSignInAt ?? null,
    // Legacy rows that predate the column may return null; treat as false.
    onboardingCompleted: row.onboardingCompleted ?? false,
  };
}
