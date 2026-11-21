import { HandleWhatsAppWebhookUseCase } from './handle-whatsapp-webhook.use-case';
import type { IAppointmentRepository } from '../../../appointments/domain/repositories/appointment.repository';
import type { IWhatsAppSender } from '../../domain/ports/iwhatsapp-sender.port';
import { AppointmentActionTokenService } from '../../infrastructure/services/appointment-action-token.service';
import { AppointmentRescheduleTokenService } from '../../../appointments/infrastructure/services/appointment-reschedule-token.service';
import { ConfigService } from '@nestjs/config';
import { Appointment } from '../../../appointments/domain/entities/appointment.entity';
import type { AppointmentStatus } from '@delta/shared-types';

const SECRET = 'test-webhook-secret-for-unit-tests!';

function makeSharedConfig(): ConfigService {
  return {
    get: (k: string) => (k === 'APPOINTMENT_ACTION_SECRET' ? SECRET : null),
  } as unknown as ConfigService;
}

function makeTokenService(): AppointmentActionTokenService {
  return new AppointmentActionTokenService(makeSharedConfig());
}

function makeRescheduleTokenService(): AppointmentRescheduleTokenService {
  return new AppointmentRescheduleTokenService(makeSharedConfig());
}

function makeAppt(
  overrides: Partial<{
    status: AppointmentStatus;
    paymentStatus: string | null;
    scheduledAt: Date;
    patientConfirmedAt: Date | null;
  }> = {},
): Appointment {
  const scheduledAt = overrides.scheduledAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Appointment(
    'appt-001',
    'doc-001',
    'pat-001',
    null,
    null,
    'María',
    '+584141234567',
    null,
    null,
    scheduledAt,
    overrides.status ?? 'scheduled',
    'presencial',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    new Date(),
    new Date(),
    overrides.paymentStatus ?? null,
    null,
    null,
    null,
    null,
    overrides.patientConfirmedAt ?? null,
  );
}

