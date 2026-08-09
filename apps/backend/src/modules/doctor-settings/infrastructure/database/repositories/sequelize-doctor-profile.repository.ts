import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  DoctorProfile,
  type DoctorProfileUpdateParams,
} from '../../../domain/entities/doctor-profile.entity';
import type {
  IDoctorProfileRepository,
  ExchangeRateUpdateParams,
} from '../../../domain/repositories/doctor-profile.repository';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';
import { DoctorProfileModel } from '../models/doctor-profile.model';

@Injectable()
export class SequelizeDoctorProfileRepository implements IDoctorProfileRepository {
  constructor(
    @InjectModel(DoctorProfileModel)
    private readonly model: typeof DoctorProfileModel,
  ) {}

  async findByDoctorId(doctorId: string): Promise<DoctorProfile | null> {
    const row = await this.model.findByPk(doctorId);
    if (!row) return null;
    return this.toDomain(row);
  }

  async update(doctorId: string, params: DoctorProfileUpdateParams): Promise<DoctorProfile> {
    const row = await this.model.findByPk(doctorId);
    if (!row) throw new DoctorProfileNotFoundError(doctorId);

    await row.update({
      ...(params.fullName !== undefined && { fullName: params.fullName }),
      ...(params.specialty !== undefined && { specialty: params.specialty }),
      ...(params.professionalTitle !== undefined && {
        professionalTitle: params.professionalTitle,
      }),
      ...(params.paymentMethods !== undefined && { paymentMethods: params.paymentMethods }),
      ...(params.paymentDetails !== undefined && { paymentDetails: params.paymentDetails }),
      ...(params.allowsOnline !== undefined && { allowsOnline: params.allowsOnline }),
      ...(params.officeAddress !== undefined && { officeAddress: params.officeAddress }),
      ...(params.city !== undefined && { city: params.city }),
      ...(params.avatarUrl !== undefined && { avatarUrl: params.avatarUrl }),
      ...(params.logoUrl !== undefined && { logoUrl: params.logoUrl }),
      ...(params.signatureUrl !== undefined && { signatureUrl: params.signatureUrl }),
      ...(params.licenseNumber !== undefined && { licenseNumber: params.licenseNumber }),
      ...(params.phone !== undefined && { phone: params.phone }),
      ...(params.birthDate !== undefined && { birthDate: params.birthDate }),
      ...(params.gender !== undefined && { gender: params.gender }),
      ...(params.welcomeDismissedAt !== undefined && {
        welcomeDismissedAt: params.welcomeDismissedAt,
      }),
    });

    return this.toDomain(row);
  }

  async updateExchangeRate(
    doctorId: string,
    params: ExchangeRateUpdateParams,
  ): Promise<DoctorProfile> {
    const row = await this.model.findByPk(doctorId);
    if (!row) throw new DoctorProfileNotFoundError(doctorId);

    await row.update({
      currencyMode: params.currencyMode,
      customRate: params.customRate,
      customRateLabel: params.customRateLabel,
    });

    return this.toDomain(row);
  }

  private toDomain(row: DoctorProfileModel): DoctorProfile {
    // Sequelize maps DATEONLY → string 'YYYY-MM-DD'; normalise to string | null.
    const birthDate: string | null =
      row.birthDate != null ? String(row.birthDate).slice(0, 10) : null;

    return DoctorProfile.create({
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      specialty: row.specialty,
      professionalTitle: row.professionalTitle,
      clinicId: row.clinicId,
      clinicRole: row.clinicRole,
      paymentMethods: row.paymentMethods ?? [],
      paymentDetails: (row.paymentDetails ?? {}) as Record<string, unknown>,
      allowsOnline: row.allowsOnline ?? false,
      officeAddress: row.officeAddress,
      city: row.city,
      avatarUrl: row.avatarUrl,
      plan: row.plan,
      subscriptionStatus: row.subscriptionStatus,
      logoUrl: row.logoUrl,
      signatureUrl: row.signatureUrl,
      licenseNumber: row.licenseNumber,
      phone: row.phone,
      currencyMode: row.currencyMode,
      customRate: row.customRate != null ? Number(row.customRate) : null,
      customRateLabel: row.customRateLabel,
      cedula: row.cedula,
      birthDate,
      gender: row.gender ?? null,
      welcomeDismissedAt:
        row.welcomeDismissedAt != null ? new Date(row.welcomeDismissedAt).toISOString() : null,
      onboardingCompleted: row.onboardingCompleted ?? false,
      consultationBlocksLayout: row.consultationBlocksLayout === 'vertical' ? 'vertical' : 'tabs',
      onboardingCompletedAt: row.onboardingCompletedAt ?? null,
      // hasActiveOffice / hasActiveService are enrichment fields — not persisted on profiles.
      // They default to false here; GetDoctorProfileUseCase overrides them with live counts.
      hasActiveOffice: false,
      hasActiveService: false,
    });
  }

  /**
   * Marks onboarding as completed for the given doctor.
   *
   * BOTH columns must be written. `onboarding_completed` is the flag the
   * frontend gate actually reads; `onboarding_completed_at` is only the audit
   * timestamp. Writing the timestamp alone left the flag false forever, so the
   * gate bounced the doctor back through onboarding on every page load and
   * dropped them on /doctor, losing the route they asked for.
   *
   * Idempotent: re-running just refreshes the timestamp.
   */
  async markOnboardingCompleted(doctorId: string): Promise<void> {
    await this.model.update(
      { onboardingCompleted: true, onboardingCompletedAt: new Date() } as Record<string, unknown>,
      { where: { id: doctorId } },
    );
  }

  /**
   * Updates the consultation_blocks_layout column for the given doctor.
   */
  async updateBlocksLayout(doctorId: string, layout: 'tabs' | 'vertical'): Promise<void> {
    await this.model.update({ consultationBlocksLayout: layout } as Record<string, unknown>, {
      where: { id: doctorId },
    });
  }

  /**
   * Counts future appointments that still expect the doctor to show up.
   *
   * Raw SQL on purpose: reaching for AppointmentModel here would mean importing
   * the appointments module into doctor-settings, and a DI cycle through that
   * graph already took the backend down once in Cloud Run (mocked TestingModules
   * do not catch it). A single scalar count needs no model registration.
   *
   * 'pending' and 'accepted' are legacy statuses still present in the SQL enum;
   * they are included because a row in either state is also a patient waiting.
   */
  async countUpcomingAppointments(doctorId: string): Promise<number> {
    const sequelize = this.model.sequelize;
    if (!sequelize) throw new Error('Sequelize instance is not available');

    const rows = (await sequelize.query(
      `SELECT COUNT(*)::int AS count
         FROM appointments
        WHERE doctor_id = :doctorId
          AND scheduled_at > NOW()
          AND status IN ('scheduled', 'confirmed', 'pending', 'accepted')`,
      {
        replacements: { doctorId },
        type: 'SELECT',
      },
    )) as unknown as Array<{ count: number }>;

    return rows[0]?.count ?? 0;
  }

  /**
   * Switches the account off at the owner's request.
   *
   * is_active carries the enforcement (AppAuthGuard and the public booking flow
   * already honour it); the three deactivation columns carry the provenance so
   * the portal shows "you deactivated your account" instead of "you were
   * blocked", and the admin knows what they are reactivating.
   */
  async deactivateOwnAccount(doctorId: string, reason: string | null): Promise<void> {
    await this.model.update(
      {
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedBy: 'self',
        deactivationReason: reason,
      } as Record<string, unknown>,
      { where: { id: doctorId } },
    );
  }
}
