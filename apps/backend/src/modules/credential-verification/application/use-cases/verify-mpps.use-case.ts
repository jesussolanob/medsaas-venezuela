import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DOCTOR_PROFILE_FOR_VERIFICATION_REPOSITORY,
  type IDoctorProfileForVerificationRepository,
} from '../../domain/repositories/doctor-profile.repository';
import {
  CREDENTIAL_VERIFIER_REPOSITORY,
  type ICredentialVerifierRepository,
} from '../../domain/repositories/credential-verifier.repository';
import {
  CREDENTIAL_VERIFICATION_REPOSITORY,
  type ICredentialVerificationRepository,
} from '../../domain/repositories/credential-verification.repository';
import {
  MPPS_VERIFICATION_PORT,
  type IMppsVerificationPort,
} from '../../domain/ports/mpps-verification.port';
import {
  DoctorProfileNotFoundError,
  NoActiveVerifierError,
} from '../../domain/errors/credential-verification.errors';
import { namesMatch, isMedicalProfession } from '../name-matcher';
import type { VerificationEvidence } from '../../domain/entities/credential-verification.entity';

const CREDENTIAL_TYPE = 'mpps';

export interface VerifyMppsOutput {
  doctorId: string;
  credentialType: string;
  status: string;
  attempts: number;
  checkedAt: Date | null;
}

/**
 * VerifyMppsUseCase
 *
 * Orchestrates MPPS credential verification for a doctor:
 *
 *   1. Loads doctor profile (cedula, mppsNumber, fullName).
 *   2. If cedula is missing → skips, records status='pending'.
 *   3. Resolves the active SACS verifier for credential_type='mpps'.
 *   4. If already 'verified' and not forced → returns cached result.
 *   5. Queries the SACS portal by cedula.
 *   6. Applies matching logic:
 *        not found        → 'not_found'
 *        name mismatch    → 'mismatch'
 *        mpps not in list → 'mismatch'
 *        all match        → 'verified'
 *   7. Upserts the result in credential_verifications (increments attempts).
 *
 * SECURITY:
 *   - Never log cedula, fullName, mppsNumber, or matched_name from this class.
 *   - Only log structural info: doctorId, status, attempts.
 */
@Injectable()
export class VerifyMppsUseCase {
  private readonly logger = new Logger(VerifyMppsUseCase.name);

  constructor(
    @Inject(DOCTOR_PROFILE_FOR_VERIFICATION_REPOSITORY)
    private readonly profileRepo: IDoctorProfileForVerificationRepository,

    @Inject(CREDENTIAL_VERIFIER_REPOSITORY)
    private readonly verifierRepo: ICredentialVerifierRepository,

    @Inject(CREDENTIAL_VERIFICATION_REPOSITORY)
    private readonly verificationRepo: ICredentialVerificationRepository,

    @Inject(MPPS_VERIFICATION_PORT)
    private readonly mppsPort: IMppsVerificationPort,
  ) {}

