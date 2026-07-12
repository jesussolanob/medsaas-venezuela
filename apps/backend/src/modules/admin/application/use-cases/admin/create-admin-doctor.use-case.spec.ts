import { CreateAdminDoctorUseCase } from './create-admin-doctor.use-case';
import type {
  IAdminRepository,
  AdminCreatedDoctorResult,
} from '../../../domain/repositories/admin.repository';

const makeResult = (plan = 'free_trial'): AdminCreatedDoctorResult => ({
  id: 'uuid-1',
  fullName: 'Dr. Test',
  email: 'dr.test@example.com',
  specialty: 'Cardiología',
  cedula: 'V-12345678',
  plan: plan as AdminCreatedDoctorResult['plan'],
  subscriptionStatus: 'trialing',
  subscriptionExpiresAt: new Date('2026-08-11'),
  createdAt: new Date('2026-07-12'),
});

const makeRepo = (
  result: AdminCreatedDoctorResult = makeResult(),
): jest.Mocked<Pick<IAdminRepository, 'createAdminDoctor'>> => ({
  createAdminDoctor: jest.fn().mockResolvedValue(result),
});

describe('CreateAdminDoctorUseCase', () => {
  it('delegates to adminRepo.createAdminDoctor with a generated UUID', async () => {
    const repo = makeRepo();
    const useCase = new CreateAdminDoctorUseCase(repo as unknown as IAdminRepository);

    await useCase.execute({
      fullName: 'Dr. Test',
      email: 'Dr.Test@Example.com',
      specialty: 'Cardiología',
      cedula: 'V-12345678',
      plan: 'free_trial',
    });

    expect(repo.createAdminDoctor).toHaveBeenCalledTimes(1);
    const callArg = repo.createAdminDoctor.mock.calls[0]?.[0];
    // id must be a UUID v4 format
    expect(callArg?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    // email is lowercased + trimmed
    expect(callArg?.email).toBe('dr.test@example.com');
    expect(callArg?.plan).toBe('free_trial');
  });

  it('passes undefined plan when none is supplied (repo uses default)', async () => {
    const repo = makeRepo();
    const useCase = new CreateAdminDoctorUseCase(repo as unknown as IAdminRepository);

    await useCase.execute({ fullName: 'Dr. Free', email: 'free@example.com' });

    const callArg = repo.createAdminDoctor.mock.calls[0]?.[0];
    expect(callArg?.plan).toBeUndefined();
  });

  it('passes delta_base plan to the repo', async () => {
    const repo = makeRepo(makeResult('delta_base'));
    const useCase = new CreateAdminDoctorUseCase(repo as unknown as IAdminRepository);

    const result = await useCase.execute({
      fullName: 'Dr. Base',
      email: 'base@example.com',
      plan: 'delta_base',
    });

    expect(repo.createAdminDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'delta_base' }),
    );
    expect(result.plan).toBe('delta_base');
  });

  it('passes delta_free plan to the repo', async () => {
    const repo = makeRepo(makeResult('delta_free'));
    const useCase = new CreateAdminDoctorUseCase(repo as unknown as IAdminRepository);

    await useCase.execute({ fullName: 'Dr. Free', email: 'dfree@example.com', plan: 'delta_free' });

    expect(repo.createAdminDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'delta_free' }),
    );
  });

  it('passes delta_plus plan to the repo', async () => {
    const repo = makeRepo(makeResult('delta_plus'));
    const useCase = new CreateAdminDoctorUseCase(repo as unknown as IAdminRepository);

    await useCase.execute({ fullName: 'Dr. Plus', email: 'plus@example.com', plan: 'delta_plus' });

    expect(repo.createAdminDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'delta_plus' }),
    );
  });

  it('passes null for optional fields when not supplied', async () => {
    const repo = makeRepo();
    const useCase = new CreateAdminDoctorUseCase(repo as unknown as IAdminRepository);

    await useCase.execute({ fullName: 'Dr. Minimal', email: 'minimal@example.com' });

    const callArg = repo.createAdminDoctor.mock.calls[0]?.[0];
    expect(callArg?.specialty).toBeNull();
    expect(callArg?.cedula).toBeNull();
    expect(callArg?.phone).toBeNull();
  });

  it('propagates errors thrown by the repo (e.g. DoctorEmailConflictError)', async () => {
    const err = new Error('DOCTOR_EMAIL_CONFLICT');
    const repo = {
      createAdminDoctor: jest.fn().mockRejectedValue(err),
    } as unknown as IAdminRepository;
    const useCase = new CreateAdminDoctorUseCase(repo);

    await expect(useCase.execute({ fullName: 'Dup', email: 'dup@example.com' })).rejects.toThrow(
      'DOCTOR_EMAIL_CONFLICT',
    );
  });
});
