import { QueryTypes, UniqueConstraintError } from 'sequelize';
import * as Sentry from '@sentry/nestjs';
import { SequelizeIdentityRepository } from './sequelize-identity.repository';
import { Identity } from '../../../domain/entities/identity.entity';
import type { IdentityCreateData } from '../../../domain/repositories/identity.repository';

jest.mock('@sentry/nestjs', () => ({
  withScope: jest.fn(),
  captureException: jest.fn(),
}));

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

function makeSubscriptionModelMock() {
  return {
    findOrCreate: jest.fn().mockResolvedValue([{ id: 'sub-uuid-1' }, true]),
  };
}

/**
 * By default, sequelizeMock.query returns a row with trial_days = 30,
 * simulating the common production state.  Individual tests override this.
 *
 * No transaction mock: createDoctorWithSubscription no longer opens a
 * Sequelize transaction — the profile INSERT commits on its own.
 */
function makeSequelizeMock() {
  return {
    query: jest.fn().mockResolvedValue([{ trial_days: 30 }]),
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
  let errorSpy: jest.SpyInstance;

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

    // Silence logger output and allow assertions on error calls.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorSpy = jest.spyOn((repo as any).logger, 'error').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn((repo as any).logger, 'log').mockImplementation(() => undefined);

    jest.mocked(Sentry.withScope).mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env['SENTRY_ENABLED'];
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
  // create — doctor (profile first, subscription best-effort)
  // -------------------------------------------------------------------------

  describe('create (doctor role)', () => {
    it('persists profile standalone then creates subscription, returns Identity', async () => {
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

      // Capture reference BEFORE the await so innerNow >= beforeMs is guaranteed.
      const beforeMs = Date.now();
      const result = await repo.create(data);

      // Profile created WITHOUT a transaction argument.
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
      );

      // Subscription created via findOrCreate WITHOUT a transaction argument.
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
      };
      expect(findOrCreateCall.where).toEqual({ doctorId: data.id });
      expect(findOrCreateCall.defaults.plan).toBe('free_trial');
      expect(findOrCreateCall.defaults.status).toBe('trialing');
      expect(findOrCreateCall.defaults.priceUsd).toBe(0);
      // currentPeriodEnd should be approximately 30 days from now.
      // Reference captured before the await so innerNow >= beforeMs is guaranteed.
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(findOrCreateCall.defaults.currentPeriodEnd.getTime()).toBeGreaterThan(
        beforeMs + thirtyDaysMs - 5000,
      );
      expect(findOrCreateCall.defaults.currentPeriodEnd.getTime()).toBeLessThan(
        beforeMs + thirtyDaysMs + 5000,
      );
      // trialEndsAt should equal currentPeriodEnd
      expect(findOrCreateCall.defaults.trialEndsAt.getTime()).toBe(
        findOrCreateCall.defaults.currentPeriodEnd.getTime(),
      );

      expect(result).toBeInstanceOf(Identity);
      expect(result.id).toBe(data.id);
    });

    it('uses trial_days from plan_configs when it is a valid integer > 0', async () => {
      // Arrange: plan_configs returns 45 days
      sequelizeMock.query.mockResolvedValue([{ trial_days: 45 }]);
      const data = makeCreateData({ role: 'doctor' });
      const row = makeRow({ id: data.id, email: data.email, role: 'doctor' });
      modelMock.create.mockResolvedValue(row);

      // Act — capture reference BEFORE the await so innerNow >= beforeMs is guaranteed.
      const beforeMs = Date.now();
      await repo.create(data);

      // Assert: resolveTrialDurationDays was called with the parametrized query
      expect(sequelizeMock.query).toHaveBeenCalledWith(
        expect.stringContaining('plan_configs'),
        expect.objectContaining({
          replacements: { planKey: 'free_trial' },
          type: QueryTypes.SELECT,
        }),
      );

      // currentPeriodEnd must be ~45 days from beforeMs (millisecond arithmetic, exact).
      const findOrCreateCall = subscriptionModelMock.findOrCreate.mock.calls[0]![0] as {
        defaults: { currentPeriodEnd: Date };
      };
      const fortyFiveDaysMs = 45 * 24 * 60 * 60 * 1000;
      expect(findOrCreateCall.defaults.currentPeriodEnd.getTime()).toBeGreaterThan(
        beforeMs + fortyFiveDaysMs - 5000,
      );
      expect(findOrCreateCall.defaults.currentPeriodEnd.getTime()).toBeLessThan(
        beforeMs + fortyFiveDaysMs + 5000,
      );
    });

    it('falls back to 30 days when plan_configs row does not exist', async () => {
      // Arrange: empty result set — no matching row
      sequelizeMock.query.mockResolvedValue([]);
      const data = makeCreateData({ role: 'doctor' });
      const row = makeRow({ id: data.id, email: data.email, role: 'doctor' });
      modelMock.create.mockResolvedValue(row);

      const beforeMs = Date.now();
      await repo.create(data);

      const findOrCreateCall = subscriptionModelMock.findOrCreate.mock.calls[0]![0] as {
        defaults: { currentPeriodEnd: Date };
      };
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(findOrCreateCall.defaults.currentPeriodEnd.getTime()).toBeGreaterThan(
        beforeMs + thirtyDaysMs - 5000,
      );
      expect(findOrCreateCall.defaults.currentPeriodEnd.getTime()).toBeLessThan(
        beforeMs + thirtyDaysMs + 5000,
      );
    });

    it('falls back to 30 days when plan_configs returns a null trial_days', async () => {
      sequelizeMock.query.mockResolvedValue([{ trial_days: null }]);
      const data = makeCreateData({ role: 'doctor' });
      const row = makeRow({ id: data.id, email: data.email, role: 'doctor' });
      modelMock.create.mockResolvedValue(row);

      const beforeMs = Date.now();
      await repo.create(data);

      const findOrCreateCall = subscriptionModelMock.findOrCreate.mock.calls[0]![0] as {
        defaults: { currentPeriodEnd: Date };
      };
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(findOrCreateCall.defaults.currentPeriodEnd.getTime()).toBeGreaterThan(
        beforeMs + thirtyDaysMs - 5000,
      );
      expect(findOrCreateCall.defaults.currentPeriodEnd.getTime()).toBeLessThan(
        beforeMs + thirtyDaysMs + 5000,
      );
    });

    it('falls back to 30 days when plan_configs query throws an error', async () => {
      sequelizeMock.query.mockRejectedValue(new Error('relation "plan_configs" does not exist'));
      const data = makeCreateData({ role: 'doctor' });
      const row = makeRow({ id: data.id, email: data.email, role: 'doctor' });
      modelMock.create.mockResolvedValue(row);

      // Registration must succeed despite the query error
      const beforeMs = Date.now();
      const result = await repo.create(data);
      expect(result).toBeInstanceOf(Identity);

      const findOrCreateCall = subscriptionModelMock.findOrCreate.mock.calls[0]![0] as {
        defaults: { currentPeriodEnd: Date };
      };
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(findOrCreateCall.defaults.currentPeriodEnd.getTime()).toBeGreaterThan(
        beforeMs + thirtyDaysMs - 5000,
      );
      expect(findOrCreateCall.defaults.currentPeriodEnd.getTime()).toBeLessThan(
        beforeMs + thirtyDaysMs + 5000,
      );
    });

    it('throws on non-UniqueConstraintError during profile creation', async () => {
      const data = makeCreateData({ role: 'doctor' });
      const dbError = new Error('connection refused');
      modelMock.create.mockRejectedValue(dbError);

      await expect(repo.create(data)).rejects.toThrow('connection refused');

      // No subscription attempt after profile insert failure
      expect(subscriptionModelMock.findOrCreate).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Best-effort subscription — the key design: doctor survives sub failure
    // -----------------------------------------------------------------------

    it('returns the profile even when subscription creation throws (best-effort)', async () => {
      const data = makeCreateData({ role: 'doctor', email: 'resilient@example.com' });
      const row = makeRow({ id: data.id, email: data.email, role: 'doctor' });
      modelMock.create.mockResolvedValue(row);
      // Simulate a DB error during subscription creation
      subscriptionModelMock.findOrCreate.mockRejectedValue(new Error('subscriptions table locked'));

      // Must resolve — not reject — despite the subscription failure.
      const result = await repo.create(data);

      expect(result).toBeInstanceOf(Identity);
      expect(result.id).toBe(data.id);
    });

    it('subscription failure emits [signup] log with email and reports to Sentry', async () => {
      process.env['SENTRY_ENABLED'] = 'true';
      const data = makeCreateData({ role: 'doctor', email: 'sentry@example.com' });
      const row = makeRow({ id: data.id, email: 'sentry@example.com', role: 'doctor' });
      modelMock.create.mockResolvedValue(row);
      subscriptionModelMock.findOrCreate.mockRejectedValue(new Error('constraint violation'));

      const capturedScope = {
        setUser: jest.fn(),
        setTag: jest.fn(),
        setExtra: jest.fn(),
        captureException: jest.fn(),
      };
      jest.mocked(Sentry.withScope).mockImplementation((cb) => {
        (cb as unknown as (scope: unknown) => void)(capturedScope);
        return undefined as never;
      });

      await repo.create(data);

      // Log must contain [signup] prefix and email
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[signup]'));
      const logCall = (errorSpy.mock.calls as string[][]).find(([msg]) =>
        msg?.includes('subscription-missing'),
      );
      expect(logCall).toBeDefined();
      expect(logCall?.[0]).toContain('sentry@example.com');
      expect(logCall?.[0]).toContain('constraint violation');

      // Sentry must be notified with email in setUser
      expect(Sentry.withScope).toHaveBeenCalledTimes(1);
      expect(capturedScope.setUser).toHaveBeenCalledWith({ email: 'sentry@example.com' });
      expect(capturedScope.setTag).toHaveBeenCalledWith('signup_failure', 'true');
    });

    it('subscription failure does NOT call Sentry when SENTRY_ENABLED is not set', async () => {
      delete process.env['SENTRY_ENABLED'];
      const data = makeCreateData({ role: 'doctor' });
      const row = makeRow({ id: data.id, email: data.email, role: 'doctor' });
      modelMock.create.mockResolvedValue(row);
      subscriptionModelMock.findOrCreate.mockRejectedValue(new Error('db error'));

      await repo.create(data);

      expect(Sentry.withScope).not.toHaveBeenCalled();
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

      // Defensive subscription check outside any transaction
      const findOrCreateCall = subscriptionModelMock.findOrCreate.mock.calls[0]![0] as {
        where: { doctorId: string };
        defaults: { doctorId: string; plan: string; status: string; priceUsd: number };
      };
      expect(findOrCreateCall.where).toEqual({ doctorId: 'uuid-winner' });
      expect(findOrCreateCall.defaults.plan).toBe('free_trial');
      expect(findOrCreateCall.defaults.status).toBe('trialing');
      expect(findOrCreateCall.defaults.priceUsd).toBe(0);
      // No transaction key on the findOrCreate call
      expect(findOrCreateCall).not.toHaveProperty('transaction');

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
