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
  it('extends from a future expiry and migrates trial → basic', async () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const repo = makeRepo({ doctorId: DOCTOR, plan: 'trial', status: 'trial', expiresAt: future });
    const uc = new ExtendDoctorSubscriptionUseCase(repo);

    const { newExpiresAt } = await uc.execute({ doctorId: DOCTOR, months: 1, actorId: ACTOR });

    // anchor = future, +1 month
    const expected = new Date(future);
    expected.setMonth(expected.getMonth() + 1);
    expect(newExpiresAt.getTime()).toBe(expected.getTime());
    expect(repo.applyManualSubscriptionChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'manual_grant', newStatus: 'active', newPlan: 'basic' }),
    );
  });

  it('extends from now when expired', async () => {
    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const repo = makeRepo({ doctorId: DOCTOR, plan: 'basic', status: 'past_due', expiresAt: past });
    const uc = new ExtendDoctorSubscriptionUseCase(repo);

    const before = Date.now();
    const { newExpiresAt } = await uc.execute({ doctorId: DOCTOR, months: 2, actorId: ACTOR });

    // anchor = now (not the past date)
    expect(newExpiresAt.getTime()).toBeGreaterThan(before);
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
