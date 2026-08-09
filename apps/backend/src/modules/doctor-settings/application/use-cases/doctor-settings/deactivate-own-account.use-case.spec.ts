import { DeactivateOwnAccountUseCase } from './deactivate-own-account.use-case';
import type { IDoctorProfileRepository } from '../../../domain/repositories/doctor-profile.repository';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';
import { AccountHasUpcomingAppointmentsError } from '../../../domain/errors/account-has-upcoming-appointments.error';
import { CannotDeactivateRoleError } from '../../../domain/errors/cannot-deactivate-role.error';

const DOCTOR_ID = '11111111-1111-4111-8111-111111111111';

function makeRepo(overrides: Partial<IDoctorProfileRepository> = {}) {
  return {
    findByDoctorId: jest.fn().mockResolvedValue({ id: DOCTOR_ID }),
    update: jest.fn(),
    updateExchangeRate: jest.fn(),
    markOnboardingCompleted: jest.fn(),
    updateBlocksLayout: jest.fn(),
    countUpcomingAppointments: jest.fn().mockResolvedValue(0),
    deactivateOwnAccount: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<IDoctorProfileRepository>;
}

describe('DeactivateOwnAccountUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Happy path
  // =========================================================================

  it('switches the account off and reports success', async () => {
    const repo = makeRepo();
    const useCase = new DeactivateOwnAccountUseCase(repo);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      role: 'doctor',
      reason: 'Me mudo de país',
    });

    expect(result).toEqual({ deactivated: true });
    expect(repo.deactivateOwnAccount).toHaveBeenCalledWith(DOCTOR_ID, 'Me mudo de país');
  });

  it('stores a blank reason as null rather than an empty string', async () => {
    const repo = makeRepo();
    const useCase = new DeactivateOwnAccountUseCase(repo);

    await useCase.execute({ doctorId: DOCTOR_ID, role: 'doctor', reason: '   ' });

    expect(repo.deactivateOwnAccount).toHaveBeenCalledWith(DOCTOR_ID, null);
  });

  it('accepts an absent reason', async () => {
    const repo = makeRepo();
    const useCase = new DeactivateOwnAccountUseCase(repo);

    await useCase.execute({ doctorId: DOCTOR_ID, role: 'doctor' });

    expect(repo.deactivateOwnAccount).toHaveBeenCalledWith(DOCTOR_ID, null);
  });

  // =========================================================================
  // Upcoming appointments block the exit
  // =========================================================================

  it('refuses to deactivate while patients are still booked ahead', async () => {
    const repo = makeRepo({
      countUpcomingAppointments: jest.fn().mockResolvedValue(3),
    } as Partial<IDoctorProfileRepository>);
    const useCase = new DeactivateOwnAccountUseCase(repo);

    await expect(useCase.execute({ doctorId: DOCTOR_ID, role: 'doctor' })).rejects.toBeInstanceOf(
      AccountHasUpcomingAppointmentsError,
    );
  });

  // The whole point of the block is that nothing gets written. A use case that
  // threw *after* switching the account off would strand the patients anyway.
  it('does not touch the account when the deactivation is refused', async () => {
    const repo = makeRepo({
      countUpcomingAppointments: jest.fn().mockResolvedValue(1),
    } as Partial<IDoctorProfileRepository>);
    const useCase = new DeactivateOwnAccountUseCase(repo);

    await useCase.execute({ doctorId: DOCTOR_ID, role: 'doctor' }).catch(() => undefined);

    expect(repo.deactivateOwnAccount).not.toHaveBeenCalled();
  });

  it('carries the real count so the UI can name it', async () => {
    const repo = makeRepo({
      countUpcomingAppointments: jest.fn().mockResolvedValue(7),
    } as Partial<IDoctorProfileRepository>);
    const useCase = new DeactivateOwnAccountUseCase(repo);

    const error = (await useCase
      .execute({ doctorId: DOCTOR_ID, role: 'doctor' })
      .catch((e: unknown) => e)) as AccountHasUpcomingAppointmentsError;

    expect(error.upcomingCount).toBe(7);
    expect(error.message).toContain('7');
    expect(error.code).toBe('ACCOUNT_HAS_UPCOMING_APPOINTMENTS');
  });

  it('uses the singular wording for exactly one appointment', async () => {
    const repo = makeRepo({
      countUpcomingAppointments: jest.fn().mockResolvedValue(1),
    } as Partial<IDoctorProfileRepository>);
    const useCase = new DeactivateOwnAccountUseCase(repo);

    const error = (await useCase
      .execute({ doctorId: DOCTOR_ID, role: 'doctor' })
      .catch((e: unknown) => e)) as AccountHasUpcomingAppointmentsError;

    expect(error.message).toContain('1 cita agendada');
    expect(error.message).not.toContain('citas');
  });

  // =========================================================================
  // Role and existence guards
  // =========================================================================

  it('refuses a super_admin — reactivation happens from the panel it would lose', async () => {
    const repo = makeRepo();
    const useCase = new DeactivateOwnAccountUseCase(repo);

    await expect(
      useCase.execute({ doctorId: DOCTOR_ID, role: 'super_admin' }),
    ).rejects.toBeInstanceOf(CannotDeactivateRoleError);
    expect(repo.deactivateOwnAccount).not.toHaveBeenCalled();
  });

  it('refuses a patient', async () => {
    const repo = makeRepo();
    const useCase = new DeactivateOwnAccountUseCase(repo);

    await expect(useCase.execute({ doctorId: DOCTOR_ID, role: 'patient' })).rejects.toBeInstanceOf(
      CannotDeactivateRoleError,
    );
  });

  it('throws when the profile does not exist', async () => {
    const repo = makeRepo({
      findByDoctorId: jest.fn().mockResolvedValue(null),
    } as Partial<IDoctorProfileRepository>);
    const useCase = new DeactivateOwnAccountUseCase(repo);

    await expect(useCase.execute({ doctorId: DOCTOR_ID, role: 'doctor' })).rejects.toBeInstanceOf(
      DoctorProfileNotFoundError,
    );
    expect(repo.deactivateOwnAccount).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Anti-IDOR
  // =========================================================================

  it('only ever acts on the id it was given', async () => {
    const repo = makeRepo();
    const useCase = new DeactivateOwnAccountUseCase(repo);

    await useCase.execute({ doctorId: DOCTOR_ID, role: 'doctor' });

    expect(repo.countUpcomingAppointments).toHaveBeenCalledWith(DOCTOR_ID);
    expect(repo.deactivateOwnAccount).toHaveBeenCalledWith(DOCTOR_ID, null);
  });
});
