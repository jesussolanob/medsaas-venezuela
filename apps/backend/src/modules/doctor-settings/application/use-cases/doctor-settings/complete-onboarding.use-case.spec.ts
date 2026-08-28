import { CompleteOnboardingUseCase } from './complete-onboarding.use-case';
import { OnboardingRequirementsNotMetError } from '../../../domain/errors/onboarding-requirements-not-met.error';
import type { IDoctorProfileRepository } from '../../../domain/repositories/doctor-profile.repository';
import type { IOfficeRepository } from '../../../../offices/domain/repositories/office.repository';
import type { IPricingPlanRepository } from '../../../../packages/domain/repositories/pricing-plan.repository';
import type { Office } from '../../../../offices/domain/entities/office.entity';
import type { PricingPlan } from '../../../../packages/domain/entities/pricing-plan.entity';
import type { AccrueSignupCommissionUseCase } from '../../../../seller-commissions/application/use-cases/accrue-signup-commission.use-case';

const DOCTOR_ID = 'doctor-onboarding-1';

// Minimal fixtures — the use case only reads `.length` on offices and
// `.isActive` on plans, so full domain entities are not needed here.
const ACTIVE_OFFICE = { id: 'office-1', isActive: true } as unknown as Office;
const ACTIVE_PLAN = { id: 'plan-1', isActive: true } as unknown as PricingPlan;
const INACTIVE_PLAN = { id: 'plan-2', isActive: false } as unknown as PricingPlan;

