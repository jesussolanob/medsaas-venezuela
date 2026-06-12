import { AppointmentNotificationService } from './appointment-notification.service';
import { GoogleNotConnectedError } from '../../domain/errors/google-not-connected.error';
import type { CreateCalendarEventUseCase } from '../use-cases/integrations/create-calendar-event.use-case';

const makeInput = (override: Record<string, unknown> = {}) => ({
  appointmentId: 'appt-abc',
  doctorId: 'doc-1',
  doctorName: 'Dr. López',
  doctorEmail: 'doc@clinic.com',
  patientEmail: 'patient@example.com',
  patientName: 'Juan Pérez',
  scheduledAtISO: '2026-07-01T10:00:00Z',
  durationMinutes: 30,
  appointmentMode: 'online',
  officeAddress: undefined,
  officeName: undefined,
  ...override,
});

describe('AppointmentNotificationService', () => {
  let createCalendarEvent: jest.Mocked<CreateCalendarEventUseCase>;
  let service: AppointmentNotificationService;

  beforeEach(() => {
    createCalendarEvent = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateCalendarEventUseCase>;

    // No MailerService injected — tests focus on the meet link selection logic
    service = new AppointmentNotificationService(createCalendarEvent, null);
  });

  describe('online appointment — Google Meet path', () => {
    it('returns Google Meet link when calendar event is created', async () => {
      createCalendarEvent.execute.mockResolvedValue({
        meetLink: 'https://meet.google.com/abc-defg-hij',
        eventId: 'evt-1',
      });

      const result = await service.notify(makeInput());

      expect(result.meetLink).toBe('https://meet.google.com/abc-defg-hij');
      expect(result.channel).toBe('google_meet');
    });

    it('returns the googleCalendarEventId from the created event', async () => {
      createCalendarEvent.execute.mockResolvedValue({
        meetLink: 'https://meet.google.com/abc-defg-hij',
        eventId: 'google-evt-abc-123',
      });

      const result = await service.notify(makeInput());

      expect(result.googleCalendarEventId).toBe('google-evt-abc-123');
    });

    it('returns null googleCalendarEventId when eventId is empty string', async () => {
      createCalendarEvent.execute.mockResolvedValue({
        meetLink: 'https://meet.google.com/abc',
        eventId: '',
      });

      const result = await service.notify(makeInput());

      expect(result.googleCalendarEventId).toBeNull();
    });

    it('falls back to Jitsi when GoogleNotConnectedError is thrown', async () => {
      createCalendarEvent.execute.mockRejectedValue(new GoogleNotConnectedError('doc-1'));

      const result = await service.notify(makeInput());

      expect(result.channel).toBe('jitsi_fallback');
      expect(result.meetLink).toBe('https://meet.jit.si/delta-appt-abc');
    });

    it('returns null googleCalendarEventId on Jitsi fallback (GoogleNotConnectedError)', async () => {
      createCalendarEvent.execute.mockRejectedValue(new GoogleNotConnectedError('doc-1'));

      const result = await service.notify(makeInput());

      expect(result.googleCalendarEventId).toBeNull();
    });

    it('falls back to Jitsi on unexpected Google errors', async () => {
      createCalendarEvent.execute.mockRejectedValue(new Error('Network error'));

      const result = await service.notify(makeInput());

      expect(result.channel).toBe('jitsi_fallback');
      expect(result.meetLink).toContain('jit.si');
    });

    it('returns null googleCalendarEventId on unexpected Google error fallback', async () => {
      createCalendarEvent.execute.mockRejectedValue(new Error('Network error'));

      const result = await service.notify(makeInput());

      expect(result.googleCalendarEventId).toBeNull();
    });

    it('generates Jitsi link using appointmentId', async () => {
      createCalendarEvent.execute.mockRejectedValue(new GoogleNotConnectedError());

      const result = await service.notify(makeInput({ appointmentId: 'custom-appt-id' }));
      expect(result.meetLink).toBe('https://meet.jit.si/delta-custom-appt-id');
    });
  });

  describe('in_person appointment', () => {
    it('returns null meetLink and in_person channel', async () => {
      const result = await service.notify(makeInput({ appointmentMode: 'in_person' }));

      expect(result.meetLink).toBeNull();
      expect(result.channel).toBe('in_person');
      expect(createCalendarEvent.execute).not.toHaveBeenCalled();
    });

    it('returns null googleCalendarEventId for in_person appointments', async () => {
      const result = await service.notify(makeInput({ appointmentMode: 'in_person' }));

      expect(result.googleCalendarEventId).toBeNull();
    });
  });
});
