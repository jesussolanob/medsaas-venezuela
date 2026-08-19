import { ExtendDoctorSubscriptionUseCase } from './extend-doctor-subscription.use-case';
import { SuspendDoctorSubscriptionUseCase } from './suspend-doctor-subscription.use-case';
import { ReactivateDoctorSubscriptionUseCase } from './reactivate-doctor-subscription.use-case';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import type {
  IAdminRepository,
  SubscriptionSnapshot,
} from '../../../domain/repositories/admin.repository';

const DOCTOR = 'dddddddd-0000-0000-0000-000000000001';
const ACTOR = 'aaaaaaaa-0000-0000-0000-000000000001';

function makeRepo(snapshot: SubscriptionSnapshot | null) {
  return {
    getSubscriptionSnapshot: jest.fn().mockResolvedValue(snapshot),
    applyManualSubscriptionChange: jest.fn().mockResolvedValue(undefined),
  } as unknown as IAdminRepository & {
    getSubscriptionSnapshot: jest.Mock;
    applyManualSubscriptionChange: jest.Mock;
  };
}

describe('ExtendDoctorSubscriptionUseCase', () => {
  it('extends from a future expiry by months and migrates trial → basic', async () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const repo = makeRepo({ doctorId: DOCTOR, plan: 'trial', status: 'trial', expiresAt: future });
    const uc = new ExtendDoctorSubscriptionUseCase(repo);

    const { newExpiresAt } = await uc.execute({ doctorId: DOCTOR, months: 1, actorId: ACTOR });

    // anchor = future; clamp month addition to avoid JS overflow
    const expected = new Date(future);
    const originalDay = expected.getDate();
    expected.setDate(1);
    expected.setMonth(expected.getMonth() + 1);
    const lastDay = new Date(expected.getFullYear(), expected.getMonth() + 1, 0).getDate();
    expected.setDate(Math.min(originalDay, lastDay));

    expect(newExpiresAt.getTime()).toBe(expected.getTime());
    expect(repo.applyManualSubscriptionChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'manual_grant', newStatus: 'active', newPlan: 'basic' }),
    );
  });

  it('extends from now when expired (months)', async () => {
    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const repo = makeRepo({ doctorId: DOCTOR, plan: 'basic', status: 'past_due', expiresAt: past });
    const uc = new ExtendDoctorSubscriptionUseCase(repo);

    const before = Date.now();
    const { newExpiresAt } = await uc.execute({ doctorId: DOCTOR, months: 2, actorId: ACTOR });

    // anchor = now (not the past date)
    expect(newExpiresAt.getTime()).toBeGreaterThan(before);
  });

  it('extends from a future expiry by days', async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const repo = makeRepo({ doctorId: DOCTOR, plan: 'basic', status: 'active', expiresAt: future });
    const uc = new ExtendDoctorSubscriptionUseCase(repo);

    const { newExpiresAt } = await uc.execute({ doctorId: DOCTOR, days: 10, actorId: ACTOR });

    const expected = new Date(future);
    expected.setDate(expected.getDate() + 10);
    expect(newExpiresAt.getTime()).toBe(expected.getTime());
  });

  it('stores days_added in metadata when extending by days', async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const repo = makeRepo({ doctorId: DOCTOR, plan: 'basic', status: 'active', expiresAt: future });
    const uc = new ExtendDoctorSubscriptionUseCase(repo);

    await uc.execute({ doctorId: DOCTOR, days: 7, actorId: ACTOR });

    expect(repo.applyManualSubscriptionChange).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { days_added: 7 } }),
    );
  });

  it('stores months_added in metadata when extending by months', async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const repo = makeRepo({ doctorId: DOCTOR, plan: 'basic', status: 'active', expiresAt: future });
    const uc = new ExtendDoctorSubscriptionUseCase(repo);

    await uc.execute({ doctorId: DOCTOR, months: 3, actorId: ACTOR });

    expect(repo.applyManualSubscriptionChange).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { months_added: 3 } }),
    );
  });

  it('does not overflow into March when Jan 31 + 1 month', async () => {
    // Jan 31, 2027 + 1 month must land on Feb 28, 2027, not March 3
    const jan31 = new Date(2027, 0, 31); // January 31, 2027
    const repo = makeRepo({ doctorId: DOCTOR, plan: 'basic', status: 'active', expiresAt: jan31 });
    const uc = new ExtendDoctorSubscriptionUseCase(repo);

    const { newExpiresAt } = await uc.execute({ doctorId: DOCTOR, months: 1, actorId: ACTOR });

    expect(newExpiresAt.getFullYear()).toBe(2027);
    expect(newExpiresAt.getMonth()).toBe(1); // February (0-indexed)
    expect(newExpiresAt.getDate()).toBe(28);
  });

  it('throws DoctorNotFoundError when no snapshot', async () => {
    const uc = new ExtendDoctorSubscriptionUseCase(makeRepo(null));
    await expect(
      uc.execute({ doctorId: DOCTOR, months: 1, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(DoctorNotFoundError);
  });
});

describe('SuspendDoctorSubscriptionUseCase', () => {
  it('suspends an existing subscription', async () => {
    const repo = makeRepo({ doctorId: DOCTOR, plan: 'basic', status: 'active', expiresAt: null });
    const uc = new SuspendDoctorSubscriptionUseCase(repo);

    await uc.execute({ doctorId: DOCTOR, actorId: ACTOR, reason: 'impago' });

    expect(repo.applyManualSubscriptionChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'suspended', newStatus: 'suspended', reason: 'impago' }),
    );
  });

  it('throws DoctorNotFoundError when no snapshot', async () => {
    const uc = new SuspendDoctorSubscriptionUseCase(makeRepo(null));
    await expect(uc.execute({ doctorId: DOCTOR, actorId: ACTOR })).rejects.toBeInstanceOf(
      DoctorNotFoundError,
    );
  });
});

describe('ReactivateDoctorSubscriptionUseCase', () => {
  it('reactivates without extending when not expired', async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const repo = makeRepo({
      doctorId: DOCTOR,
      plan: 'basic',
      status: 'suspended',
      expiresAt: future,
    });
    const uc = new ReactivateDoctorSubscriptionUseCase(repo);

    const { newExpiresAt } = await uc.execute({ doctorId: DOCTOR, actorId: ACTOR });

    expect(newExpiresAt).toBeNull();
    expect(repo.applyManualSubscriptionChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reactivated', newStatus: 'active' }),
    );
  });

  it('grants a fresh month when expired', async () => {
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const repo = makeRepo({
      doctorId: DOCTOR,
      plan: 'basic',
      status: 'suspended',
      expiresAt: past,
    });
    const uc = new ReactivateDoctorSubscriptionUseCase(repo);

    const { newExpiresAt } = await uc.execute({ doctorId: DOCTOR, actorId: ACTOR });

    expect(newExpiresAt).not.toBeNull();
    expect(newExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('throws DoctorNotFoundError when no snapshot', async () => {
    const uc = new ReactivateDoctorSubscriptionUseCase(makeRepo(null));
    await expect(uc.execute({ doctorId: DOCTOR, actorId: ACTOR })).rejects.toBeInstanceOf(
      DoctorNotFoundError,
    );
  });
});
