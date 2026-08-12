import { ProcessLoginTouchUseCase } from './process-login-touch.use-case';
import type { ILoginTouchRepository } from '../../domain/repositories/login-touch.repository';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROFILE_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const DOCTOR_ID = PROFILE_ID; // doctor's profile id == doctor_id on subscription

function makeRepo(): jest.Mocked<ILoginTouchRepository> {
  return {
    findAccountState: jest.fn().mockResolvedValue({ isActive: true, deactivatedBy: null }),
    reactivateAsFreeAndTouch: jest.fn(),
    findSubscriptionByDoctorId: jest.fn(),
    findPlanConfigByKey: jest.fn(),
    persistDowngradeAndTouch: jest.fn(),
    touchLastSignInAt: jest.fn(),
  } as jest.Mocked<ILoginTouchRepository>;
}

function pastDate(daysAgo = 5): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

function futureDate(daysFromNow = 30): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProcessLoginTouchUseCase', () => {
  let repo: jest.Mocked<ILoginTouchRepository>;
  let useCase: ProcessLoginTouchUseCase;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new ProcessLoginTouchUseCase(repo);
    repo.touchLastSignInAt.mockResolvedValue(undefined);
    repo.persistDowngradeAndTouch.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // (a) last_sign_in_at is updated — non-doctor path
  // -------------------------------------------------------------------------
  it('updates last_sign_in_at for a non-doctor (admin) without checking subscriptions', async () => {
    const result = await useCase.execute({ profileId: PROFILE_ID, role: 'super_admin' });

    expect(repo.touchLastSignInAt).toHaveBeenCalledWith(PROFILE_ID);
    expect(repo.findSubscriptionByDoctorId).not.toHaveBeenCalled();
    expect(result).toEqual({ downgraded: false });
  });

  it('updates last_sign_in_at for a patient without checking subscriptions', async () => {
    const result = await useCase.execute({ profileId: PROFILE_ID, role: 'patient' });

    expect(repo.touchLastSignInAt).toHaveBeenCalledWith(PROFILE_ID);
    expect(repo.findSubscriptionByDoctorId).not.toHaveBeenCalled();
    expect(result).toEqual({ downgraded: false });
  });

  it('updates last_sign_in_at for a doctor with no subscription row', async () => {
    repo.findSubscriptionByDoctorId.mockResolvedValue(null);

    const result = await useCase.execute({ profileId: PROFILE_ID, role: 'doctor' });

    expect(repo.touchLastSignInAt).toHaveBeenCalledWith(PROFILE_ID);
    expect(repo.persistDowngradeAndTouch).not.toHaveBeenCalled();
    expect(result).toEqual({ downgraded: false });
  });

  // -------------------------------------------------------------------------
  // (b) Expired active subscription → downgraded to past_due + log
  // -------------------------------------------------------------------------
  it('downgrades an expired active subscription and records the change', async () => {
    repo.findSubscriptionByDoctorId.mockResolvedValue({
      id: 'sub-1',
      doctorId: DOCTOR_ID,
      status: 'active',
      currentPeriodEnd: pastDate(),
      plan: 'basic',
    });
    repo.findPlanConfigByKey.mockResolvedValue({ planKey: 'basic', isPermanent: false });

    const result = await useCase.execute({ profileId: PROFILE_ID, role: 'doctor' });

    expect(repo.persistDowngradeAndTouch).toHaveBeenCalledWith(PROFILE_ID, DOCTOR_ID);
    expect(repo.touchLastSignInAt).not.toHaveBeenCalled();
    expect(result).toEqual({ downgraded: true });
  });

  it('downgrades an expired trial subscription', async () => {
    repo.findSubscriptionByDoctorId.mockResolvedValue({
      id: 'sub-2',
      doctorId: DOCTOR_ID,
      status: 'trial',
      currentPeriodEnd: pastDate(10),
      plan: 'trial',
    });
    repo.findPlanConfigByKey.mockResolvedValue({ planKey: 'trial', isPermanent: false });

    const result = await useCase.execute({ profileId: PROFILE_ID, role: 'doctor' });

    expect(repo.persistDowngradeAndTouch).toHaveBeenCalledWith(PROFILE_ID, DOCTOR_ID);
    expect(result).toEqual({ downgraded: true });
  });

  it('downgrades an expired trialing subscription', async () => {
    repo.findSubscriptionByDoctorId.mockResolvedValue({
      id: 'sub-3',
      doctorId: DOCTOR_ID,
      status: 'trialing',
      currentPeriodEnd: pastDate(1),
      plan: 'basic',
    });
    repo.findPlanConfigByKey.mockResolvedValue({ planKey: 'basic', isPermanent: false });

    const result = await useCase.execute({ profileId: PROFILE_ID, role: 'doctor' });

    expect(repo.persistDowngradeAndTouch).toHaveBeenCalledWith(PROFILE_ID, DOCTOR_ID);
    expect(result).toEqual({ downgraded: true });
  });

  it('downgrades an expired free_trial (trialing status) to past_due on login', async () => {
    // free_trial plan: assigned at registration, status=trialing, expires after 30 days
    repo.findSubscriptionByDoctorId.mockResolvedValue({
      id: 'sub-free-trial',
      doctorId: DOCTOR_ID,
      status: 'trialing',
      currentPeriodEnd: pastDate(1), // 1 day past the 30-day window
      plan: 'free_trial',
    });
    repo.findPlanConfigByKey.mockResolvedValue({ planKey: 'free_trial', isPermanent: false });

    const result = await useCase.execute({ profileId: PROFILE_ID, role: 'doctor' });

    // persistDowngradeAndTouch flips status to past_due;
    // the features resolver then shows delta_free features (lazy downgrade).
    expect(repo.persistDowngradeAndTouch).toHaveBeenCalledWith(PROFILE_ID, DOCTOR_ID);
    expect(result).toEqual({ downgraded: true });
  });

  it('does NOT downgrade a valid free_trial within its 30-day window', async () => {
    repo.findSubscriptionByDoctorId.mockResolvedValue({
      id: 'sub-free-trial-active',
      doctorId: DOCTOR_ID,
      status: 'trialing',
      currentPeriodEnd: futureDate(25), // still 25 days to go
      plan: 'free_trial',
    });

    const result = await useCase.execute({ profileId: PROFILE_ID, role: 'doctor' });

    expect(repo.persistDowngradeAndTouch).not.toHaveBeenCalled();
    expect(repo.touchLastSignInAt).toHaveBeenCalledWith(PROFILE_ID);
    expect(result).toEqual({ downgraded: false });
  });

  // -------------------------------------------------------------------------
  // (c) Permanent plan → never downgraded
  // -------------------------------------------------------------------------
  it('does NOT downgrade when the plan is permanent, even if currentPeriodEnd is past', async () => {
    repo.findSubscriptionByDoctorId.mockResolvedValue({
      id: 'sub-perm',
      doctorId: DOCTOR_ID,
      status: 'active',
      currentPeriodEnd: pastDate(100),
      plan: 'delta_free',
    });
    repo.findPlanConfigByKey.mockResolvedValue({ planKey: 'delta_free', isPermanent: true });

    const result = await useCase.execute({ profileId: PROFILE_ID, role: 'doctor' });

    expect(repo.persistDowngradeAndTouch).not.toHaveBeenCalled();
    expect(repo.touchLastSignInAt).toHaveBeenCalledWith(PROFILE_ID);
    expect(result).toEqual({ downgraded: false });
  });

  // -------------------------------------------------------------------------
  // (d) Subscription not yet expired → no change
  // -------------------------------------------------------------------------
  it('does NOT downgrade when subscription is active and not expired', async () => {
    repo.findSubscriptionByDoctorId.mockResolvedValue({
      id: 'sub-valid',
      doctorId: DOCTOR_ID,
      status: 'active',
      currentPeriodEnd: futureDate(15),
      plan: 'basic',
    });

    const result = await useCase.execute({ profileId: PROFILE_ID, role: 'doctor' });

    expect(repo.persistDowngradeAndTouch).not.toHaveBeenCalled();
    expect(repo.touchLastSignInAt).toHaveBeenCalledWith(PROFILE_ID);
    expect(result).toEqual({ downgraded: false });
  });

  it('does NOT downgrade when subscription status is already past_due', async () => {
    repo.findSubscriptionByDoctorId.mockResolvedValue({
      id: 'sub-past',
      doctorId: DOCTOR_ID,
      status: 'past_due',
      currentPeriodEnd: pastDate(20),
      plan: 'basic',
    });

    const result = await useCase.execute({ profileId: PROFILE_ID, role: 'doctor' });

    // past_due is not in EXPIRABLE_STATUSES — no downgrade attempt
    expect(repo.persistDowngradeAndTouch).not.toHaveBeenCalled();
    expect(repo.touchLastSignInAt).toHaveBeenCalledWith(PROFILE_ID);
    expect(result).toEqual({ downgraded: false });
  });

  it('does NOT downgrade when subscription status is suspended', async () => {
    repo.findSubscriptionByDoctorId.mockResolvedValue({
      id: 'sub-susp',
      doctorId: DOCTOR_ID,
      status: 'suspended',
      currentPeriodEnd: pastDate(5),
      plan: 'basic',
    });

    const result = await useCase.execute({ profileId: PROFILE_ID, role: 'doctor' });

    expect(repo.persistDowngradeAndTouch).not.toHaveBeenCalled();
    expect(repo.touchLastSignInAt).toHaveBeenCalledWith(PROFILE_ID);
    expect(result).toEqual({ downgraded: false });
  });

  it('does NOT downgrade when subscription status is cancelled', async () => {
    repo.findSubscriptionByDoctorId.mockResolvedValue({
      id: 'sub-cancel',
      doctorId: DOCTOR_ID,
      status: 'cancelled',
      currentPeriodEnd: pastDate(5),
      plan: 'basic',
    });

    const result = await useCase.execute({ profileId: PROFILE_ID, role: 'doctor' });

    expect(repo.persistDowngradeAndTouch).not.toHaveBeenCalled();
    expect(repo.touchLastSignInAt).toHaveBeenCalledWith(PROFILE_ID);
    expect(result).toEqual({ downgraded: false });
  });

  // -------------------------------------------------------------------------
  // (e) Plan config missing (treated as non-permanent — downgrade still runs)
  // -------------------------------------------------------------------------
  it('still downgrades when plan config row is missing (treated as non-permanent)', async () => {
    repo.findSubscriptionByDoctorId.mockResolvedValue({
      id: 'sub-unknown',
      doctorId: DOCTOR_ID,
      status: 'active',
      currentPeriodEnd: pastDate(3),
      plan: 'unknown_plan',
    });
    repo.findPlanConfigByKey.mockResolvedValue(null);

    const result = await useCase.execute({ profileId: PROFILE_ID, role: 'doctor' });

    expect(repo.persistDowngradeAndTouch).toHaveBeenCalledWith(PROFILE_ID, DOCTOR_ID);
    expect(result).toEqual({ downgraded: true });
  });
});

