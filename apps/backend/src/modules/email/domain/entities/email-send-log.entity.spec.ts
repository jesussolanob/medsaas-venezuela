import { EmailSendLog } from './email-send-log.entity';

const baseProps = {
  id: 'log-1',
  recipientType: 'patient' as const,
  recipientId: 'patient-uuid',
  templateName: 'invoice',
  provider: 'resend',
  createdAt: new Date('2026-06-01T00:00:00Z'),
};

describe('EmailSendLog', () => {
  // ---------------------------------------------------------------------------
  // EmailSendLog.create — invariants
  // ---------------------------------------------------------------------------

  describe('create', () => {
    it('creates a sent log with valid props', () => {
      const log = EmailSendLog.create({
        ...baseProps,
        status: 'sent',
        providerMessageId: 'resend-abc',
        errorDetail: null,
      });

      expect(log.id).toBe('log-1');
      expect(log.status).toBe('sent');
      expect(log.providerMessageId).toBe('resend-abc');
      expect(log.errorDetail).toBeNull();
    });

    it('creates a failed log with valid props', () => {
      const log = EmailSendLog.create({
        ...baseProps,
        status: 'failed',
        providerMessageId: null,
        errorDetail: 'Provider returned 502',
      });

      expect(log.status).toBe('failed');
      expect(log.errorDetail).toBe('Provider returned 502');
      expect(log.providerMessageId).toBeNull();
    });

    it('throws when templateName is empty', () => {
      expect(() =>
        EmailSendLog.create({
          ...baseProps,
          templateName: '   ',
          status: 'sent',
          providerMessageId: null,
          errorDetail: null,
        }),
      ).toThrow('templateName must not be empty');
    });

    it('truncates errorDetail longer than 1 000 characters', () => {
      const longError = 'x'.repeat(1_500);
      const log = EmailSendLog.create({
        ...baseProps,
        status: 'failed',
        providerMessageId: null,
        errorDetail: longError,
      });

      expect(log.errorDetail!.length).toBe(1_000);
    });

    it('keeps errorDetail that is exactly 1 000 characters unchanged', () => {
      const exactError = 'e'.repeat(1_000);
      const log = EmailSendLog.create({
        ...baseProps,
        status: 'failed',
        providerMessageId: null,
        errorDetail: exactError,
      });

      expect(log.errorDetail!.length).toBe(1_000);
    });
  });

  // ---------------------------------------------------------------------------
  // EmailSendLog.sent convenience factory
  // ---------------------------------------------------------------------------

  describe('sent', () => {
    it('creates a sent entry with status=sent and errorDetail=null', () => {
      const log = EmailSendLog.sent({
        ...baseProps,
        providerMessageId: 'resend-xyz',
      });

      expect(log.status).toBe('sent');
      expect(log.errorDetail).toBeNull();
      expect(log.providerMessageId).toBe('resend-xyz');
    });

    it('allows null providerMessageId (noop adapter)', () => {
      const log = EmailSendLog.sent({
        ...baseProps,
        providerMessageId: null,
      });

      expect(log.providerMessageId).toBeNull();
      expect(log.status).toBe('sent');
    });
  });

  // ---------------------------------------------------------------------------
  // EmailSendLog.failed convenience factory
  // ---------------------------------------------------------------------------

  describe('failed', () => {
    it('creates a failed entry with status=failed and providerMessageId=null', () => {
      const log = EmailSendLog.failed({
        ...baseProps,
        errorDetail: 'Timeout after 5000ms',
      });

      expect(log.status).toBe('failed');
      expect(log.providerMessageId).toBeNull();
      expect(log.errorDetail).toBe('Timeout after 5000ms');
    });

    it('allows null errorDetail', () => {
      const log = EmailSendLog.failed({
        ...baseProps,
        errorDetail: null,
      });

      expect(log.errorDetail).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  describe('accessors', () => {
    it('exposes all props via getters', () => {
      const createdAt = new Date('2026-06-01T00:00:00Z');
      const log = EmailSendLog.sent({
        id: 'log-42',
        recipientType: 'doctor',
        recipientId: 'doc-uuid',
        templateName: 'payment_approved',
        provider: 'noop',
        providerMessageId: null,
        createdAt,
      });

      expect(log.id).toBe('log-42');
      expect(log.recipientType).toBe('doctor');
      expect(log.recipientId).toBe('doc-uuid');
      expect(log.templateName).toBe('payment_approved');
      expect(log.provider).toBe('noop');
      expect(log.createdAt).toBe(createdAt);
    });

    it('allows null recipientId for admin broadcasts', () => {
      const log = EmailSendLog.sent({
        ...baseProps,
        recipientType: 'admin',
        recipientId: null,
        providerMessageId: null,
      });

      expect(log.recipientId).toBeNull();
    });
  });
});
