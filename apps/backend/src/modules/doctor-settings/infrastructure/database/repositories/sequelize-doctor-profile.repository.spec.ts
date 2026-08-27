import { SequelizeDoctorProfileRepository } from './sequelize-doctor-profile.repository';

/**
 * Focused unit tests for SequelizeDoctorProfileRepository.markOnboardingCompleted.
 *
 * Regression test for a real staging bug (2026-08): the method wrote ONLY
 * `onboarding_completed_at` (the audit timestamp), never `onboarding_completed`
 * (the boolean the frontend gate actually reads via profile.onboardingCompleted).
 * Effect: the timestamp got re-stamped on every completion attempt while the
 * flag stayed false forever — the doctor was bounced back through onboarding
 * on every page load and dropped on /doctor, losing the route they asked for.
 *
 * These tests assert on the actual object passed to `model.update`, not just
 * that it was called — a regression that writes only one of the two columns
 * again must fail here.
 */
describe('SequelizeDoctorProfileRepository.markOnboardingCompleted', () => {
  let modelMock: { update: jest.Mock };
  let repo: SequelizeDoctorProfileRepository;

  beforeEach(() => {
    modelMock = { update: jest.fn().mockResolvedValue([1]) };
    repo = new SequelizeDoctorProfileRepository(modelMock as never);
  });

  it('writes BOTH onboardingCompleted (true) and onboardingCompletedAt (a Date) in the same update call', async () => {
    await repo.markOnboardingCompleted('doctor-1');

    expect(modelMock.update).toHaveBeenCalledTimes(1);
    const [values, options] = modelMock.update.mock.calls[0] as [
      Record<string, unknown>,
      { where: { id: string } },
    ];

    // The boolean flag the frontend gate reads — this is the field the bug omitted.
    expect(values['onboardingCompleted']).toBe(true);
    // The audit timestamp — writing this alone was the bug.
    expect(values['onboardingCompletedAt']).toBeInstanceOf(Date);

    expect(options.where).toEqual({ id: 'doctor-1' });
  });

  it('does NOT write onboardingCompletedAt without also writing onboardingCompleted (regression guard)', async () => {
    await repo.markOnboardingCompleted('doctor-1');

    const values = modelMock.update.mock.calls[0]![0] as Record<string, unknown>;
    const wroteTimestampOnly =
      'onboardingCompletedAt' in values && !('onboardingCompleted' in values);
    expect(wroteTimestampOnly).toBe(false);
  });

  it('scopes the update to the given doctorId', async () => {
    await repo.markOnboardingCompleted('doctor-42');

    const options = modelMock.update.mock.calls[0]![1] as { where: { id: string } };
    expect(options.where).toEqual({ id: 'doctor-42' });
  });

  it('is idempotent — calling it twice writes the flag true both times', async () => {
    await repo.markOnboardingCompleted('doctor-1');
    await repo.markOnboardingCompleted('doctor-1');

    expect(modelMock.update).toHaveBeenCalledTimes(2);
    for (const call of modelMock.update.mock.calls) {
      const values = call[0] as Record<string, unknown>;
      expect(values['onboardingCompleted']).toBe(true);
    }
  });
});
