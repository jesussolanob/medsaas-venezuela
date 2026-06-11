import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { randomUUID } from 'crypto';
import { GoogleIntegrationModel } from '../models/google-integration.model';
import { GoogleIntegration } from '../../../domain/entities/google-integration.entity';
import type {
  IGoogleIntegrationRepository,
  UpsertGoogleIntegrationParams,
  UpdateTokensParams,
} from '../../../domain/repositories/google-integration.repository';
import { CryptoService } from '../../../../../infrastructure/crypto/crypto.service';

/**
 * SequelizeGoogleIntegrationRepository
 *
 * Encrypts tokens on write, decrypts on read using CryptoService.
 * NEVER logs access_token, refresh_token, or google_email.
 */
@Injectable()
export class SequelizeGoogleIntegrationRepository implements IGoogleIntegrationRepository {
  constructor(
    @InjectModel(GoogleIntegrationModel)
    private readonly model: typeof GoogleIntegrationModel,
    private readonly crypto: CryptoService,
  ) {}

  async findByDoctorId(doctorId: string): Promise<GoogleIntegration | null> {
    const row = await this.model.findOne({ where: { doctorId } });
    if (!row) return null;
    return this.toDomain(row);
  }

  async upsert(params: UpsertGoogleIntegrationParams): Promise<GoogleIntegration> {
    const accessTokenEncrypted = this.crypto.encrypt(params.accessToken);
    const refreshTokenEncrypted = this.crypto.encrypt(params.refreshToken);
    const now = new Date();

    // Resolve existing row by doctorId to avoid UNIQUE(doctor_id) violation.
    // model.upsert with a freshly generated id would always conflict on the
    // doctor_id unique constraint instead of matching the existing row.
    const existing = await this.model.findOne({ where: { doctorId: params.doctorId } });

    if (existing) {
      await existing.update({
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenExpiry: params.tokenExpiry,
        scope: params.scope,
        googleEmail: params.googleEmail,
        updatedAt: now,
      });
      return this.toDomain(existing);
    }

    const created = await this.model.create({
      id: randomUUID(),
      doctorId: params.doctorId,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenExpiry: params.tokenExpiry,
      scope: params.scope,
      googleEmail: params.googleEmail,
      connectedAt: now,
      updatedAt: now,
    });

    return this.toDomain(created);
  }

  async updateTokens(params: UpdateTokensParams): Promise<void> {
    const accessTokenEncrypted = this.crypto.encrypt(params.accessToken);
    const refreshTokenEncrypted = this.crypto.encrypt(params.refreshToken);

    await this.model.update(
      {
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenExpiry: params.tokenExpiry,
        updatedAt: new Date(),
      },
      { where: { doctorId: params.doctorId } },
    );
  }

  async deleteByDoctorId(doctorId: string): Promise<void> {
    await this.model.destroy({ where: { doctorId } });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: GoogleIntegrationModel): GoogleIntegration {
    return GoogleIntegration.create({
      id: row.id,
      doctorId: row.doctorId,
      accessToken: this.crypto.decrypt(row.accessTokenEncrypted),
      refreshToken: this.crypto.decrypt(row.refreshTokenEncrypted),
      tokenExpiry: row.tokenExpiry,
      scope: row.scope,
      googleEmail: row.googleEmail,
      connectedAt: row.connectedAt,
      updatedAt: row.updatedAt,
    });
  }
}