describe('ProcessLoginTouchUseCase — reingreso tras darse de baja', () => {
  it('reactiva en plan gratuito la cuenta que el propio especialista dio de baja', async () => {
    const repo = makeRepo();
    repo.findAccountState.mockResolvedValue({ isActive: false, deactivatedBy: 'self' });
    const useCase = new ProcessLoginTouchUseCase(repo);

    const result = await useCase.execute({ profileId: PROFILE_ID, role: 'doctor' });

    expect(repo.reactivateAsFreeAndTouch).toHaveBeenCalledWith(PROFILE_ID, 'delta_free');
    expect(result.reactivated).toBe(true);
    // No sigue con la lógica de vencimiento: la cuenta ya quedó en el plan gratuito.
    expect(repo.findSubscriptionByDoctorId).not.toHaveBeenCalled();
  });

  it('NO reactiva una cuenta bloqueada por un administrador', async () => {
    const repo = makeRepo();
    repo.findAccountState.mockResolvedValue({ isActive: false, deactivatedBy: 'admin' });
    const useCase = new ProcessLoginTouchUseCase(repo);

    const result = await useCase.execute({ profileId: PROFILE_ID, role: 'doctor' });

    expect(repo.reactivateAsFreeAndTouch).not.toHaveBeenCalled();
    expect(result.reactivated).toBeUndefined();
  });

  it('no toca la cuenta de un paciente ni la de un admin', async () => {
    const repo = makeRepo();
    repo.findAccountState.mockResolvedValue({ isActive: false, deactivatedBy: 'self' });
    const useCase = new ProcessLoginTouchUseCase(repo);

    await useCase.execute({ profileId: PROFILE_ID, role: 'patient' });

    expect(repo.reactivateAsFreeAndTouch).not.toHaveBeenCalled();
    expect(repo.touchLastSignInAt).toHaveBeenCalledWith(PROFILE_ID);
  });
});