  async execute(
    doctorId: string,
    { force = false }: { force?: boolean } = {},
  ): Promise<VerifyMppsOutput> {
    // 1. Load doctor profile
    const profile = await this.profileRepo.findById(doctorId);
    if (!profile) {
      throw new DoctorProfileNotFoundError(doctorId);
    }

    // 2. If cedula is missing, record pending and return early
    if (!profile.cedula) {
      this.logger.log(`[verify-mpps] doctorId=${doctorId} cedula missing — skip`);
      const pending = await this.verificationRepo.upsert({
        doctorId,
        credentialType: CREDENTIAL_TYPE,
        declaredValue: profile.mppsNumber ?? null,
        verifierId: null,
        status: 'pending',
        evidence: null,
        checkedAt: null,
        lastError: 'cedula not provided',
      });
      return this.toOutput(doctorId, pending.status, pending.attempts, pending.checkedAt);
    }

    // 3. Resolve active verifier
    const verifier = await this.verifierRepo.findActiveByCredentialType(CREDENTIAL_TYPE);
    if (!verifier) {
      throw new NoActiveVerifierError(CREDENTIAL_TYPE);
    }

    // 4. Check cached verified result (unless forced)
    if (!force) {
      const existing = await this.verificationRepo.findByDoctorAndType(doctorId, CREDENTIAL_TYPE);
      if (existing?.isVerified()) {
        this.logger.log(`[verify-mpps] doctorId=${doctorId} already verified — returning cached`);
        return this.toOutput(doctorId, existing.status, existing.attempts, existing.checkedAt);
      }
    }

    // 5. Query SACS portal
    const checkedAt = new Date();
    let sacsResult: Awaited<ReturnType<IMppsVerificationPort['queryByCedula']>>;
    try {
      sacsResult = await this.mppsPort.queryByCedula(profile.cedula);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(`[verify-mpps] doctorId=${doctorId} portal error`);
      const saved = await this.verificationRepo.upsert({
        doctorId,
        credentialType: CREDENTIAL_TYPE,
        declaredValue: profile.mppsNumber ?? null,
        verifierId: verifier.id,
        status: 'error',
        evidence: null,
        checkedAt,
        lastError: errMsg,
      });
      return this.toOutput(doctorId, saved.status, saved.attempts, saved.checkedAt);
    }

    // 6. Apply matching logic
    if (!sacsResult.found) {
      this.logger.log(`[verify-mpps] doctorId=${doctorId} not_found in SACS`);
      const saved = await this.verificationRepo.upsert({
        doctorId,
        credentialType: CREDENTIAL_TYPE,
        declaredValue: profile.mppsNumber ?? null,
        verifierId: verifier.id,
        status: 'not_found',
        evidence: null,
        checkedAt,
        lastError: null,
      });
      return this.toOutput(doctorId, saved.status, saved.attempts, saved.checkedAt);
    }

    // 6a. Name matching
    const registryName = sacsResult.name ?? '';
    const doctorName = profile.fullName ?? '';
    if (!namesMatch(doctorName, registryName)) {
      this.logger.log(`[verify-mpps] doctorId=${doctorId} name mismatch`);
      const saved = await this.verificationRepo.upsert({
        doctorId,
        credentialType: CREDENTIAL_TYPE,
        declaredValue: profile.mppsNumber ?? null,
        verifierId: verifier.id,
        status: 'mismatch',
        evidence: null,
        checkedAt,
        lastError: 'name mismatch',
      });
      return this.toOutput(doctorId, saved.status, saved.attempts, saved.checkedAt);
    }

    // 6b. MPPS number matching + profession check
    const declaredMpps = (profile.mppsNumber ?? '').toUpperCase();
    const professions = sacsResult.professions ?? [];
    const matchedProfession = professions.find(
      (p) => p.licencia.toUpperCase() === declaredMpps && isMedicalProfession(p.profesion),
    );

    if (!matchedProfession) {
      this.logger.log(`[verify-mpps] doctorId=${doctorId} mpps not in medical professions`);
      const saved = await this.verificationRepo.upsert({
        doctorId,
        credentialType: CREDENTIAL_TYPE,
        declaredValue: profile.mppsNumber ?? null,
        verifierId: verifier.id,
        status: 'mismatch',
        evidence: null,
        checkedAt,
        lastError: 'declared mpps not found in medical professions list',
      });
      return this.toOutput(doctorId, saved.status, saved.attempts, saved.checkedAt);
    }

    // 7. All checks passed → verified
    const evidence: VerificationEvidence = {
      fechaRegistro: matchedProfession.fechaRegistro,
      tomoRegistro: matchedProfession.tomoRegistro,
      folioRegistro: matchedProfession.folioRegistro,
      profesion: matchedProfession.profesion,
      // NOTE: matchedName is stored in evidence for audit trail only.
      // It must never be logged by application code.
      matchedName: registryName,
    };

    const saved = await this.verificationRepo.upsert({
      doctorId,
      credentialType: CREDENTIAL_TYPE,
      declaredValue: profile.mppsNumber ?? null,
      verifierId: verifier.id,
      status: 'verified',
      evidence,
      checkedAt,
      lastError: null,
    });

    this.logger.log(
      `[verify-mpps] doctorId=${doctorId} status=verified attempts=${saved.attempts}`,
    );
    return this.toOutput(doctorId, saved.status, saved.attempts, saved.checkedAt);
  }

  private toOutput(
    doctorId: string,
    status: string,
    attempts: number,
    checkedAt: Date | null,
  ): VerifyMppsOutput {
    return { doctorId, credentialType: CREDENTIAL_TYPE, status, attempts, checkedAt };
  }
}
