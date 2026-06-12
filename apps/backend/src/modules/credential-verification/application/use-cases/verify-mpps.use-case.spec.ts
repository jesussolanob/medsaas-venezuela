import { VerifyMppsUseCase } from './verify-mpps.use-case';
import type { IDoctorProfileForVerificationRepository } from '../../domain/repositories/doctor-profile.repository';
import type { ICredentialVerifierRepository } from '../../domain/repositories/credential-verifier.repository';
import type { ICredentialVerificationRepository } from '../../domain/repositories/credential-verification.repository';
import type { IMppsVerificationPort } from '../../domain/ports/mpps-verification.port';
import { CredentialVerifier } from '../../domain/entities/credential-verifier.entity';
import { CredentialVerification } from '../../domain/entities/credential-verification.entity';
import {
  DoctorProfileNotFoundError,
  NoActiveVerifierError,
} from '../../domain/errors/credential-verification.errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOCTOR_ID = 'aaaa1111-aaaa-1111-aaaa-111111111111';
const VERIFIER_ID = 'bbbb2222-bbbb-2222-bbbb-222222222222';

const makeVerifier = () =>
  CredentialVerifier.create({
    id: VERIFIER_ID,
    credentialType: 'mpps',
    professionCode: null,
    jurisdiction: 'nacional',
    portalName: 'SACS',
    portalUrl: 'https://sistemas.sacs.gob.ve/consultas/prfsnal_salud',
    method: 'xajax-post',
    requestTemplate: null,
    requiredInput: 'cedula',
    responseParser: 'sacs-xajax',
    hasCaptcha: false,
    tlsInsecure: true,
    status: 'active',
    lastCheckedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const makeVerification = (status: string) =>
  CredentialVerification.create({
    id: 'cccc3333-cccc-3333-cccc-333333333333',
    doctorId: DOCTOR_ID,
    credentialType: 'mpps',
    declaredValue: 'MPPS-12345',
    verifierId: VERIFIER_ID,
    status: status as never,
    evidence: null,
    checkedAt: new Date(),
    attempts: 1,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

function buildUseCase({
  profile = {
    id: DOCTOR_ID,
    cedula: '12345678',
    mppsNumber: 'MPPS-12345',
    fullName: 'JOSE GARCIA',
  } as Parameters<IDoctorProfileForVerificationRepository['findById']> extends [string]
    ? Awaited<ReturnType<IDoctorProfileForVerificationRepository['findById']>>
    : never,
  verifier = makeVerifier() as Awaited<
    ReturnType<ICredentialVerifierRepository['findActiveByCredentialType']>
  >,
  existingVerification = null as Awaited<
    ReturnType<ICredentialVerificationRepository['findByDoctorAndType']>
  >,
  portalResult = {
    found: true,
    name: 'JOSE GARCIA',
    professions: [
      {
        licencia: 'MPPS-12345',
        profesion: 'MÉDICO CIRUJANO',
        fechaRegistro: '2010-01-01',
        tomoRegistro: 'T1',
        folioRegistro: 'F1',
      },
    ],
  } as Awaited<ReturnType<IMppsVerificationPort['queryByCedula']>>,
  upsertResult = makeVerification('pending'),
}: {
  profile?: Awaited<ReturnType<IDoctorProfileForVerificationRepository['findById']>>;
  verifier?: Awaited<ReturnType<ICredentialVerifierRepository['findActiveByCredentialType']>>;
  existingVerification?: Awaited<
    ReturnType<ICredentialVerificationRepository['findByDoctorAndType']>
  >;
  portalResult?: Awaited<ReturnType<IMppsVerificationPort['queryByCedula']>>;
  upsertResult?: CredentialVerification;
} = {}) {
  const profileRepo: jest.Mocked<IDoctorProfileForVerificationRepository> = {
    findById: jest.fn().mockResolvedValue(profile),
  };

  const verifierRepo: jest.Mocked<ICredentialVerifierRepository> = {
    findActiveByCredentialType: jest.fn().mockResolvedValue(verifier),
    findAll: jest.fn().mockResolvedValue([]),
  };

  const verificationRepo: jest.Mocked<ICredentialVerificationRepository> = {
    findByDoctorAndType: jest.fn().mockResolvedValue(existingVerification),
    findAllByDoctor: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue(upsertResult),
  };

  const mppsPort: jest.Mocked<IMppsVerificationPort> = {
    queryByCedula: jest.fn().mockResolvedValue(portalResult),
  };

  const useCase = new VerifyMppsUseCase(profileRepo, verifierRepo, verificationRepo, mppsPort);

  return { useCase, profileRepo, verifierRepo, verificationRepo, mppsPort };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VerifyMppsUseCase', () => {
  describe('execute — happy path (found + match → verified)', () => {
    it('returns verified status when all checks pass', async () => {
      const verifiedRecord = makeVerification('verified');
      const { useCase, mppsPort, verificationRepo } = buildUseCase({
        upsertResult: verifiedRecord,
      });

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.status).toBe('verified');
      expect(result.doctorId).toBe(DOCTOR_ID);
      expect(mppsPort.queryByCedula).toHaveBeenCalledTimes(1);
      expect(verificationRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'verified' }),
      );
    });

    it('stores evidence with fechaRegistro, profesion', async () => {
      const verifiedRecord = makeVerification('verified');
      const { useCase, verificationRepo } = buildUseCase({ upsertResult: verifiedRecord });

      await useCase.execute(DOCTOR_ID);

      expect(verificationRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          evidence: expect.objectContaining({
            fechaRegistro: '2010-01-01',
            profesion: 'MÉDICO CIRUJANO',
          }),
        }),
      );
    });
  });

  describe('execute — found but name does not match → mismatch', () => {
    it('returns mismatch when portal name does not match doctor name', async () => {
      const mismatchRecord = makeVerification('mismatch');
      const { useCase, verificationRepo } = buildUseCase({
        profile: {
          id: DOCTOR_ID,
          cedula: '12345678',
          mppsNumber: 'MPPS-12345',
          fullName: 'PEDRO RODRIGUEZ',
        },
        portalResult: {
          found: true,
          name: 'JOSE GARCIA',
          professions: [
            {
              licencia: 'MPPS-12345',
              profesion: 'MÉDICO CIRUJANO',
              fechaRegistro: '2010-01-01',
              tomoRegistro: 'T1',
              folioRegistro: 'F1',
            },
          ],
        },
        upsertResult: mismatchRecord,
      });

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.status).toBe('mismatch');
      expect(verificationRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'mismatch', lastError: 'name mismatch' }),
      );
    });
  });

  describe('execute — not found in SACS → not_found', () => {
    it('returns not_found when portal reports cedula absent', async () => {
      const notFoundRecord = makeVerification('not_found');
      const { useCase, verificationRepo } = buildUseCase({
        portalResult: { found: false },
        upsertResult: notFoundRecord,
      });

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.status).toBe('not_found');
      expect(verificationRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'not_found' }),
      );
    });
  });

  describe('execute — mpps not in professions list → mismatch', () => {
    it('returns mismatch when declared MPPS is absent from list', async () => {
      const mismatchRecord = makeVerification('mismatch');
      const { useCase } = buildUseCase({
        portalResult: {
          found: true,
          name: 'JOSE GARCIA',
          professions: [
            {
              licencia: 'MPPS-99999', // different MPPS
              profesion: 'MÉDICO CIRUJANO',
              fechaRegistro: '2010-01-01',
              tomoRegistro: 'T1',
              folioRegistro: 'F1',
            },
          ],
        },
        upsertResult: mismatchRecord,
      });

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.status).toBe('mismatch');
    });
  });

  describe('execute — non-medical profession → mismatch', () => {
    it('returns mismatch when license matches but profession is not medical', async () => {
      const mismatchRecord = makeVerification('mismatch');
      const { useCase, verificationRepo } = buildUseCase({
        portalResult: {
          found: true,
          name: 'JOSE GARCIA',
          professions: [
            {
              licencia: 'MPPS-12345',
              profesion: 'ENFERMERO',
              fechaRegistro: '2010-01-01',
              tomoRegistro: 'T1',
              folioRegistro: 'F1',
            },
          ],
        },
        upsertResult: mismatchRecord,
      });

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.status).toBe('mismatch');
      expect(verificationRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          lastError: 'declared mpps not found in medical professions list',
        }),
      );
    });
  });

  describe('execute — network error → error status', () => {
    it('returns error status when portal throws', async () => {
      const errorRecord = makeVerification('error');
      const { useCase, mppsPort, verificationRepo } = buildUseCase({
        upsertResult: errorRecord,
      });
      mppsPort.queryByCedula.mockRejectedValueOnce(new Error('SACS timeout'));

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.status).toBe('error');
      expect(verificationRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error', lastError: 'SACS timeout' }),
      );
    });
  });

  describe('execute — doctor not found', () => {
    it('throws DoctorProfileNotFoundError when profile is null', async () => {
      const { useCase } = buildUseCase({ profile: null });

      await expect(useCase.execute(DOCTOR_ID)).rejects.toThrow(DoctorProfileNotFoundError);
    });
  });

  describe('execute — no active verifier', () => {
    it('throws NoActiveVerifierError when no verifier is registered', async () => {
      const { useCase } = buildUseCase({ verifier: null });

      await expect(useCase.execute(DOCTOR_ID)).rejects.toThrow(NoActiveVerifierError);
    });
  });

  describe('execute — already verified (cache)', () => {
    it('does not call portal when already verified', async () => {
      const verifiedRecord = makeVerification('verified');
      const { useCase, mppsPort } = buildUseCase({
        existingVerification: verifiedRecord,
        upsertResult: verifiedRecord,
      });

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.status).toBe('verified');
      expect(mppsPort.queryByCedula).not.toHaveBeenCalled();
    });

    it('re-queries portal when force=true even if verified', async () => {
      const verifiedRecord = makeVerification('verified');
      const { useCase, mppsPort } = buildUseCase({
        existingVerification: verifiedRecord,
        upsertResult: verifiedRecord,
      });

      await useCase.execute(DOCTOR_ID, { force: true });

      expect(mppsPort.queryByCedula).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute — missing cedula', () => {
    it('records pending status and skips portal when cedula is null', async () => {
      const pendingRecord = makeVerification('pending');
      const { useCase, mppsPort, verificationRepo } = buildUseCase({
        profile: { id: DOCTOR_ID, cedula: null, mppsNumber: null, fullName: null },
        upsertResult: pendingRecord,
      });

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.status).toBe('pending');
      expect(mppsPort.queryByCedula).not.toHaveBeenCalled();
      expect(verificationRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending', lastError: 'cedula not provided' }),
      );
    });
  });
});
