import { GetIntegrationStatusUseCase } from './get-integration-status.use-case';
import { GoogleIntegration } from '../../../domain/entities/google-integration.entity';
import type { IGoogleIntegrationRepository } from '../../../domain/repositories/google-integration.repository';

const makeIntegration = () =>
  GoogleIntegration.create({
    id: 'gi-1',
    doctorId: 'doc-1',
    accessToken: 'access',
    refreshToken: 'refresh',
    tokenExpiry: null,
    scope: 'calendar',
    googleEmail: 'doc@gmail.com',
    connectedAt: new Date(),
    updatedAt: new Date(),
  });

describe('GetIntegrationStatusUseCase', () => {
  let repo: jest.Mocked<IGoogleIntegrationRepository>;
  let useCase: GetIntegrationStatusUseCase;

  beforeEach(() => {
    repo = {
      findByDoctorId: jest.fn(),
      upsert: jest.fn(),
      updateTokens: jest.fn(),
      deleteByDoctorId: jest.fn(),
    } as unknown as jest.Mocked<IGoogleIntegrationRepository>;

    useCase = new GetIntegrationStatusUseCase(repo);
  });

  it('returns { connected: false } when no integration exists', async () => {
    repo.findByDoctorId.mockResolvedValue(null);
    const result = await useCase.execute('doc-1');
    expect(result).toEqual({ connected: false });
  });

  it('returns { connected: true, googleEmail } when integration exists', async () => {
    repo.findByDoctorId.mockResolvedValue(makeIntegration());
    const result = await useCase.execute('doc-1');
    expect(result.connected).toBe(true);
    expect(result.googleEmail).toBe('doc@gmail.com');
  });

  it('returns connected: true with no email when googleEmail is null', async () => {
    const integration = GoogleIntegration.create({
      id: 'gi-2',
      doctorId: 'doc-2',
      accessToken: 'a',
      refreshToken: 'r',
      tokenExpiry: null,
      scope: null,
      googleEmail: null,
      connectedAt: new Date(),
      updatedAt: new Date(),
    });
    repo.findByDoctorId.mockResolvedValue(integration);
    const result = await useCase.execute('doc-2');
    expect(result.connected).toBe(true);
    expect(result.googleEmail).toBeUndefined();
  });
});
