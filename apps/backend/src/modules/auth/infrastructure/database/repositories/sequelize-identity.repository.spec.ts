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
    plan: string | null;
    subscriptionStatus: string | null;
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
    plan: overrides.plan ?? null,
    subscriptionStatus: overrides.subscriptionStatus ?? null,
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
// Mock factories
// ---------------------------------------------------------------------------

function makeTransactionMock() {
  return {
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
  };
}

function makeSubscriptionModelMock() {
  return {
    findOrCreate: jest.fn().mockResolvedValue([{ id: 'sub-uuid-1' }, true]),
  };
}

function makeSequelizeMock(txMock?: ReturnType<typeof makeTransactionMock>) {
  const tx = txMock ?? makeTransactionMock();
  return {
    _tx: tx,
    transaction: jest.fn().mockResolvedValue(tx),
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
  let subscriptionModelMock: { findOrCreate: jest.Mock };
  let sequelizeMock: ReturnType<typeof makeSequelizeMock>;
  let repo: SequelizeIdentityRepository;

  beforeEach(() => {
    modelMock = {
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    subscriptionModelMock = makeSubscriptionModelMock();
    sequelizeMock = makeSequelizeMock();

    repo = new SequelizeIdentityRepository(
      modelMock as never,
      subscriptionModelMock as never,
      sequelizeMock as never,
    );
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
  // create — doctor (atomic: profile + subscription in transaction)
  // -------------------------------------------------------------------------

  describe('create (doctor role)', () => {
    it('persists profile and subscription in a transaction, returns Identity', async () => {
      const data = makeCreateData({ role: 'doctor' });
      const row = makeRow({
        id: data.id,
        email: data.email,
        fullName: data.fullName,
        role: 'doctor',
        plan: 'free_trial',
        subscriptionStatus: 'trialing',
      });
      modelMock.create.mockResolvedValue(row);
      subscriptionModelMock.findOrCreate.mockResolvedValue([{ id: 'sub-1' }, true]);

      const result = await repo.create(data);

      // Transaction opened
      expect(sequelizeMock.transaction).toHaveBeenCalledTimes(1);

      // Profile created with free_trial + trialing snapshot
      expect(modelMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: data.id,
          email: data.email,
          fullName: data.fullName,
          role: 'doctor',
          auth0Sub: null,
          isActive: true,
          plan: 'free_trial',
          subscriptionStatus: 'trialing',
        }),
        expect.objectContaining({ transaction: sequelizeMock._tx }),
      );

      // Subscription created via findOrCreate with 30-day trial
      const findOrCreateCall = subscriptionModelMock.findOrCreate.mock.calls[0]![0] as {
        where: { doctorId: string };
        defaults: {
          doctorId: string;
          plan: string;
          status: string;
          priceUsd: number;
          currentPeriodEnd: Date;
          trialEndsAt: Date;
        };
        transaction: unknown;
      };
      expect(findOrCreateCall.where).toEqual({ doctorId: data.id });
      expect(findOrCreateCall.defaults.plan).toBe('free_trial');
      expect(findOrCreateCall.defaults.status).toBe('trialing');
      expect(findOrCreateCall.defaults.priceUsd).toBe(0);
      // currentPeriodEnd should be approximately 30 days from now
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const nowMs = Date.now();
      expect(findOrCreateCall.defaults.currentPeriodEnd.getTime()).toBeGreaterThan(
        nowMs + thirtyDaysMs - 5000,
      );
      expect(findOrCreateCall.defaults.currentPeriodEnd.getTime()).toBeLessThan(
        nowMs + thirtyDaysMs + 5000,
      );
      // trialEndsAt should equal currentPeriodEnd
      expect(findOrCreateCall.defaults.trialEndsAt.getTime()).toBe(
        findOrCreateCall.defaults.currentPeriodEnd.getTime(),
      );
      expect(findOrCreateCall.transaction).toBe(sequelizeMock._tx);

      // Transaction committed
      expect(sequelizeMock._tx.commit).toHaveBeenCalledTimes(1);
      expect(sequelizeMock._tx.rollback).not.toHaveBeenCalled();

      expect(result).toBeInstanceOf(Identity);
      expect(result.id).toBe(data.id);
    });

    it('rolls back and re-throws on non-UniqueConstraintError', async () => {
      const data = makeCreateData({ role: 'doctor' });
      const dbError = new Error('connection refused');
      modelMock.create.mockRejectedValue(dbError);

      await expect(repo.create(data)).rejects.toThrow('connection refused');

      expect(sequelizeMock._tx.rollback).toHaveBeenCalledTimes(1);
      expect(sequelizeMock._tx.commit).not.toHaveBeenCalled();
      // No subscription attempt after non-race error
      expect(subscriptionModelMock.findOrCreate).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Concurrent first-login race (UniqueConstraintError)
    // -----------------------------------------------------------------------

    it('handles concurrent doctor first-login: reads winner profile and ensures subscription', async () => {
      const data = makeCreateData({ role: 'doctor', email: 'concurrent@example.com' });
      const winnerRow = makeRow({
        id: 'uuid-winner',
        email: 'concurrent@example.com',
        role: 'doctor',
        plan: 'free_trial',
        subscriptionStatus: 'trialing',
      });

      const uniqueError = new UniqueConstraintError({ errors: [] });
      modelMock.create.mockRejectedValue(uniqueError);
      // The winner's row is readable after the clash
      modelMock.findOne.mockResolvedValue(winnerRow);
      subscriptionModelMock.findOrCreate.mockResolvedValue([{ id: 'sub-winner' }, false]);

      const result = await repo.create(data);

      // Rollback called (Postgres aborted the transaction)
      expect(sequelizeMock._tx.rollback).toHaveBeenCalledTimes(1);
      expect(sequelizeMock._tx.commit).not.toHaveBeenCalled();

      // Defensive subscription check outside transaction
      const findOrCreateCall = subscriptionModelMock.findOrCreate.mock.calls[0]![0] as {
        where: { doctorId: string };
        defaults: { doctorId: string; plan: string; status: string; priceUsd: number };
      };
      expect(findOrCreateCall.where).toEqual({ doctorId: 'uuid-winner' });
      expect(findOrCreateCall.defaults.plan).toBe('free_trial');
      expect(findOrCreateCall.defaults.status).toBe('trialing');
      expect(findOrCreateCall.defaults.priceUsd).toBe(0);

      expect(result).toBeInstanceOf(Identity);
      expect(result.id).toBe('uuid-winner');
      expect(result.email).toBe('concurrent@example.com');
    });

    it('re-throws UniqueConstraintError when winner row cannot be read back', async () => {
      const data = makeCreateData({ role: 'doctor', email: 'ghost@example.com' });

      const uniqueError = new UniqueConstraintError({ errors: [] });
      modelMock.create.mockRejectedValue(uniqueError);
      // Row disappears — unusual but must not swallow the error
      modelMock.findOne.mockResolvedValue(null);

      await expect(repo.create(data)).rejects.toBeInstanceOf(UniqueConstraintError);

      expect(sequelizeMock._tx.rollback).toHaveBeenCalledTimes(1);
      // No subscription created since profile not found
      expect(subscriptionModelMock.findOrCreate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // create — non-doctor (no subscription, no transaction)
  // -------------------------------------------------------------------------

  describe('create (non-doctor role)', () => {
    it('creates patient profile without opening a transaction or subscription', async () => {
      const data = makeCreateData({ role: 'patient', email: 'patient@example.com' });
      const row = makeRow({ id: data.id, email: data.email, role: 'patient' });
      modelMock.create.mockResolvedValue(row);

      const result = await repo.create(data);

      // No transaction for non-doctor
      expect(sequelizeMock.transaction).not.toHaveBeenCalled();
      expect(subscriptionModelMock.findOrCreate).not.toHaveBeenCalled();

      expect(modelMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: data.id,
          email: data.email,
          role: 'patient',
          isActive: true,
        }),
      );

      expect(result).toBeInstanceOf(Identity);
      expect(result.id).toBe(data.id);
    });

    it('handles concurrent non-doctor race: returns winner profile', async () => {
      const data = makeCreateData({ role: 'patient', email: 'concurrent@example.com' });
      const winnerRow = makeRow({
        id: 'uuid-winner',
        email: 'concurrent@example.com',
        role: 'patient',
      });

      const uniqueError = new UniqueConstraintError({ errors: [] });
      modelMock.create.mockRejectedValue(uniqueError);
      modelMock.findOne.mockResolvedValue(winnerRow);

      const result = await repo.create(data);

      expect(result).toBeInstanceOf(Identity);
      expect(result.id).toBe('uuid-winner');
      expect(sequelizeMock.transaction).not.toHaveBeenCalled();
      expect(subscriptionModelMock.findOrCreate).not.toHaveBeenCalled();
    });

    it('re-throws UniqueConstraintError for non-doctor when row cannot be read back', async () => {
      const data = makeCreateData({ role: 'patient', email: 'ghost@example.com' });

      const uniqueError = new UniqueConstraintError({ errors: [] });
      modelMock.create.mockRejectedValue(uniqueError);
      modelMock.findOne.mockResolvedValue(null);

      await expect(repo.create(data)).rejects.toBeInstanceOf(UniqueConstraintError);
    });

    it('re-throws non-UniqueConstraintError errors unchanged', async () => {
      const data = makeCreateData({ role: 'patient' });
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
