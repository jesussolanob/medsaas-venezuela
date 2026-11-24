import {
  HandleWhatsAppWebhookUseCase,
  normalizeWhatsAppAction,
} from './handle-whatsapp-webhook.use-case';
import type { IAppointmentRepository } from '../../../appointments/domain/repositories/appointment.repository';
import type { IWhatsAppSender } from '../../domain/ports/iwhatsapp-sender.port';
import type { IRemindersQueueRepository } from '../../../reminders/domain/repositories/reminders-queue.repository';
import { AppointmentRescheduleTokenService } from '../../../appointments/infrastructure/services/appointment-reschedule-token.service';
import { ConfigService } from '@nestjs/config';
import { Appointment } from '../../../appointments/domain/entities/appointment.entity';
import type { AppointmentStatus } from '@delta/shared-types';

// ---------------------------------------------------------------------------
// Real Zernio payload shape (captured from delivery log — PII masked).
// ---------------------------------------------------------------------------

/**
 * Builds a message.received payload that mirrors the REAL Zernio shape.
 * Per the staging test: metadata lives at the ROOT (not inside message),
 * and account.accountId identifies the Zernio account.
 */
function makeZernioPayload(overrides: {
  buttonText?: string;
  quotedMessageId?: string;
  conversationId?: string;
  messageId?: string;
  accountId?: string;
  messageText?: string;
}) {
  return {
    id: '6197ec5f-test',
    event: 'message.received',
    message: {
      id: overrides.messageId ?? '6b05c85d-test',
      conversationId: overrides.conversationId ?? '6b05bd40-test',
      platform: 'whatsapp',
      direction: 'incoming',
      text: overrides.messageText ?? overrides.buttonText ?? '',
      attachments: [],
      sender: {
        id: '58424000000',
        name: 'Test Patient',
        phoneNumber: '+584240000000',
      },
      sentAt: '2026-11-24T10:00:00Z',
    },
    conversation: {
      id: overrides.conversationId ?? '6b05bd40-test',
      participantId: '58424000000',
    },
    account: {
      id: overrides.accountId ?? '6afc5b492728c5ed0bbdb5f7',
      accountId: overrides.accountId ?? '6afc5b492728c5ed0bbdb5f7',
      platform: 'whatsapp',
    },
    metadata: {
      buttonPayload: overrides.buttonText ?? '',
      quotedMessageId: overrides.quotedMessageId ?? undefined,
      quotedMessage: overrides.quotedMessageId
        ? { platformMessageId: overrides.quotedMessageId }
        : undefined,
    },
    timestamp: '2026-11-24T10:00:00Z',
  };
}

/** Normalizes a Zernio payload to the flat ZernioWebhookPayload shape, mirroring
 *  what normalizeZernioPayload() does in the controller. */
