import { ConnectGoogleUseCase } from './connect-google.use-case';
import { GoogleIntegration } from '../../../domain/entities/google-integration.entity';
import type { IGoogleIntegrationRepository } from '../../../domain/repositories/google-integration.repository';
import type { GoogleCalendarService } from '../../../infrastructure/google/google-calendar.service';

describe('ConnectGoogleUseCase', () => {
  let repo: jest.Mocked<IGoogleIntegrationRepository>;
  let googleService: jest.Mocked<GoogleCalendarService>;
  let useCase: ConnectGoogleUseCase;

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

  beforeEach(() => {
    repo = {
      findByDoctorId: jest.fn(),
      upsert: jest.fn(),
      updateTokens: jest.fn(),
      deleteByDoctorId: jest.fn(),
    } as unknown as jest.Mocked<IGoogleIntegrationRepository>;

    googleService = {
      isConfigured: jest.fn().mockReturnValue(true),
      exchangeCode: jest.fn(),
      refreshAccessToken: jest.fn(),
      createEventWithMeet: jest.fn(),
      cancelEvent: jest.fn(),
    } as unknown as jest.Mocked<GoogleCalendarService>;

    useCase = new ConnectGoogleUseCase(repo, googleService);
  });

  it('exchanges code and upserts integration', async () => {
    googleService.exchangeCode.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      tokenExpiry: new Date(),
      scope: 'calendar',
      googleEmail: 'doc@gmail.com',
    });
    repo.upsert.mockResolvedValue(makeIntegration());

    const result = await useCase.execute('doc-1', 'auth-code');

    expect(googleService.exchangeCode).toHaveBeenCalledWith('auth-code');
    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: 'doc-1', googleEmail: 'doc@gmail.com' }),
    );
    expect(result.connected).toBe(true);
    expect(result.googleEmail).toBe('doc@gmail.com');
  });

  it('propagates exchange errors to the caller', async () => {
    googleService.exchangeCode.mockRejectedValue(new Error('Invalid code'));
    await expect(useCase.execute('doc-1', 'bad-code')).rejects.toThrow('Invalid code');
  });

  it('second connection call updates existing integration (upsert by doctorId)', async () => {
    const firstIntegration = makeIntegration();
    const updatedIntegration = GoogleIntegration.create({
      ...firstIntegration,
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      googleEmail: 'updated@gmail.com',
      connectedAt: new Date(),
      updatedAt: new Date(),
    });

    googleService.exchangeCode.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      tokenExpiry: new Date(),
      scope: 'calendar',
      googleEmail: 'updated@gmail.com',
    });
    // repo.upsert returns the updated integration (implementation handles find-or-create)
    repo.upsert.mockResolvedValue(updatedIntegration);

    const result = await useCase.execute('doc-1', 'new-auth-code');

    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: 'doc-1', googleEmail: 'updated@gmail.com' }),
    );
    expect(result.connected).toBe(true);
    expect(result.googleEmail).toBe('updated@gmail.com');
  });
});