function makeRepos() {
  const profileRepo: jest.Mocked<IDoctorProfileRepository> = {
    findByDoctorId: jest.fn(),
    update: jest.fn(),
    updateExchangeRate: jest.fn(),
    markOnboardingCompleted: jest.fn().mockResolvedValue(undefined),
    updateBlocksLayout: jest.fn().mockResolvedValue(undefined),
    countUpcomingAppointments: jest.fn().mockResolvedValue(0),
    deactivateOwnAccount: jest.fn().mockResolvedValue(undefined),
    findPlanSnapshot: jest.fn().mockResolvedValue(null),
    scheduleOwnAccountDeactivation: jest.fn().mockResolvedValue(undefined),
    applyExpiredScheduledDeactivations: jest.fn().mockResolvedValue(0),
  };

  const officeRepo: jest.Mocked<IOfficeRepository> = {
    listByDoctor: jest.fn(),
    findByIdForDoctor: jest.fn(),
    findActiveByDoctor: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<IOfficeRepository>;

  const pricingPlanRepo: jest.Mocked<IPricingPlanRepository> = {
    findPublicByDoctorId: jest.fn(),
    findAllByDoctorId: jest.fn().mockResolvedValue([]),
    findByIdForDoctor: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<IPricingPlanRepository>;

  return { profileRepo, officeRepo, pricingPlanRepo };
}

describe('CompleteOnboardingUseCase', () => {
  let repos: ReturnType<typeof makeRepos>;
  let useCase: CompleteOnboardingUseCase;

  beforeEach(() => {
    repos = makeRepos();
    useCase = new CompleteOnboardingUseCase(
      repos.profileRepo,
      repos.officeRepo,
      repos.pricingPlanRepo,
      null, // AccrueSignupCommissionUseCase — not tested here (best-effort, @Optional)
    );
  });

  // ---------------------------------------------------------------------------
  // Requirements not met
  // ---------------------------------------------------------------------------

  it('throws OnboardingRequirementsNotMetError when there is no active office (even with an active service)', async () => {
    repos.officeRepo.findActiveByDoctor.mockResolvedValue([]);
    repos.pricingPlanRepo.findAllByDoctorId.mockResolvedValue([ACTIVE_PLAN]);

    await expect(useCase.execute(DOCTOR_ID)).rejects.toThrow(OnboardingRequirementsNotMetError);
    expect(repos.profileRepo.markOnboardingCompleted).not.toHaveBeenCalled();
  });

  it('throws OnboardingRequirementsNotMetError when there is no active service (even with an active office)', async () => {
    repos.officeRepo.findActiveByDoctor.mockResolvedValue([ACTIVE_OFFICE]);
    repos.pricingPlanRepo.findAllByDoctorId.mockResolvedValue([INACTIVE_PLAN]);

    await expect(useCase.execute(DOCTOR_ID)).rejects.toThrow(OnboardingRequirementsNotMetError);
    expect(repos.profileRepo.markOnboardingCompleted).not.toHaveBeenCalled();
  });

  it('throws OnboardingRequirementsNotMetError when neither an active office nor an active service exists', async () => {
    repos.officeRepo.findActiveByDoctor.mockResolvedValue([]);
    repos.pricingPlanRepo.findAllByDoctorId.mockResolvedValue([]);

    await expect(useCase.execute(DOCTOR_ID)).rejects.toThrow(OnboardingRequirementsNotMetError);
    expect(repos.profileRepo.markOnboardingCompleted).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Requirements met
  // ---------------------------------------------------------------------------

  it('marks onboarding completed and returns { onboardingCompleted: true } when both requirements are met', async () => {
    repos.officeRepo.findActiveByDoctor.mockResolvedValue([ACTIVE_OFFICE]);
    repos.pricingPlanRepo.findAllByDoctorId.mockResolvedValue([INACTIVE_PLAN, ACTIVE_PLAN]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(repos.profileRepo.markOnboardingCompleted).toHaveBeenCalledTimes(1);
    expect(repos.profileRepo.markOnboardingCompleted).toHaveBeenCalledWith(DOCTOR_ID);
    expect(result).toEqual({ onboardingCompleted: true });
  });

  // ---------------------------------------------------------------------------
  // Anti-IDOR — always the doctorId passed in, never derived from anything else
  // ---------------------------------------------------------------------------

  it('always queries and marks completion for the exact doctorId passed in (anti-IDOR)', async () => {
    const anotherDoctorId = 'doctor-onboarding-2';
    repos.officeRepo.findActiveByDoctor.mockResolvedValue([ACTIVE_OFFICE]);
    repos.pricingPlanRepo.findAllByDoctorId.mockResolvedValue([ACTIVE_PLAN]);

    await useCase.execute(anotherDoctorId);

    expect(repos.officeRepo.findActiveByDoctor).toHaveBeenCalledWith(anotherDoctorId);
    expect(repos.pricingPlanRepo.findAllByDoctorId).toHaveBeenCalledWith(anotherDoctorId);
    expect(repos.profileRepo.markOnboardingCompleted).toHaveBeenCalledWith(anotherDoctorId);
  });

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------

  it('is idempotent — calling it twice with requirements met does not throw and marks completion both times', async () => {
    repos.officeRepo.findActiveByDoctor.mockResolvedValue([ACTIVE_OFFICE]);
    repos.pricingPlanRepo.findAllByDoctorId.mockResolvedValue([ACTIVE_PLAN]);

    const first = await useCase.execute(DOCTOR_ID);
    const second = await useCase.execute(DOCTOR_ID);

    expect(first).toEqual({ onboardingCompleted: true });
    expect(second).toEqual({ onboardingCompleted: true });
    expect(repos.profileRepo.markOnboardingCompleted).toHaveBeenCalledTimes(2);
  });

  // ---------------------------------------------------------------------------
  // Signup commission hook — fire-and-forget, must never affect the response
  // ---------------------------------------------------------------------------

  describe('signup commission hook', () => {
    // The hook is dispatched with `void ... .catch()`, so it settles on the
    // microtask queue AFTER execute() resolves. Every assertion has to flush it.
    const flushHook = () => new Promise((resolve) => setImmediate(resolve));

    function makeAccrue(impl?: () => Promise<unknown>) {
      return {
        execute: jest.fn(impl ?? (() => Promise.resolve('created'))),
      } as unknown as jest.Mocked<AccrueSignupCommissionUseCase>;
    }

    function makeUseCase(accrue: AccrueSignupCommissionUseCase | null) {
      repos.officeRepo.findActiveByDoctor.mockResolvedValue([ACTIVE_OFFICE]);
      repos.pricingPlanRepo.findAllByDoctorId.mockResolvedValue([ACTIVE_PLAN]);
      return new CompleteOnboardingUseCase(
        repos.profileRepo,
        repos.officeRepo,
        repos.pricingPlanRepo,
        accrue,
      );
    }

    it('accrues the signup commission for the completing doctor', async () => {
      const accrue = makeAccrue();

      await makeUseCase(accrue).execute(DOCTOR_ID);
      await flushHook();

      expect(accrue.execute).toHaveBeenCalledTimes(1);
      expect(accrue.execute).toHaveBeenCalledWith(DOCTOR_ID);
    });

    it('does NOT accrue when the requirements are not met', async () => {
      const accrue = makeAccrue();
      repos.officeRepo.findActiveByDoctor.mockResolvedValue([]);
      repos.pricingPlanRepo.findAllByDoctorId.mockResolvedValue([]);
      const useCaseWithHook = new CompleteOnboardingUseCase(
        repos.profileRepo,
        repos.officeRepo,
        repos.pricingPlanRepo,
        accrue,
      );

      await expect(useCaseWithHook.execute(DOCTOR_ID)).rejects.toThrow(
        OnboardingRequirementsNotMetError,
      );
      await flushHook();

      expect(accrue.execute).not.toHaveBeenCalled();
    });

    it('still completes the onboarding when the commission blows up', async () => {
      const accrue = makeAccrue(() => Promise.reject(new Error('commission db down')));

      const result = await makeUseCase(accrue).execute(DOCTOR_ID);
      await flushHook();

      // The specialist gets through even though the commission failed.
      expect(result).toEqual({ onboardingCompleted: true });
      expect(repos.profileRepo.markOnboardingCompleted).toHaveBeenCalledWith(DOCTOR_ID);
    });

    it('completes the onboarding when no commission use case is wired at all', async () => {
      const result = await makeUseCase(null).execute(DOCTOR_ID);

      expect(result).toEqual({ onboardingCompleted: true });
    });
  });
});
