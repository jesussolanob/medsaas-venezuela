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
    });
  }
}
