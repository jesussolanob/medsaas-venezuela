import { CancelCalendarEventUseCase } from './cancel-calendar-event.use-case';
import { GoogleNotConnectedError } from '../../../domain/errors/google-not-connected.error';
import { GoogleIntegration } from '../../../domain/entities/google-integration.entity';
import type { IGoogleIntegrationRepository } from '../../../domain/repositories/google-integration.repository';
import type { GoogleCalendarService } from '../../../infrastructure/google/google-calendar.service';

const futureExpiry = new Date(Date.now() + 3600 * 1000);

const makeIntegration = (tokenExpiry = futureExpiry) =>
  GoogleIntegration.create({
    id: 'gi-1',
    doctorId: 'doc-1',
    accessToken: 'access-tok',
    refreshToken: 'refresh-tok',
    tokenExpiry,
    scope: 'calendar',
    googleEmail: 'doc@gmail.com',
    connectedAt: new Date(),
    updatedAt: new Date(),
  });

describe('CancelCalendarEventUseCase', () => {
  let repo: jest.Mocked<IGoogleIntegrationRepository>;
  let googleService: jest.Mocked<GoogleCalendarService>;
  let useCase: CancelCalendarEventUseCase;

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

    useCase = new CancelCalendarEventUseCase(repo, googleService);
  });

  it('throws GoogleNotConnectedError when env is not configured', async () => {
    googleService.isConfigured.mockReturnValue(false);
    await expect(useCase.execute('doc-1', 'event-123')).rejects.toBeInstanceOf(
      GoogleNotConnectedError,
    );
  });

  it('throws GoogleNotConnectedError when doctor has no integration', async () => {
    repo.findByDoctorId.mockResolvedValue(null);
    await expect(useCase.execute('doc-1', 'event-123')).rejects.toBeInstanceOf(
      GoogleNotConnectedError,
    );
  });

  it('cancels the event using the stored access token', async () => {
    const integration = makeIntegration();
    repo.findByDoctorId.mockResolvedValue(integration);
    googleService.cancelEvent.mockResolvedValue(undefined);

    await useCase.execute('doc-1', 'event-123');

    expect(googleService.cancelEvent).toHaveBeenCalledWith('access-tok', 'event-123');
  });

  it('refreshes the token when expired before cancelling', async () => {
    const expiredIntegration = makeIntegration(new Date(Date.now() - 1000));
    repo.findByDoctorId.mockResolvedValue(expiredIntegration);
    googleService.refreshAccessToken.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      tokenExpiry: futureExpiry,
    });
    repo.updateTokens.mockResolvedValue(undefined);
    googleService.cancelEvent.mockResolvedValue(undefined);

    await useCase.execute('doc-1', 'event-123');

    expect(googleService.refreshAccessToken).toHaveBeenCalledWith('refresh-tok');
    expect(repo.updateTokens).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: 'doc-1', accessToken: 'new-access' }),
    );
    expect(googleService.cancelEvent).toHaveBeenCalledWith('new-access', 'event-123');
  });

  it('throws GoogleNotConnectedError when token refresh fails during cancel', async () => {
    const expiredIntegration = makeIntegration(new Date(Date.now() - 1000));
    repo.findByDoctorId.mockResolvedValue(expiredIntegration);
    googleService.refreshAccessToken.mockRejectedValue(new Error('Token expired'));

    await expect(useCase.execute('doc-1', 'event-123')).rejects.toBeInstanceOf(
      GoogleNotConnectedError,
    );
  });
});