function normalize(raw: ReturnType<typeof makeZernioPayload>) {
  const root = raw as Record<string, unknown>;
  const message = raw.message as Record<string, unknown>;
  const metadata = raw.metadata as Record<string, unknown>;
  const account = raw.account as Record<string, unknown>;
  return {
    event: raw.event,
    conversationId: (message['conversationId'] as string | undefined) ?? undefined,
    messageId: (message['id'] as string | undefined) ?? undefined,
    participantId: (raw.message.sender as Record<string, unknown>)['phoneNumber'] as
      | string
      | undefined,
    accountId: (account['accountId'] as string | undefined) ?? undefined,
    quotedMessageId: (metadata['quotedMessageId'] as string | undefined) ?? undefined,
    buttonPayload: ((metadata['buttonPayload'] as string | undefined) ?? '') || undefined,
    messageBody:
      ((message['text'] as string | undefined) ??
        (root['messageBody'] as string | undefined) ??
        '') ||
      undefined,
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ACCOUNT_ID = '6afc5b492728c5ed0bbdb5f7';
const QUOTED_WAMID = 'wamid.HBgMNTg0MjQyNTg4MzkxFQIAERgSMDM2MVETEST==';
const CONVERSATION_ID = '6b05bd40-test';
const MESSAGE_ID = '6b05c85d-msg-test';
const SECRET = 'test-secret-for-unit-tests!';

function makeSharedConfig(): ConfigService {
  return {
    get: (k: string) => {
      if (k === 'APP_BASE_URL') return 'https://app.deltasalud.app';
      if (k === 'APPOINTMENT_ACTION_SECRET') return SECRET;
      if (k === 'ZERNIO_WHATSAPP_ACCOUNT_ID') return ACCOUNT_ID;
      return null;
    },
  } as unknown as ConfigService;
}

function makeRescheduleTokenService(): AppointmentRescheduleTokenService {
  return new AppointmentRescheduleTokenService({
    get: (k: string) => (k === 'APPOINTMENT_ACTION_SECRET' ? SECRET : null),
  } as unknown as ConfigService);
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

function makeQueueRepo(
  row: { rowId: string; appointmentId: string } | null = {
    rowId: 'queue-row-1',
    appointmentId: 'appt-001',
  },
): jest.Mocked<IRemindersQueueRepository> {
  return {
    findByExternalMessageId: jest.fn().mockResolvedValue(row),
  } as unknown as jest.Mocked<IRemindersQueueRepository>;
}

function makeSut(
  repo: jest.Mocked<IAppointmentRepository>,
  whatsApp: jest.Mocked<IWhatsAppSender>,
  queueRepo: jest.Mocked<IRemindersQueueRepository> = makeQueueRepo(),
  createNotification: { execute: jest.Mock } | null = null,
): HandleWhatsAppWebhookUseCase {
  return new HandleWhatsAppWebhookUseCase(
    repo,
    whatsApp,
    makeRescheduleTokenService(),
    queueRepo,
    createNotification as never,
    makeSharedConfig(),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HandleWhatsAppWebhookUseCase', () => {
  describe('account ID filter', () => {
    it('returns noop when account.accountId does not match ZERNIO_WHATSAPP_ACCOUNT_ID', async () => {
      const repo = makeRepo();
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const payload = normalize(
        makeZernioPayload({
          accountId: 'other-account-id',
          buttonText: 'Confirmar',
          quotedMessageId: QUOTED_WAMID,
        }),
      );

      const result = await sut.execute(payload);
      expect(result.action).toBe('noop');
      expect(repo.findById).not.toHaveBeenCalled();
    });

    it('passes when accountId matches', async () => {
      const repo = makeRepo();
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const payload = normalize(
        makeZernioPayload({
          accountId: ACCOUNT_ID,
          buttonText: 'Confirmar',
          quotedMessageId: QUOTED_WAMID,
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
        }),
      );

      const result = await sut.execute(payload);
      expect(result.action).toBe('confirm');
    });
  });

  describe('idempotency by message.id', () => {
    it('returns noop on duplicate message.id', async () => {
      const repo = makeRepo();
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const payload = normalize(
        makeZernioPayload({
          buttonText: 'Confirmar',
          quotedMessageId: QUOTED_WAMID,
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
        }),
      );

      await sut.execute(payload); // first call → confirm
      const second = await sut.execute(payload); // duplicate → noop
      expect(second.action).toBe('noop');
      // setPatientConfirmedAt called only once
      expect(repo.setPatientConfirmedAt).toHaveBeenCalledTimes(1);
    });
  });

  describe('quoted-reply: confirm', () => {
    it('looks up reminder row by quotedMessageId and confirms the appointment', async () => {
      const appt = makeAppt({ status: 'scheduled' });
      const repo = makeRepo(appt);
      const whatsApp = makeWhatsApp();
      const queueRepo = makeQueueRepo({ rowId: 'row-1', appointmentId: 'appt-001' });
      const notify = { execute: jest.fn().mockResolvedValue({}) };
      const sut = makeSut(repo, whatsApp, queueRepo, notify);

      const payload = normalize(
        makeZernioPayload({
          buttonText: 'Confirmar',
          quotedMessageId: QUOTED_WAMID,
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
        }),
      );

      const result = await sut.execute(payload);

      expect(result.action).toBe('confirm');
      expect(queueRepo.findByExternalMessageId).toHaveBeenCalledWith(QUOTED_WAMID, 'whatsapp');
      expect(repo.findById).toHaveBeenCalledWith('appt-001');
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

      const payload = normalize(
        makeZernioPayload({
          buttonText: 'Confirmar',
          quotedMessageId: QUOTED_WAMID,
        }),
      );

      const result = await sut.execute(payload);
      expect(result.action).toBe('noop');
      expect(repo.setPatientConfirmedAt).not.toHaveBeenCalled();
    });

    it('sends friendly message when appointment status is inactive', async () => {
      const appt = makeAppt({ status: 'cancelled' });
      const repo = makeRepo(appt);
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const payload = normalize(
        makeZernioPayload({
          buttonText: 'Confirmar',
          quotedMessageId: QUOTED_WAMID,
          conversationId: CONVERSATION_ID,
        }),
      );

      const result = await sut.execute(payload);
      expect(result.action).toBe('noop');
      expect(repo.setPatientConfirmedAt).not.toHaveBeenCalled();
      expect(whatsApp.sendText).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('no está activa') }),
      );
    });
  });

  describe('quoted-reply: reschedule', () => {
    it('sends /book/<doctorId>?reagendar=<token> link', async () => {
      const appt = makeAppt();
      const repo = makeRepo(appt);
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const payload = normalize(
        makeZernioPayload({
          buttonText: 'Reagendar',
          quotedMessageId: QUOTED_WAMID,
          conversationId: CONVERSATION_ID,
        }),
      );

      const result = await sut.execute(payload);

      expect(result.action).toBe('reschedule');
      expect(whatsApp.sendText).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONVERSATION_ID,
          text: expect.stringContaining('/book/doc-001?reagendar='),
        }),
      );
      const sentText = (whatsApp.sendText.mock.calls[0] as [{ text: string }] | undefined)?.[0]
        ?.text;
      expect(sentText).not.toContain('/cita/reagendar/');
    });
  });

  describe('quoted-reply: cancel', () => {
    it('cancels the appointment, writes audit log, and notifies doctor', async () => {
      const appt = makeAppt({ status: 'scheduled', paymentStatus: null });
      const repo = makeRepo(appt);
      const whatsApp = makeWhatsApp();
      const notify = { execute: jest.fn().mockResolvedValue({}) };
      const sut = makeSut(repo, whatsApp, makeQueueRepo(), notify);

      const payload = normalize(
        makeZernioPayload({
          buttonText: 'Cancelar',
          quotedMessageId: QUOTED_WAMID,
          conversationId: CONVERSATION_ID,
        }),
      );

      const result = await sut.execute(payload);

      expect(result.action).toBe('cancel');
      expect(repo.updateStatus).toHaveBeenCalledWith('appt-001', 'cancelled');
      expect(repo.logStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: 'appt-001',
          actorId: 'doc-001',
          newStatus: 'cancelled',
        }),
      );
      expect(notify.execute).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'appointment_cancelled_by_patient' }),
      );
    });

    it('does NOT cancel when payment is approved', async () => {
      const appt = makeAppt({ status: 'scheduled', paymentStatus: 'approved' });
      const repo = makeRepo(appt);
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const payload = normalize(
        makeZernioPayload({
          buttonText: 'Cancelar',
          quotedMessageId: QUOTED_WAMID,
          conversationId: CONVERSATION_ID,
        }),
      );

      const result = await sut.execute(payload);
      expect(result.action).toBe('noop');
      expect(repo.updateStatus).not.toHaveBeenCalled();
      expect(whatsApp.sendText).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('contacta directamente') }),
      );
    });
  });

  describe('no matching reminder row', () => {
    it('falls through to free-text reply when quotedMessageId has no matching row', async () => {
      const repo = makeRepo();
      const whatsApp = makeWhatsApp();
      const queueRepo = makeQueueRepo(null); // no matching row
      const sut = makeSut(repo, whatsApp, queueRepo);

      const payload = normalize(
        makeZernioPayload({
          buttonText: 'Confirmar',
          quotedMessageId: QUOTED_WAMID,
          conversationId: CONVERSATION_ID,
          messageText: 'Confirmar',
        }),
      );

      const result = await sut.execute(payload);
      expect(result.action).toBe('freetext');
      expect(whatsApp.sendText).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('solo envía recordatorios') }),
      );
    });

    it('returns noop when no matching row and no message body', async () => {
      const repo = makeRepo();
      const whatsApp = makeWhatsApp();
      const queueRepo = makeQueueRepo(null);
      const sut = makeSut(repo, whatsApp, queueRepo);

      const result = await sut.execute({ quotedMessageId: QUOTED_WAMID });
      expect(result.action).toBe('noop');
      expect(whatsApp.sendText).not.toHaveBeenCalled();
    });
  });

  describe('free-text inbound (no quotedMessageId)', () => {
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

    it('returns noop when no body and no quotedMessageId', async () => {
      const repo = makeRepo();
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp);

      const result = await sut.execute({ event: 'message.received' });
      expect(result.action).toBe('noop');
      expect(whatsApp.sendText).not.toHaveBeenCalled();
    });
  });

  describe('error resilience', () => {
    it('returns noop when an unexpected error occurs', async () => {
      const repo = makeRepo();
      const queueRepo = makeQueueRepo();
      (queueRepo.findByExternalMessageId as jest.Mock).mockRejectedValue(new Error('DB offline'));
      const whatsApp = makeWhatsApp();
      const sut = makeSut(repo, whatsApp, queueRepo);

      const result = await sut.execute({
        quotedMessageId: QUOTED_WAMID,
        conversationId: CONVERSATION_ID,
      });
      expect(result.action).toBe('noop');
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeWhatsAppAction unit tests
// ---------------------------------------------------------------------------

describe('normalizeWhatsAppAction', () => {
  it.each([
    ['Confirmar', 'confirm'],
    ['confirmar', 'confirm'],
    ['CONFIRMAR', 'confirm'],
    ['Reagendar', 'reschedule'],
    ['reagendar', 'reschedule'],
    ['Cancelar', 'cancel'],
    ['cancelar', 'cancel'],
    [' Confirmar ', 'confirm'], // leading/trailing spaces
  ] as Array<[string, string]>)('normalizes "%s" → %s', (input, expected) => {
    expect(normalizeWhatsAppAction(input)).toBe(expected);
  });

  it.each(['hola', 'ok', '', 'confirm', 'cancel'])('returns null for "%s"', (input) => {
    expect(normalizeWhatsAppAction(input)).toBeNull();
  });
});
