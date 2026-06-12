import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CredentialVerifierModel } from '../models/credential-verifier.model';
import type { ICredentialVerifierRepository } from '../../../domain/repositories/credential-verifier.repository';
import {
  CredentialVerifier,
  type VerifierMethod,
  type VerifierRequiredInput,
  type VerifierStatus,
} from '../../../domain/entities/credential-verifier.entity';

@Injectable()
export class SequelizeCredentialVerifierRepository implements ICredentialVerifierRepository {
  constructor(
    @InjectModel(CredentialVerifierModel)
    private readonly model: typeof CredentialVerifierModel,
  ) {}

  async findActiveByCredentialType(credentialType: string): Promise<CredentialVerifier | null> {
    const row = await this.model.findOne({
      where: { credentialType, status: 'active' },
      order: [['createdAt', 'ASC']],
    });

    return row ? this.toDomain(row) : null;
  }

  async findAll(): Promise<CredentialVerifier[]> {
    const rows = await this.model.findAll({ order: [['credentialType', 'ASC']] });
    return rows.map((r) => this.toDomain(r));
  }

  // ---------------------------------------------------------------------------
  // Mapper
  // ---------------------------------------------------------------------------

  private toDomain(row: CredentialVerifierModel): CredentialVerifier {
    return CredentialVerifier.create({
      id: row.id,
      credentialType: row.credentialType,
      professionCode: row.professionCode,
      jurisdiction: row.jurisdiction,
      portalName: row.portalName,
      portalUrl: row.portalUrl,
      method: row.method as VerifierMethod,
      requestTemplate: row.requestTemplate,
      requiredInput: (row.requiredInput ?? null) as VerifierRequiredInput | null,
      responseParser: row.responseParser,
      hasCaptcha: row.hasCaptcha,
      tlsInsecure: row.tlsInsecure,
      status: row.status as VerifierStatus,
      lastCheckedAt: row.lastCheckedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
