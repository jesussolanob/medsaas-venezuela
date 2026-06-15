import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, UniqueConstraintError } from 'sequelize';
import { Identity } from '../../../domain/entities/identity.entity';
import type {
  IIdentityRepository,
  IdentityCreateData,
} from '../../../domain/repositories/identity.repository';
import { AuthProfileModel } from '../models/auth-profile.model';

/**
 * Sequelize implementation of IIdentityRepository.
 *
 * Email lookups are case-insensitive via ILIKE (Postgres).
 * The email column already has a unique index (idx_profiles_email) from
 * the initial schema migration — no duplicate insert risk.
 */
@Injectable()
export class SequelizeIdentityRepository implements IIdentityRepository {
  constructor(
    @InjectModel(AuthProfileModel)
    private readonly model: typeof AuthProfileModel,
  ) {}

  async findByEmail(email: string): Promise<Identity | null> {
    const row = await this.model.findOne({
      where: {
        email: { [Op.iLike]: email },
      },
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async create(data: IdentityCreateData): Promise<Identity> {
    try {
      const row = await this.model.create({
        id: data.id,
        fullName: data.fullName,
        email: data.email,
        role: data.role,
        auth0Sub: data.auth0Sub,
        isActive: true,
      });
      return this.toDomain(row);
    } catch (err) {
      // Race condition on concurrent first-login: two requests both passed findByEmail
      // and now clash against the UNIQUE index on `email`. The winner already wrote the
      // row — read it back and return it instead of propagating a 500.
      if (err instanceof UniqueConstraintError) {
        const existing = await this.model.findOne({
          where: { email: { [Op.iLike]: data.email } },
        });
        if (existing) {
          return this.toDomain(existing);
        }
      }
      throw err;
    }
  }

  async updateAuth0Sub(id: string, auth0Sub: string): Promise<void> {
    await this.model.update({ auth0Sub }, { where: { id } });
  }

  private toDomain(row: AuthProfileModel): Identity {
    return Identity.create({
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      role: row.role,
      auth0Sub: row.auth0Sub ?? null,
      createdAt: row.createdAt,
    });
  }
}
