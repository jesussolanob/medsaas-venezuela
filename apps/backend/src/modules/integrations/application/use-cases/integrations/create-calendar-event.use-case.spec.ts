import { CreateCalendarEventUseCase } from './create-calendar-event.use-case';
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

const makeInput = () => ({
  doctorId: 'doc-1',
  summary: 'Consulta Dr. Smith',
  description: 'Cita médica',
  startISO: '2026-07-01T10:00:00Z',
  endISO: '2026-07-01T10:30:00Z',
  attendeeEmail: 'patient@example.com',
});

describe('CreateCalendarEventUseCase', () => {
  let repo: jest.Mocked<IGoogleIntegrationRepository>;
  let googleService: jest.Mocked<GoogleCalendarService>;
  let useCase: CreateCalendarEventUseCase;

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

    useCase = new CreateCalendarEventUseCase(repo, googleService);
  });

  it('throws GoogleNotConnectedError when env is not configured', async () => {
    googleService.isConfigured.mockReturnValue(false);
    await expect(useCase.execute(makeInput())).rejects.toBeInstanceOf(GoogleNotConnectedError);
  });

  it('throws GoogleNotConnectedError when doctor has no integration', async () => {
    repo.findByDoctorId.mockResolvedValue(null);
    await expect(useCase.execute(makeInput())).rejects.toBeInstanceOf(GoogleNotConnectedError);
  });

  it('creates a Meet event and returns meetLink + eventId', async () => {
    const integration = makeIntegration();
    repo.findByDoctorId.mockResolvedValue(integration);
    googleService.createEventWithMeet.mockResolvedValue({
      meetLink: 'https://meet.google.com/abc-defg-hij',
      eventId: 'event-123',
    });

    const result = await useCase.execute(makeInput());

    expect(result.meetLink).toBe('https://meet.google.com/abc-defg-hij');
    expect(result.eventId).toBe('event-123');
    expect(googleService.createEventWithMeet).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'access-tok',
        attendeeEmail: 'patient@example.com',
      }),
    );
  });

  it('refreshes the token when expired and retries the event creation', async () => {
    const expiredIntegration = makeIntegration(new Date(Date.now() - 1000));
    repo.findByDoctorId.mockResolvedValue(expiredIntegration);
    googleService.refreshAccessToken.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      tokenExpiry: futureExpiry,
    });
    repo.updateTokens.mockResolvedValue(undefined);
    googleService.createEventWithMeet.mockResolvedValue({
      meetLink: 'https://meet.google.com/xyz',
      eventId: 'event-456',
    });

    const result = await useCase.execute(makeInput());

    expect(googleService.refreshAccessToken).toHaveBeenCalledWith('refresh-tok');
    expect(repo.updateTokens).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: 'doc-1', accessToken: 'new-access' }),
    );
    // Event creation uses the fresh access token
    expect(googleService.createEventWithMeet).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'new-access' }),
    );
    expect(result.meetLink).toBe('https://meet.google.com/xyz');
  });

  it('throws GoogleNotConnectedError when token refresh fails', async () => {
    const expiredIntegration = makeIntegration(new Date(Date.now() - 1000));
    repo.findByDoctorId.mockResolvedValue(expiredIntegration);
    googleService.refreshAccessToken.mockRejectedValue(new Error('Refresh failed'));

    await expect(useCase.execute(makeInput())).rejects.toBeInstanceOf(GoogleNotConnectedError);
  });
});
