import { UniqueConstraintError } from 'sequelize';
import { SequelizeIdentityRepository } from './sequelize-identity.repository';
import { Identity } from '../../../domain/entities/identity.entity';
import type { IdentityCreateData } from '../../../domain/repositories/identity.repository';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(
  overrides: Partial<{
    id: string;
    email: string;
    fullName: string;
    role: string;
    auth0Sub: string | null;
    isActive: boolean;
    createdAt: Date;
  }> = {},
) {
  return {
    id: overrides.id ?? 'uuid-1',
    email: overrides.email ?? 'test@example.com',
    fullName: overrides.fullName ?? 'Test User',
    role: overrides.role ?? 'doctor',
    auth0Sub: overrides.auth0Sub ?? null,
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00.000Z'),
  };
}

function makeCreateData(overrides: Partial<IdentityCreateData> = {}): IdentityCreateData {
  return {
    id: 'uuid-new',
    email: 'new@example.com',
    fullName: 'New Doctor',
    role: 'doctor',
    auth0Sub: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SequelizeIdentityRepository', () => {
  let modelMock: {
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  let repo: SequelizeIdentityRepository;

  beforeEach(() => {
    modelMock = {
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    repo = new SequelizeIdentityRepository(modelMock as never);
  });

  // -------------------------------------------------------------------------
  // findByEmail
  // -------------------------------------------------------------------------

  describe('findByEmail', () => {
    it('returns Identity when a matching row exists', async () => {
      const row = makeRow({ email: 'doctor@example.com' });
      modelMock.findOne.mockResolvedValue(row);

      const result = await repo.findByEmail('doctor@example.com');

      expect(result).toBeInstanceOf(Identity);
      expect(result?.email).toBe('doctor@example.com');
    });

    it('returns null when no row matches', async () => {
      modelMock.findOne.mockResolvedValue(null);

      const result = await repo.findByEmail('ghost@example.com');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // create — happy path
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('persists a new row and returns the mapped Identity', async () => {
      const data = makeCreateData();
      const row = makeRow({ id: data.id, email: data.email, fullName: data.fullName });
      modelMock.create.mockResolvedValue(row);

      const result = await repo.create(data);

      expect(modelMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: data.id,
          email: data.email,
          fullName: data.fullName,
          role: data.role,
          auth0Sub: null,
          isActive: true,
        }),
      );
      expect(result).toBeInstanceOf(Identity);
      expect(result.id).toBe(data.id);
    });

    // -----------------------------------------------------------------------
    // Race condition — FIX 2
    // -----------------------------------------------------------------------

    it('handles concurrent first-login race: returns existing profile when UniqueConstraintError is thrown', async () => {
      const data = makeCreateData({ email: 'concurrent@example.com' });
      const winnerRow = makeRow({ id: 'uuid-winner', email: 'concurrent@example.com' });

      // Simulate the UNIQUE index violation
      const uniqueError = new UniqueConstraintError({ errors: [] });
      modelMock.create.mockRejectedValue(uniqueError);

      // The winner's row is readable after the clash
      modelMock.findOne.mockResolvedValue(winnerRow);

      const result = await repo.create(data);

      expect(result).toBeInstanceOf(Identity);
      expect(result.id).toBe('uuid-winner');
      expect(result.email).toBe('concurrent@example.com');
    });

    it('re-throws UniqueConstraintError when the row cannot be found after the clash', async () => {
      const data = makeCreateData({ email: 'ghost@example.com' });

      const uniqueError = new UniqueConstraintError({ errors: [] });
      modelMock.create.mockRejectedValue(uniqueError);

      // Row not findable (unusual but must not silently swallow the error)
      modelMock.findOne.mockResolvedValue(null);

      await expect(repo.create(data)).rejects.toBeInstanceOf(UniqueConstraintError);
    });

    it('re-throws non-UniqueConstraintError errors unchanged', async () => {
      const data = makeCreateData();
      const dbError = new Error('connection refused');
      modelMock.create.mockRejectedValue(dbError);

      await expect(repo.create(data)).rejects.toThrow('connection refused');
    });
  });

  // -------------------------------------------------------------------------
  // updateAuth0Sub
  // -------------------------------------------------------------------------

  describe('updateAuth0Sub', () => {
    it('calls model.update with the correct sub and id', async () => {
      modelMock.update.mockResolvedValue([1]);

      await repo.updateAuth0Sub('uuid-1', 'auth0|abc');

      expect(modelMock.update).toHaveBeenCalledWith(
        { auth0Sub: 'auth0|abc' },
        { where: { id: 'uuid-1' } },
      );
    });
  });
});
