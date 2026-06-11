import { DisconnectGoogleUseCase } from './disconnect-google.use-case';
import type { IGoogleIntegrationRepository } from '../../../domain/repositories/google-integration.repository';

describe('DisconnectGoogleUseCase', () => {
  let repo: jest.Mocked<IGoogleIntegrationRepository>;
  let useCase: DisconnectGoogleUseCase;

  beforeEach(() => {
    repo = {
      findByDoctorId: jest.fn(),
      upsert: jest.fn(),
      updateTokens: jest.fn(),
      deleteByDoctorId: jest.fn(),
    } as unknown as jest.Mocked<IGoogleIntegrationRepository>;

    useCase = new DisconnectGoogleUseCase(repo);
  });

  it('calls deleteByDoctorId with the given doctorId', async () => {
    repo.deleteByDoctorId.mockResolvedValue(undefined);

    await useCase.execute('doc-1');

    expect(repo.deleteByDoctorId).toHaveBeenCalledWith('doc-1');
    expect(repo.deleteByDoctorId).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the doctor was not connected (delete resolves silently)', async () => {
    repo.deleteByDoctorId.mockResolvedValue(undefined);

    await expect(useCase.execute('doc-never-connected')).resolves.toBeUndefined();
  });

  it('propagates unexpected repository errors to the caller', async () => {
    repo.deleteByDoctorId.mockRejectedValue(new Error('DB connection lost'));

    await expect(useCase.execute('doc-1')).rejects.toThrow('DB connection lost');
  });
});
