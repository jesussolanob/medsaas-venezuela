import { Inject, Injectable } from '@nestjs/common';
import {
  CREDENTIAL_VERIFICATION_REPOSITORY,
  type ICredentialVerificationRepository,
} from '../../domain/repositories/credential-verification.repository';
import type { CredentialVerification } from '../../domain/entities/credential-verification.entity';

export interface CredentialVerificationOutput {
  id: string;
  doctorId: string;
  credentialType: string;
  declaredValue: string | null;
  verifierId: string | null;
  status: string;
  evidence: Record<string, unknown> | null;
  checkedAt: Date | null;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * GetCredentialVerificationsUseCase
 *
 * Returns all credential verification records for a specific doctor.
 * Used by the admin panel to inspect verification state.
 *
 * SECURITY: Response includes evidence which may contain matched_name.
 * The caller (admin controller) is responsible for restricting access
 * to super_admin role only.
 */
@Injectable()
export class GetCredentialVerificationsUseCase {
  constructor(
    @Inject(CREDENTIAL_VERIFICATION_REPOSITORY)
    private readonly verificationRepo: ICredentialVerificationRepository,
  ) {}

  async execute(doctorId: string): Promise<CredentialVerificationOutput[]> {
    const records = await this.verificationRepo.findAllByDoctor(doctorId);
    return records.map(this.toOutput);
  }

  private toOutput(v: CredentialVerification): CredentialVerificationOutput {
    return {
      id: v.id,
      doctorId: v.doctorId,
      credentialType: v.credentialType,
      declaredValue: v.declaredValue,
      verifierId: v.verifierId,
      status: v.status,
      evidence: v.evidence as Record<string, unknown> | null,
      checkedAt: v.checkedAt,
      attempts: v.attempts,
      lastError: v.lastError,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    };
  }
}
