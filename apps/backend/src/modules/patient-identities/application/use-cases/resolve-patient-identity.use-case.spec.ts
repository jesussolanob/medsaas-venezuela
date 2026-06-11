import { ResolvePatientIdentityUseCase } from './resolve-patient-identity.use-case';
import { PatientIdentityConflictError } from '../../domain/errors/patient-identity.errors';
import type { IPatientIdentityRepository } from '../../domain/repositories/patient-identity.repository';
import { PatientIdentity } from '../../domain/entities/patient-identity.entity';

const HASH = 'a'.repeat(64);
const IDENTITY_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const now = new Date('2026-06-11T00:00:00Z');

function makeIdentity(): PatientIdentity {
  return PatientIdentity.create({
    id: IDENTITY_ID,
    cedulaHash: HASH,
    cedulaEncrypted: 'enc:payload==',
    createdAt: now,
    updatedAt: now,
  });
}

function makeMockRepo(): jest.Mocked<IPatientIdentityRepository> {
  return {
    findByCedulaHash: jest.fn(),
    save: jest.fn(),
  };
}

function makeMockCrypto() {
  return {
    hashForSearch: jest.fn().mockReturnValue(HASH),
    encrypt: jest.fn().mockReturnValue('enc:payload=='),
    decrypt: jest.fn(),
  };
}

describe('ResolvePatientIdentityUseCase', () => {
  let useCase: ResolvePatientIdentityUseCase;
  let repo: jest.Mocked<IPatientIdentityRepository>;
  let crypto: ReturnType<typeof makeMockCrypto>;

  beforeEach(() => {
    repo = makeMockRepo();
    crypto = makeMockCrypto();
    useCase = new ResolvePatientIdentityUseCase(repo, crypto as never);
  });

  describe('null / empty cedula', () => {
    it('returns null when cedula is null', async () => {
      const result = await useCase.execute(null);
      expect(result).toBeNull();
      expect(repo.findByCedulaHash).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('returns null when cedula is undefined', async () => {
      const result = await useCase.execute(undefined);
      expect(result).toBeNull();
    });

    it('returns null when cedula is empty string', async () => {
      const result = await useCase.execute('');
      expect(result).toBeNull();
    });

    it('returns null when cedula is whitespace only', async () => {
      const result = await useCase.execute('   ');
      expect(result).toBeNull();
    });
  });

  describe('existing identity found', () => {
    it('returns the existing identity id without creating a new row', async () => {
      const existing = makeIdentity();
      repo.findByCedulaHash.mockResolvedValue(existing);

      const result = await useCase.execute('V-12345678');

      expect(result).toBe(IDENTITY_ID);
      expect(repo.findByCedulaHash).toHaveBeenCalledWith(HASH);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('new identity created', () => {
    it('creates a new identity when none exists and returns its id', async () => {
      repo.findByCedulaHash.mockResolvedValue(null);
      const saved = makeIdentity();
      repo.save.mockResolvedValue(saved);

      const result = await useCase.execute('V-12345678');

      expect(result).toBe(IDENTITY_ID);
      expect(repo.findByCedulaHash).toHaveBeenCalledWith(HASH);
      expect(repo.save).toHaveBeenCalledTimes(1);
      const savedArg = repo.save.mock.calls[0]?.[0];
      expect(savedArg?.cedulaHash).toBe(HASH);
      expect(savedArg?.cedulaEncrypted).toBe('enc:payload==');
    });

    it('encrypts the cedula before storing', async () => {
      repo.findByCedulaHash.mockResolvedValue(null);
      repo.save.mockResolvedValue(makeIdentity());

      await useCase.execute('V-99999999');

      expect(crypto.encrypt).toHaveBeenCalledWith('V-99999999');
    });
  });

  describe('race condition (concurrent insert)', () => {
    it('re-queries on PatientIdentityConflictError and returns the winner row id', async () => {
      const raceWinner = makeIdentity();
      repo.findByCedulaHash
        .mockResolvedValueOnce(null) // first call: nothing yet
        .mockResolvedValueOnce(raceWinner); // re-query after conflict
      repo.save.mockRejectedValue(new PatientIdentityConflictError());

      const result = await useCase.execute('V-12345678');

      expect(result).toBe(IDENTITY_ID);
      expect(repo.findByCedulaHash).toHaveBeenCalledTimes(2);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('returns null if re-query after conflict finds nothing (edge case)', async () => {
      repo.findByCedulaHash.mockResolvedValueOnce(null).mockResolvedValueOnce(null); // paranoid edge: still null
      repo.save.mockRejectedValue(new PatientIdentityConflictError());

      const result = await useCase.execute('V-12345678');

      expect(result).toBeNull();
    });

    it('re-throws non-conflict errors', async () => {
      repo.findByCedulaHash.mockResolvedValue(null);
      repo.save.mockRejectedValue(new Error('DB connection lost'));

      await expect(useCase.execute('V-12345678')).rejects.toThrow('DB connection lost');
    });
  });
});
