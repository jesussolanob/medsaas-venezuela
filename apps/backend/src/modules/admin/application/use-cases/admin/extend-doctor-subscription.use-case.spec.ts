import { ExtendDoctorSubscriptionUseCase } from './extend-doctor-subscription.use-case';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import type {
  IAdminRepository,
  SubscriptionSnapshot,
} from '../../../domain/repositories/admin.repository';
import type { SubscriptionPlan } from '@delta/shared-types';
import type { AccruePlanCommissionUseCase } from '../../../../seller-commissions/application/use-cases/accrue-plan-commission.use-case';

const DOCTOR_ID = 'doc-1';
const ACTOR_ID = 'admin-1';

function makeSnapshot(
  plan: SubscriptionPlan | null,
  expiresAt: Date | null = null,
): SubscriptionSnapshot {
  return { doctorId: DOCTOR_ID, plan, status: 'active', expiresAt };
}

function makeRepo(snapshot: SubscriptionSnapshot | null): jest.Mocked<IAdminRepository> {
  return {
    getSubscriptionSnapshot: jest.fn().mockResolvedValue(snapshot),
    applyManualSubscriptionChange: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<IAdminRepository>;
}

const makeAccrue = (impl?: () => Promise<unknown>) =>
  ({
    execute: jest.fn(impl ?? (() => Promise.resolve('created'))),
  }) as unknown as jest.Mocked<AccruePlanCommissionUseCase>;

// The commission hook is dispatched with `void ... .catch()`, so it settles on
// the microtask queue AFTER execute() resolves.
const flushHook = () => new Promise((resolve) => setImmediate(resolve));

const baseInput = { doctorId: DOCTOR_ID, actorId: ACTOR_ID, reason: null };

describe('ExtendDoctorSubscriptionUseCase', () => {
  it('throws DoctorNotFoundError when the doctor does not exist', async () => {
    const useCase = new ExtendDoctorSubscriptionUseCase(makeRepo(null), null);

    await expect(useCase.execute({ ...baseInput, months: 1 })).rejects.toThrow(DoctorNotFoundError);
  });

  // ---------------------------------------------------------------------------
  // Anchoring — extend from the current expiry when it is still in the future
  // ---------------------------------------------------------------------------

  it('extends from the current expiry when it is in the future', async () => {
    const future = new Date('2030-06-15');
    const repo = makeRepo(makeSnapshot('delta_base', future));
    const useCase = new ExtendDoctorSubscriptionUseCase(repo, null);

    const { newExpiresAt } = await useCase.execute({ ...baseInput, months: 1 });

    expect(newExpiresAt).toEqual(new Date('2030-07-15'));
  });

  it('clamps the day instead of overflowing into the next month', async () => {
    // Jan 31 + 1 month must land on Feb 28, not March 3.
    const repo = makeRepo(makeSnapshot('delta_base', new Date('2030-01-31')));
    const useCase = new ExtendDoctorSubscriptionUseCase(repo, null);

    const { newExpiresAt } = await useCase.execute({ ...baseInput, months: 1 });

    expect(newExpiresAt.getMonth()).toBe(1); // February
    expect(newExpiresAt.getDate()).toBe(28);
  });

  it('adds days when days is provided', async () => {
    const repo = makeRepo(makeSnapshot('delta_base', new Date('2030-06-15')));
    const useCase = new ExtendDoctorSubscriptionUseCase(repo, null);

    const { newExpiresAt } = await useCase.execute({ ...baseInput, days: 10 });

    expect(newExpiresAt).toEqual(new Date('2030-06-25'));
  });

  // ---------------------------------------------------------------------------
  // Plan resolution
  // ---------------------------------------------------------------------------

  it('keeps the current plan when it is already a paid plan', async () => {
    const repo = makeRepo(makeSnapshot('delta_plus', new Date('2030-06-15')));
    const useCase = new ExtendDoctorSubscriptionUseCase(repo, null);

    await useCase.execute({ ...baseInput, months: 1 });

    expect(repo.applyManualSubscriptionChange).toHaveBeenCalledWith(
      expect.objectContaining({ newPlan: 'delta_plus', newStatus: 'active' }),
    );
  });

  it('leaves a free_trial doctor on free_trial (only the legacy "trial" migrates)', async () => {
    const repo = makeRepo(makeSnapshot('free_trial', new Date('2030-06-15')));
    const useCase = new ExtendDoctorSubscriptionUseCase(repo, null);

    await useCase.execute({ ...baseInput, months: 1 });

    expect(repo.applyManualSubscriptionChange).toHaveBeenCalledWith(
      expect.objectContaining({ newPlan: 'free_trial' }),
    );
  });

  // ---------------------------------------------------------------------------
  // Plan commission hook — fire-and-forget, must never affect the extension
  // ---------------------------------------------------------------------------

  describe('plan commission hook', () => {
    it('accrues with the resolved plan (this path can land a doctor on a paid plan)', async () => {
      const accrue = makeAccrue();
      const repo = makeRepo(makeSnapshot('delta_plus', new Date('2030-06-15')));
      const useCase = new ExtendDoctorSubscriptionUseCase(repo, accrue);

      await useCase.execute({ ...baseInput, months: 1 });
      await flushHook();

      expect(accrue.execute).toHaveBeenCalledTimes(1);
      expect(accrue.execute).toHaveBeenCalledWith(DOCTOR_ID, 'delta_plus');
    });

    it('does NOT accrue when the doctor does not exist', async () => {
      const accrue = makeAccrue();
      const useCase = new ExtendDoctorSubscriptionUseCase(makeRepo(null), accrue);

      await expect(useCase.execute({ ...baseInput, months: 1 })).rejects.toThrow(
        DoctorNotFoundError,
      );
      await flushHook();

      expect(accrue.execute).not.toHaveBeenCalled();
    });

    it('still extends the subscription when the commission blows up', async () => {
      const accrue = makeAccrue(() => Promise.reject(new Error('commission db down')));
      const repo = makeRepo(makeSnapshot('delta_base', new Date('2030-06-15')));
      const useCase = new ExtendDoctorSubscriptionUseCase(repo, accrue);

      const result = await useCase.execute({ ...baseInput, months: 1 });
      await flushHook();

      expect(result.newExpiresAt).toBeDefined();
      expect(repo.applyManualSubscriptionChange).toHaveBeenCalledTimes(1);
    });
  });
});
