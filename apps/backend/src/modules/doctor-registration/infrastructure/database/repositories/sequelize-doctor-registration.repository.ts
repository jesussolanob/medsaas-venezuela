import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  DoctorRegistration,
  type VerificationStatus,
} from '../../../domain/entities/doctor-registration.entity';
import type {
  IDoctorRegistrationRepository,
  RegistrationUpdateParams,
  VerificationUpdateParams,
  SuperAdminRow,
  TermsAcceptanceParams,
} from '../../../domain/repositories/doctor-registration.repository';
import { DoctorRegistrationNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import { RegistrationProfileModel } from '../models/registration-profile.model';

@Injectable()
export class SequelizeDoctorRegistrationRepository implements IDoctorRegistrationRepository {
  constructor(
    @InjectModel(RegistrationProfileModel)
    private readonly model: typeof RegistrationProfileModel,
  ) {}

  async findById(doctorId: string): Promise<DoctorRegistration | null> {
    const row = await this.model.findByPk(doctorId);
    if (!row) return null;
    return this.toDomain(row);
  }

  async updateRegistration(
    doctorId: string,
    params: RegistrationUpdateParams,
  ): Promise<DoctorRegistration> {
    const row = await this.model.findByPk(doctorId);
    if (!row) throw new DoctorRegistrationNotFoundError(doctorId);

    await row.update({
      fullName: params.fullName,
      cedula: params.cedula,
      mppsNumber: params.mppsNumber,
      colegiadoNumber: params.colegiadoNumber,
      specialty: params.specialty,
      ...(params.gender != null && { gender: params.gender }),
      verificationStatus: 'pending',
      verifiedAt: null,
      verifiedBy: null,
      // Mark onboarding complete — explicit flag replaces fragile specialty heuristic.
      onboardingCompleted: true,
    });

    return this.toDomain(row);
  }

  async updateVerification(
    doctorId: string,
    params: VerificationUpdateParams,
  ): Promise<DoctorRegistration> {
    const row = await this.model.findByPk(doctorId);
    if (!row) throw new DoctorRegistrationNotFoundError(doctorId);

    await row.update({
      verificationStatus: params.status,
      verifiedAt: params.verifiedAt,
      verifiedBy: params.verifiedBy,
    });

    return this.toDomain(row);
  }

  async listByVerificationStatus(
    status: VerificationStatus,
    pagination: { limit: number; offset: number },
  ): Promise<DoctorRegistration[]> {
    const rows = await this.model.findAll({
      where: {
        role: 'doctor',
        verificationStatus: status,
      },
      order: [['createdAt', 'ASC']],
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return rows.map((r) => this.toDomain(r));
  }

  async findAllSuperAdmins(): Promise<SuperAdminRow[]> {
    const rows = await this.model.findAll({
      where: { role: 'super_admin' },
      attributes: ['id', 'email', 'fullName'],
    });

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      fullName: r.fullName,
    }));
  }

  async acceptTerms(doctorId: string, params: TermsAcceptanceParams): Promise<void> {
    const row = await this.model.findByPk(doctorId);
    if (!row) {
      // Best-effort: silently no-op when the profile does not exist.
      return;
    }

    await row.update({
      termsAcceptedAt: params.acceptedAt,
      termsAcceptedVersion: params.version,
    });
  }

  private toDomain(row: RegistrationProfileModel): DoctorRegistration {
    return DoctorRegistration.create({
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      cedula: row.cedula,
      mppsNumber: row.mppsNumber,
      colegiadoNumber: row.colegiadoNumber,
      specialty: row.specialty,
      verificationStatus: (row.verificationStatus as VerificationStatus) ?? 'pending',
      verifiedAt: row.verifiedAt,
      verifiedBy: row.verifiedBy,
      createdAt: row.createdAt,
      // NULL from DB means active — treat as true (fail-open, matches AppAuthGuard behaviour).
      isActive: row.isActive !== false,
      deactivatedBy: row.deactivatedBy ?? null,
    });
  }
}
