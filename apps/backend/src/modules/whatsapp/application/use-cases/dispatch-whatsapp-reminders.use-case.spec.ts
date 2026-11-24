import { DispatchWhatsAppRemindersUseCase } from './dispatch-whatsapp-reminders.use-case';
import type {
  IRemindersQueueRepository,
  AppointmentDueRowWhatsApp,
} from '../../../reminders/domain/repositories/reminders-queue.repository';
import type { IWhatsAppSender } from '../../domain/ports/iwhatsapp-sender.port';
import type { IDoctorProfileRepository } from '../../../doctor-settings/domain/repositories/doctor-profile.repository';

const NOW = new Date('2026-12-15T10:00:00Z');
const APPT_TIME = new Date('2026-12-16T14:00:00Z'); // ~28h from NOW → within 24h window (23h45m–24h15m)

function makeAppt(overrides: Partial<AppointmentDueRowWhatsApp> = {}): AppointmentDueRowWhatsApp {
  return {
    appointmentId: 'appt-001',
    doctorId: 'doc-001',
    patientId: 'pat-001',
    patientPhone: '+584141234567',
    patientName: 'María González',
    scheduledAt: APPT_TIME,
    appointmentMode: 'presencial',
    officeName: 'Clínica Centro',
    consultationPaymentStatus: null,
    quietHoursStart: null,
    quietHoursEnd: null,
    ...overrides,
  };
}

function makeRepo(
  appointments: AppointmentDueRowWhatsApp[] = [],
  uniqueRecipients = 0,
): jest.Mocked<IRemindersQueueRepository> {
  return {
    findDueForWhatsAppReminder: jest.fn().mockResolvedValue(appointments),
    countWhatsAppUniqueRecipientsLast24h: jest.fn().mockResolvedValue(uniqueRecipients),
    insertPending: jest.fn().mockResolvedValue('queue-row-id'),
    updateExternalIds: jest.fn().mockResolvedValue(undefined),
    markSent: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    // other methods not needed for this use case
    listByDoctorId: jest.fn(),
    listAll: jest.fn(),
    findDueForReminder: jest.fn(),
    updateQueueRow: jest.fn(),
  } as unknown as jest.Mocked<IRemindersQueueRepository>;
}

function makeWhatsApp(
  result: { messageId: string; conversationId: string; participantId: string } | null = {
    messageId: 'msg-1',
    conversationId: 'conv-1',
    participantId: '+584141234567',
  },
): jest.Mocked<IWhatsAppSender> {
  return {
    sendTemplate: jest.fn().mockResolvedValue(result),
    sendText: jest.fn().mockResolvedValue(true),
  } as jest.Mocked<IWhatsAppSender>;
}

function makeDoctorRepo(): jest.Mocked<IDoctorProfileRepository> {
  return {
    findByDoctorId: jest.fn().mockResolvedValue({
      fullName: 'García',
      professionalTitle: 'Dr.',
      email: 'garcia@test.com',
    }),
  } as unknown as jest.Mocked<IDoctorProfileRepository>;
}

function makeSut(
  repo: jest.Mocked<IRemindersQueueRepository>,
  whatsApp: jest.Mocked<IWhatsAppSender>,
  doctorRepo = makeDoctorRepo(),
): DispatchWhatsAppRemindersUseCase {
  return new DispatchWhatsAppRemindersUseCase(repo, whatsApp, doctorRepo);
}

