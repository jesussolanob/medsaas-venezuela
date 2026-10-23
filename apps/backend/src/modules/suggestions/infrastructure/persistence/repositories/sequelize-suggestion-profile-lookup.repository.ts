import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ProfileAdminModel } from '../../../../admin/infrastructure/database/models/profile.model';
import type {
  ISuggestionProfileLookupRepository,
  SuggestionDoctorProfile,
} from '../../../domain/repositories/suggestion-profile-lookup.repository';

/**
 * Sequelize implementation of ISuggestionProfileLookupRepository.
 *
 * Re-uses ProfileAdminModel (registered in SuggestionsModule via
 * SequelizeModule.forFeature) to query only the columns needed for the
 * admin suggestions listing. No extra table registration needed —
 * the profile table is already globally accessible.
 */
@Injectable()
export class SequelizeSuggestionProfileLookupRepository implements ISuggestionProfileLookupRepository {
  constructor(
    @InjectModel(ProfileAdminModel)
    private readonly model: typeof ProfileAdminModel,
  ) {}

  async findByIds(userIds: string[]): Promise<SuggestionDoctorProfile[]> {
    if (userIds.length === 0) return [];
    const rows = await this.model.findAll({
      where: { id: userIds },
      attributes: ['id', 'fullName', 'email', 'specialty'],
    });
    return rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      specialty: row.specialty ?? null,
    }));
  }
}
