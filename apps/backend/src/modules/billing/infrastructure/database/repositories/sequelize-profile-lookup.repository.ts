import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type {
  IProfileLookupRepository,
  DoctorProfileSnapshot,
} from '../../../domain/repositories/profile-lookup.repository';
import { ProfileAdminModel } from '../../../../admin/infrastructure/database/models/profile.model';

/**
 * Sequelize implementation of IProfileLookupRepository for the billing module.
 *
 * Queries only the columns required for invoice email delivery.
 * The ProfileAdminModel is already registered in BillingModule via
 * SequelizeModule.forFeature — no additional model registration needed.
 */
@Injectable()
export class SequelizeProfileLookupRepository implements IProfileLookupRepository {
  constructor(
    @InjectModel(ProfileAdminModel)
    private readonly model: typeof ProfileAdminModel,
  ) {}

  async findById(userId: string): Promise<DoctorProfileSnapshot | null> {
    const row = await this.model.findByPk(userId, {
      attributes: ['id', 'fullName', 'email'],
    });
    if (!row) return null;
    return {
      id: row.id,
      fullName: row.fullName,
      email: row.email,
    };
  }
}