describe('DispatchWhatsAppRemindersUseCase', () => {
  describe('execute', () => {
    it('returns all zeros when no appointments are due', async () => {
      const repo = makeRepo([]);
      const sut = makeSut(repo, makeWhatsApp());

      const result = await sut.execute();

      expect(result).toEqual({
        sent24h: 0,
        failed24h: 0,
        skipped24h: 0,
        sent3h: 0,
        failed3h: 0,
        skipped3h: 0,
      });
    });

    it('skips the entire run when daily cap is reached', async () => {
      const repo = makeRepo([makeAppt()], 240);
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const result = await sut.execute();

      expect(result).toEqual({
        sent24h: 0,
        failed24h: 0,
        skipped24h: 0,
        sent3h: 0,
        failed3h: 0,
        skipped3h: 0,
      });
      expect(whatsApp.sendTemplate).not.toHaveBeenCalled();
    });

    it('sends 24h reminder for unpaid appointment with standard template', async () => {
      const appt = makeAppt({ consultationPaymentStatus: null });
      const repo = makeRepo([appt], 0);
      // 3h window returns empty
      repo.findDueForWhatsAppReminder
        .mockResolvedValueOnce([appt]) // 24h
        .mockResolvedValueOnce([]); // 3h
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const result = await sut.execute();

      expect(result.sent24h).toBe(1);
      expect(result.failed24h).toBe(0);
      const sendCall = whatsApp.sendTemplate.mock.calls[0]!;
      expect(sendCall[0].templateName).toBe('recordatorio_cita_24h');
    });

    it('sends 24h reminder with paid template when payment approved', async () => {
      const appt = makeAppt({ consultationPaymentStatus: 'approved' });
      const repo = makeRepo([], 0);
      repo.findDueForWhatsAppReminder.mockResolvedValueOnce([appt]).mockResolvedValueOnce([]);
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      await sut.execute();

      expect(whatsApp.sendTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ templateName: 'recordatorio_cita_24h_pagada' }),
      );
    });

    it('sends 3h reminder with today template', async () => {
      const repo = makeRepo([], 0);
      const appt3h = makeAppt({ scheduledAt: new Date(NOW.getTime() + 3 * 60 * 60 * 1000) });
      repo.findDueForWhatsAppReminder
        .mockResolvedValueOnce([]) // 24h
        .mockResolvedValueOnce([appt3h]); // 3h
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const result = await sut.execute();

      expect(result.sent3h).toBe(1);
      expect(whatsApp.sendTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ templateName: 'recordatorio_cita_hoy' }),
      );
    });

    it('skips appointment without phone', async () => {
      const appt = makeAppt({ patientPhone: null });
      const repo = makeRepo([], 0);
      repo.findDueForWhatsAppReminder.mockResolvedValueOnce([appt]).mockResolvedValueOnce([]);
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const result = await sut.execute();

      expect(result.sent24h).toBe(0);
      expect(result.skipped24h).toBe(1);
      expect(whatsApp.sendTemplate).not.toHaveBeenCalled();
    });

    it('skips when insertPending returns null (already queued)', async () => {
      const appt = makeAppt();
      const repo = makeRepo([], 0);
      repo.findDueForWhatsAppReminder.mockResolvedValueOnce([appt]).mockResolvedValueOnce([]);
      repo.insertPending.mockResolvedValue(null); // already queued
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const result = await sut.execute();

      expect(result.sent24h).toBe(0);
      expect(result.skipped24h).toBe(1);
      expect(whatsApp.sendTemplate).not.toHaveBeenCalled();
    });

    it('records failed when sendTemplate throws', async () => {
      const appt = makeAppt();
      const repo = makeRepo([], 0);
      repo.findDueForWhatsAppReminder.mockResolvedValueOnce([appt]).mockResolvedValueOnce([]);
      const whatsApp = makeWhatsApp();
      whatsApp.sendTemplate.mockRejectedValue(new Error('HTTP 500'));
      const sut = makeSut(repo, whatsApp);

      const result = await sut.execute();

      expect(result.sent24h).toBe(0);
      expect(result.failed24h).toBe(1);
      expect(repo.markFailed).toHaveBeenCalledWith('queue-row-id', 'HTTP 500');
    });

    it('skips (not fails) when sendTemplate returns null (gated)', async () => {
      const appt = makeAppt();
      const repo = makeRepo([], 0);
      repo.findDueForWhatsAppReminder.mockResolvedValueOnce([appt]).mockResolvedValueOnce([]);
      const whatsApp = makeWhatsApp(null);
      const sut = makeSut(repo, whatsApp);

      const result = await sut.execute();

      expect(result.sent24h).toBe(0);
      expect(result.skipped24h).toBe(1);
      expect(repo.markFailed).toHaveBeenCalledWith('queue-row-id', 'gated_or_disabled');
    });

    it('records external IDs after successful send', async () => {
      const appt = makeAppt();
      const repo = makeRepo([], 0);
      repo.findDueForWhatsAppReminder.mockResolvedValueOnce([appt]).mockResolvedValueOnce([]);
      const whatsApp = makeWhatsApp({
        messageId: 'msg-x',
        conversationId: 'conv-x',
        participantId: '+584141234567',
      });
      const sut = makeSut(repo, whatsApp);

      await sut.execute();

      expect(repo.updateExternalIds).toHaveBeenCalledWith('queue-row-id', 'msg-x', 'conv-x');
      expect(repo.markSent).toHaveBeenCalledWith('queue-row-id');
    });

    it('passes first name only as template param {{1}}', async () => {
      const appt = makeAppt({ patientName: 'Ana María Rodríguez' });
      const repo = makeRepo([], 0);
      repo.findDueForWhatsAppReminder.mockResolvedValueOnce([appt]).mockResolvedValueOnce([]);
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      await sut.execute();

      const params = whatsApp.sendTemplate.mock.calls[0]![0].templateParams;
      expect(params[0]).toBe('Ana'); // first name only
    });
  });
});
