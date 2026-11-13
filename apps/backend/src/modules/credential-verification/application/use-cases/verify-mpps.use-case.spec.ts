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
    promoteToVerified: jest.fn().mockResolvedValue(undefined),
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

  describe('execute — no MPPS declared + found with medical profession → verified', () => {
    it('verifies when cédula is in SACS with any medical profession and no MPPS declared', async () => {
      const verifiedRecord = makeVerification('verified');
      const { useCase, verificationRepo, mppsPort } = buildUseCase({
        profile: {
          id: DOCTOR_ID,
          cedula: '12345678',
          mppsNumber: null, // doctor has not declared an MPPS number
          fullName: 'JOSE GARCIA',
        },
        portalResult: {
          found: true,
          name: 'JOSE GARCIA',
          professions: [
            {
              licencia: 'MPPS-65583',
              profesion: 'MÉDICO CIRUJANO',
              fechaRegistro: '2010-01-01',
              tomoRegistro: 'T1',
              folioRegistro: 'F1',
            },
          ],
        },
        upsertResult: verifiedRecord,
      });

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.status).toBe('verified');
      expect(mppsPort.queryByCedula).toHaveBeenCalledTimes(1);
      expect(verificationRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'verified',
          evidence: expect.objectContaining({ profesion: 'MÉDICO CIRUJANO' }),
        }),
      );
    });
  });

  describe('execute — no MPPS declared + found but no medical profession → mismatch', () => {
    it('returns mismatch when cédula is in SACS but has no medical profession', async () => {
      const mismatchRecord = makeVerification('mismatch');
      const { useCase, verificationRepo } = buildUseCase({
        profile: {
          id: DOCTOR_ID,
          cedula: '12345678',
          mppsNumber: null,
          fullName: 'JOSE GARCIA',
        },
        portalResult: {
          found: true,
          name: 'JOSE GARCIA',
          professions: [], // no professions listed
        },
        upsertResult: mismatchRecord,
      });

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.status).toBe('mismatch');
      expect(verificationRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'mismatch',
          lastError: 'no medical profession found for this cedula',
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

  // ---------------------------------------------------------------------------
  // Profile promotion tests
  // ---------------------------------------------------------------------------

  describe('profile promotion — fresh verified', () => {
    it('calls promoteToVerified after a fresh verified result', async () => {
      const verifiedRecord = makeVerification('verified');
      const { useCase, profileRepo } = buildUseCase({ upsertResult: verifiedRecord });

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.status).toBe('verified');
      expect(profileRepo.promoteToVerified).toHaveBeenCalledWith(DOCTOR_ID);
    });

    it('does not call promoteToVerified after a mismatch result', async () => {
      const mismatchRecord = makeVerification('mismatch');
      const { useCase, profileRepo } = buildUseCase({
        portalResult: {
          found: true,
          name: 'OTRO NOMBRE',
          professions: [],
        },
        upsertResult: mismatchRecord,
      });

      await useCase.execute(DOCTOR_ID);

      expect(profileRepo.promoteToVerified).not.toHaveBeenCalled();
    });

    it('does not call promoteToVerified after a not_found result', async () => {
      const notFoundRecord = makeVerification('not_found');
      const { useCase, profileRepo } = buildUseCase({
        portalResult: { found: false },
        upsertResult: notFoundRecord,
      });

      await useCase.execute(DOCTOR_ID);

      expect(profileRepo.promoteToVerified).not.toHaveBeenCalled();
    });

    it('still returns verified when promoteToVerified throws', async () => {
      const verifiedRecord = makeVerification('verified');
      const { useCase, profileRepo } = buildUseCase({ upsertResult: verifiedRecord });
      profileRepo.promoteToVerified.mockRejectedValueOnce(new Error('DB error'));

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.status).toBe('verified');
    });
  });

  describe('profile promotion — cached path', () => {
    it('promotes profile and skips SACS when cached MPPS matches current MPPS', async () => {
      const verifiedRecord = makeVerification('verified');
      const { useCase, mppsPort, profileRepo } = buildUseCase({
        existingVerification: verifiedRecord,
        upsertResult: verifiedRecord,
        // profile.mppsNumber = 'MPPS-12345', verifiedRecord.declaredValue = 'MPPS-12345'
      });

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.status).toBe('verified');
      expect(mppsPort.queryByCedula).not.toHaveBeenCalled();
      expect(profileRepo.promoteToVerified).toHaveBeenCalledWith(DOCTOR_ID);
    });

    it('re-queries SACS when cached MPPS differs from current profile MPPS', async () => {
      // Cached verification was for 'MPPS-12345' but doctor now declares 'MPPS-99999'
      const verifiedRecord = makeVerification('verified');
      // makeVerification sets declaredValue = 'MPPS-12345'
      const { useCase, mppsPort } = buildUseCase({
        existingVerification: verifiedRecord,
        profile: {
          id: DOCTOR_ID,
          cedula: '12345678',
          mppsNumber: 'MPPS-99999', // different from cached 'MPPS-12345'
          fullName: 'JOSE GARCIA',
        },
        // portal returns not-found for the changed number
        portalResult: { found: false },
        upsertResult: makeVerification('not_found'),
      });

      const result = await useCase.execute(DOCTOR_ID);

      expect(mppsPort.queryByCedula).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('not_found');
    });

    it('re-queries SACS when cached declaredValue has no numeric content', async () => {
      // Edge: declaredValue is empty/null in the cached row
      const verifiedRecordNoMpps = makeVerification('verified');
      // Override declaredValue to empty by creating a custom record
      const emptyDeclaredRecord = {
        ...verifiedRecordNoMpps,
        declaredValue: null,
        isVerified: () => true,
      };

      const { useCase, mppsPort } = buildUseCase({
        existingVerification: emptyDeclaredRecord as ReturnType<typeof makeVerification>,
        upsertResult: makeVerification('verified'),
      });

      await useCase.execute(DOCTOR_ID);

      // cachedMpps.length === 0 → falls through to SACS
      expect(mppsPort.queryByCedula).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 15-minute cooldown
  // ---------------------------------------------------------------------------

  describe('execute — 15-minute cooldown', () => {
    const makeRecentVerification = (status: string, minutesAgo: number) =>
      CredentialVerification.create({
        id: 'cccc3333-cccc-3333-cccc-333333333333',
        doctorId: DOCTOR_ID,
        credentialType: 'mpps',
        declaredValue: 'MPPS-12345',
        verifierId: VERIFIER_ID,
        status: status as never,
        evidence: null,
        checkedAt: new Date(Date.now() - minutesAgo * 60_000),
        attempts: 1,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    it('skips SACS when non-verified record was checked within 15 minutes', async () => {
      const recentMismatch = makeRecentVerification('mismatch', 5);

      const { useCase, mppsPort, verificationRepo } = buildUseCase({
        existingVerification: recentMismatch,
        upsertResult: recentMismatch,
      });

      const result = await useCase.execute(DOCTOR_ID);

      expect(mppsPort.queryByCedula).not.toHaveBeenCalled();
      expect(verificationRepo.upsert).not.toHaveBeenCalled();
      expect(result.status).toBe('mismatch');
    });

    it('applies cooldown to pending status within 15 minutes', async () => {
      const recentPending = makeRecentVerification('pending', 1);

      const { useCase, mppsPort } = buildUseCase({
        existingVerification: recentPending,
        upsertResult: recentPending,
      });

      await useCase.execute(DOCTOR_ID);

      expect(mppsPort.queryByCedula).not.toHaveBeenCalled();
    });

    it('calls SACS when last check was more than 15 minutes ago', async () => {
      const oldMismatch = makeRecentVerification('mismatch', 20);
      const verifiedResult = makeVerification('verified');

      const { useCase, mppsPort } = buildUseCase({
        existingVerification: oldMismatch,
        upsertResult: verifiedResult,
      });

      await useCase.execute(DOCTOR_ID);

      expect(mppsPort.queryByCedula).toHaveBeenCalledTimes(1);
    });

    it('bypasses cooldown when force=true', async () => {
      const recentMismatch = makeRecentVerification('mismatch', 2);
      const verifiedResult = makeVerification('verified');

      const { useCase, mppsPort } = buildUseCase({
        existingVerification: recentMismatch,
        upsertResult: verifiedResult,
      });

      await useCase.execute(DOCTOR_ID, { force: true });

      expect(mppsPort.queryByCedula).toHaveBeenCalledTimes(1);
    });

    it('still calls SACS when verified+MPPS changed even within cooldown window', async () => {
      // Existing is verified with MPPS-12345 (checked just now = within 15 min).
      // Profile now declares MPPS-99999 → cache is stale → must re-query SACS.
      const recentVerified = makeRecentVerification('verified', 2);

      const { useCase, mppsPort } = buildUseCase({
        existingVerification: recentVerified,
        profile: {
          id: DOCTOR_ID,
          cedula: '12345678',
          mppsNumber: 'MPPS-99999', // differs from cached MPPS-12345
          fullName: 'JOSE GARCIA',
        },
        portalResult: { found: false },
        upsertResult: makeVerification('not_found'),
      });

      await useCase.execute(DOCTOR_ID);

      // Cooldown does NOT block re-verification when MPPS changed.
      expect(mppsPort.queryByCedula).toHaveBeenCalledTimes(1);
    });

    it('does not apply cooldown when checkedAt is null', async () => {
      // A record with status=pending but no checkedAt (e.g. the cedula was missing)
      // should NOT be blocked by the cooldown — there is no meaningful "last check".
      const neverChecked = CredentialVerification.create({
        id: 'cccc3333-cccc-3333-cccc-333333333333',
        doctorId: DOCTOR_ID,
        credentialType: 'mpps',
        declaredValue: null,
        verifierId: null,
        status: 'pending',
        evidence: null,
        checkedAt: null,
        attempts: 0,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const verifiedResult = makeVerification('verified');

      const { useCase, mppsPort } = buildUseCase({
        existingVerification: neverChecked,
        upsertResult: verifiedResult,
      });

      await useCase.execute(DOCTOR_ID);

      // No checkedAt → cooldown does not apply → SACS is called.
      expect(mppsPort.queryByCedula).toHaveBeenCalledTimes(1);
    });
  });
});