function makeRepo(appt: Appointment | null = makeAppt()): jest.Mocked<IAppointmentRepository> {
  return {
    findById: jest.fn().mockResolvedValue(appt),
    updateStatus: jest.fn().mockResolvedValue(appt),
    setPatientConfirmedAt: jest.fn().mockResolvedValue(undefined),
    logStatusChange: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<IAppointmentRepository>;
}

function makeWhatsApp(): jest.Mocked<IWhatsAppSender> {
  return {
    sendTemplate: jest.fn().mockResolvedValue(null),
    sendText: jest.fn().mockResolvedValue(true),
  } as jest.Mocked<IWhatsAppSender>;
}

function makeAppConfig(): ConfigService {
  return {
    get: (k: string) => {
      if (k === 'APP_BASE_URL') return 'https://app.deltasalud.app';
      if (k === 'APPOINTMENT_ACTION_SECRET') return SECRET;
      return null;
    },
  } as unknown as ConfigService;
}

function makeSut(
  repo: jest.Mocked<IAppointmentRepository>,
  whatsApp: jest.Mocked<IWhatsAppSender>,
  createNotification = { execute: jest.fn().mockResolvedValue({}) },
): HandleWhatsAppWebhookUseCase {
  return new HandleWhatsAppWebhookUseCase(
    repo,
    whatsApp,
    makeTokenService(),
    createNotification as never,
    makeAppConfig(),
    makeRescheduleTokenService(),
  );
}

describe('HandleWhatsAppWebhookUseCase', () => {
  let tokenService: AppointmentActionTokenService;

  beforeEach(() => {
    tokenService = makeTokenService();
  });

  describe('button_reply: confirm', () => {
    it('sets patient_confirmed_at and notifies doctor', async () => {
      const appt = makeAppt({ status: 'scheduled' });
      const repo = makeRepo(appt);
      const whatsApp = makeWhatsApp();
      const notify = { execute: jest.fn().mockResolvedValue({}) };
      const sut = makeSut(repo, whatsApp, notify);

      const payload = tokenService.generateButtonPayload({
        appointmentId: 'appt-001',
        expMs: appt.scheduledAt.getTime(),
        action: 'confirm',
        satMs: 0,
      });

      const result = await sut.execute({ buttonPayload: payload, conversationId: 'conv-1' });

      expect(result.action).toBe('confirm');
      expect(repo.setPatientConfirmedAt).toHaveBeenCalledWith('appt-001');
      expect(notify.execute).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'appointment_confirmed_by_patient' }),
      );
    });

    it('returns noop when appointment is already confirmed', async () => {
      const appt = makeAppt({ patientConfirmedAt: new Date() });
      const repo = makeRepo(appt);
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const payload = tokenService.generateButtonPayload({
        appointmentId: 'appt-001',
        expMs: appt.scheduledAt.getTime(),
        action: 'confirm',
        satMs: 0,
      });

      const result = await sut.execute({ buttonPayload: payload });
      expect(result.action).toBe('noop');
      expect(repo.setPatientConfirmedAt).not.toHaveBeenCalled();
    });

    it('returns noop and sends friendly message when appointment status is inactive', async () => {
      // e.g. already cancelled — confirm button from an old reminder should not throw
      const appt = makeAppt({ status: 'cancelled' });
      const repo = makeRepo(appt);
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const payload = tokenService.generateButtonPayload({
        appointmentId: 'appt-001',
        expMs: appt.scheduledAt.getTime(),
        action: 'confirm',
        satMs: 0,
      });

      const result = await sut.execute({ buttonPayload: payload, conversationId: 'conv-1' });
      expect(result.action).toBe('noop');
      expect(repo.setPatientConfirmedAt).not.toHaveBeenCalled();
      expect(whatsApp.sendText).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('no está activa'),
        }),
      );
    });
  });

  describe('button_reply: reschedule', () => {
    it('sends /cita/reagendar/ link (proper reschedule token) and returns reschedule', async () => {
      const appt = makeAppt();
      const repo = makeRepo(appt);
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const payload = tokenService.generateButtonPayload({
        appointmentId: 'appt-001',
        expMs: appt.scheduledAt.getTime(),
        action: 'reschedule',
        satMs: appt.scheduledAt.getTime(),
      });

      const result = await sut.execute({ buttonPayload: payload, conversationId: 'conv-1' });

      expect(result.action).toBe('reschedule');
      expect(whatsApp.sendText).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          // The URL must use the public /cita/reagendar/ path with a proper
          // AppointmentRescheduleTokenService token (not the button payload).
          text: expect.stringContaining('/cita/reagendar/'),
        }),
      );
      // Confirm it no longer embeds the raw button payload (action token) in the URL.
      const firstCall = whatsApp.sendText.mock.calls[0] as [{ text: string }] | undefined;
      const sentText = firstCall?.[0]?.text ?? '';
      expect(sentText).not.toContain('/book/doc-001?reagendar=');
    });

    it('returns noop when reschedule token already used (satMs mismatch)', async () => {
      const appt = makeAppt({ scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000) });
      const repo = makeRepo(appt);
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      // Token was generated for a DIFFERENT scheduledAt
      const payload = tokenService.generateButtonPayload({
        appointmentId: 'appt-001',
        expMs: appt.scheduledAt.getTime(),
        action: 'reschedule',
        satMs: new Date('2026-12-01T10:00:00Z').getTime(), // old scheduledAt
      });

      const result = await sut.execute({ buttonPayload: payload });
      expect(result.action).toBe('noop');
      expect(whatsApp.sendText).not.toHaveBeenCalled();
    });
  });

  describe('button_reply: cancel', () => {
    it('cancels appointment and sends confirmation', async () => {
      const appt = makeAppt({ status: 'scheduled', paymentStatus: null });
      const repo = makeRepo(appt);
      const whatsApp = makeWhatsApp();
      const notify = { execute: jest.fn().mockResolvedValue({}) };
      const sut = makeSut(repo, whatsApp, notify);

      const payload = tokenService.generateButtonPayload({
        appointmentId: 'appt-001',
        expMs: appt.scheduledAt.getTime(),
        action: 'cancel',
        satMs: 0,
      });

      const result = await sut.execute({ buttonPayload: payload, conversationId: 'conv-1' });

      expect(result.action).toBe('cancel');
      expect(repo.updateStatus).toHaveBeenCalledWith('appt-001', 'cancelled');
      expect(whatsApp.sendText).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-1' }),
      );
      expect(notify.execute).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'appointment_cancelled_by_patient' }),
      );
    });

    it('writes audit log with doctor id as actorId on cancel', async () => {
      const appt = makeAppt({ status: 'scheduled', paymentStatus: null });
      const repo = makeRepo(appt);
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const payload = tokenService.generateButtonPayload({
        appointmentId: 'appt-001',
        expMs: appt.scheduledAt.getTime(),
        action: 'cancel',
        satMs: 0,
      });

      await sut.execute({ buttonPayload: payload, conversationId: 'conv-1' });

      expect(repo.logStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: 'appt-001',
          actorId: 'doc-001', // doctor's UUID, not literal 'patient_self_service'
          newStatus: 'cancelled',
        }),
      );
    });

    it('does NOT cancel when payment is approved', async () => {
      const appt = makeAppt({ status: 'scheduled', paymentStatus: 'approved' });
      const repo = makeRepo(appt);
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const payload = tokenService.generateButtonPayload({
        appointmentId: 'appt-001',
        expMs: appt.scheduledAt.getTime(),
        action: 'cancel',
        satMs: 0,
      });

      const result = await sut.execute({ buttonPayload: payload, conversationId: 'conv-1' });

      expect(result.action).toBe('noop');
      expect(repo.updateStatus).not.toHaveBeenCalled();
      expect(whatsApp.sendText).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('contacta directamente'),
        }),
      );
    });
  });

  describe('invalid / expired tokens', () => {
    it('returns noop for expired token', async () => {
      const repo = makeRepo();
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const payload = tokenService.generateButtonPayload({
        appointmentId: 'appt-001',
        expMs: Date.now() - 1000, // already expired
        action: 'confirm',
        satMs: 0,
      });

      const result = await sut.execute({ buttonPayload: payload });
      expect(result.action).toBe('noop');
      expect(repo.setPatientConfirmedAt).not.toHaveBeenCalled();
    });

    it('returns noop for tampered token', async () => {
      const repo = makeRepo();
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const result = await sut.execute({ buttonPayload: 'confirm:tampered.token.here.xxx' });
      expect(result.action).toBe('noop');
    });

    it('returns noop when appointment not found', async () => {
      const repo = makeRepo(null);
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const payload = tokenService.generateButtonPayload({
        appointmentId: 'appt-999',
        expMs: Date.now() + 24 * 60 * 60 * 1000,
        action: 'confirm',
        satMs: 0,
      });

      const result = await sut.execute({ buttonPayload: payload });
      expect(result.action).toBe('noop');
    });
  });

  describe('free-text inbound', () => {
    it('sends standard reminder reply', async () => {
      const repo = makeRepo();
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const result = await sut.execute({
        messageBody: 'Hola, ¿me pueden confirmar la cita?',
        conversationId: 'conv-free',
      });

      expect(result.action).toBe('freetext');
      expect(whatsApp.sendText).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-free',
          text: expect.stringContaining('solo envía recordatorios'),
        }),
      );
    });
  });

  describe('error resilience', () => {
    it('returns noop when an unexpected error occurs', async () => {
      const repo = makeRepo();
      repo.findById.mockRejectedValue(new Error('DB offline'));
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const payload = tokenService.generateButtonPayload({
        appointmentId: 'appt-001',
        expMs: Date.now() + 24 * 60 * 60 * 1000,
        action: 'confirm',
        satMs: 0,
      });

      const result = await sut.execute({ buttonPayload: payload });
      expect(result.action).toBe('noop');
    });
  });
});
