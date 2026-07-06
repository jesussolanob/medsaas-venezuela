import { MailerService } from './mailer.service';
import type { IEmailTemplateRepository } from '../../domain/repositories/email-template.repository';
import type { IEmailPort, EmailSendResult } from '../ports/email.port';
import type { IEmailSendLogRepository } from '../../domain/repositories/email-send-log.repository';
import { EmailTemplate } from '../../domain/entities/email-template.entity';
import { EmailTemplateNotFoundError } from '../../domain/errors/email-template-not-found.error';
import type { ConfigService } from '@nestjs/config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTemplate(
  overrides: Partial<Parameters<typeof EmailTemplate.create>[0]> = {},
): EmailTemplate {
  return EmailTemplate.create({
    id: 'tpl-1',
    name: 'invoice',
    subject: 'Factura {{invoiceNumber}}',
    html: '<p>Dr. {{doctorName}}, factura {{invoiceNumber}} por {{amount}}</p>',
    text: 'Dr. {{doctorName}}: {{invoiceNumber}} {{amount}}',
    description: 'Invoice template',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MailerService', () => {
  let templateRepo: jest.Mocked<IEmailTemplateRepository>;
  let emailPort: jest.Mocked<IEmailPort>;
  let sendLogRepo: jest.Mocked<IEmailSendLogRepository>;
  let config: jest.Mocked<Pick<ConfigService, 'get'>>;
  let service: MailerService;

  beforeEach(() => {
    templateRepo = {
      findByName: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
    };

    emailPort = {
      send: jest.fn(),
    };

    sendLogRepo = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    config = {
      get: jest.fn().mockReturnValue('resend'),
    };

    service = new MailerService(
      templateRepo,
      emailPort,
      sendLogRepo,
      config as unknown as ConfigService,
    );
  });

  // ---------------------------------------------------------------------------
  // Template not found
  // ---------------------------------------------------------------------------

  it('throws EmailTemplateNotFoundError when template does not exist', async () => {
    templateRepo.findByName.mockResolvedValue(null);

    await expect(service.sendTemplate('invoice', 'doc@example.com', {})).rejects.toThrow(
      EmailTemplateNotFoundError,
    );

    expect(emailPort.send).not.toHaveBeenCalled();
  });

  it('passes the template name to the repository', async () => {
    templateRepo.findByName.mockResolvedValue(null);

    await expect(service.sendTemplate('reminder', 'doc@example.com', {})).rejects.toThrow(
      EmailTemplateNotFoundError,
    );

    expect(templateRepo.findByName).toHaveBeenCalledWith('reminder');
  });

  it('records a failed log entry with template_not_found when template does not exist', async () => {
    templateRepo.findByName.mockResolvedValue(null);

    await expect(service.sendTemplate('missing_tpl', 'doc@example.com', {})).rejects.toThrow(
      EmailTemplateNotFoundError,
    );

    expect(sendLogRepo.record).toHaveBeenCalledTimes(1);
    const entry = sendLogRepo.record.mock.calls[0]![0]!;
    expect(entry.status).toBe('failed');
    expect(entry.templateName).toBe('missing_tpl');
    expect(entry.errorDetail).toBe('template_not_found');
    expect(entry.providerMessageId).toBeNull();
  });

  it('still throws EmailTemplateNotFoundError when log write fails on missing template', async () => {
    templateRepo.findByName.mockResolvedValue(null);
    sendLogRepo.record.mockRejectedValue(new Error('DB write failed'));

    await expect(service.sendTemplate('missing_tpl', 'doc@example.com', {})).rejects.toThrow(
      EmailTemplateNotFoundError,
    );
  });

  // ---------------------------------------------------------------------------
  // Placeholder replacement
  // ---------------------------------------------------------------------------

  it('replaces placeholders in subject', async () => {
    templateRepo.findByName.mockResolvedValue(makeTemplate());
    emailPort.send.mockResolvedValue({ id: 'msg-1' });

    await service.sendTemplate('invoice', 'doc@example.com', {
      invoiceNumber: 'FAC-001',
      doctorName: 'Dr. Pérez',
      amount: '100.00',
    });

    const call = emailPort.send.mock.calls[0]![0]!;
    expect(call.subject).toBe('Factura FAC-001');
  });

  it('replaces placeholders in html', async () => {
    templateRepo.findByName.mockResolvedValue(makeTemplate());
    emailPort.send.mockResolvedValue({ id: 'msg-1' });

    await service.sendTemplate('invoice', 'doc@example.com', {
      invoiceNumber: 'FAC-001',
      doctorName: 'Dr. Pérez',
      amount: 'USD 100.00',
    });

    const call = emailPort.send.mock.calls[0]![0]!;
    expect(call.html).toContain('Dr. Pérez');
    expect(call.html).toContain('FAC-001');
    expect(call.html).toContain('USD 100.00');
  });

  it('replaces placeholders in text when template has a text version', async () => {
    templateRepo.findByName.mockResolvedValue(makeTemplate());
    emailPort.send.mockResolvedValue({ id: 'msg-1' });

    await service.sendTemplate('invoice', 'doc@example.com', {
      invoiceNumber: 'FAC-001',
      doctorName: 'Dr. Pérez',
      amount: 'USD 100.00',
    });

    const call = emailPort.send.mock.calls[0]![0]!;
    expect(call.text).toContain('Dr. Pérez');
    expect(call.text).toContain('FAC-001');
  });

  it('omits text field when template has no text version', async () => {
    templateRepo.findByName.mockResolvedValue(makeTemplate({ text: null }));
    emailPort.send.mockResolvedValue({ id: 'msg-1' });

    await service.sendTemplate('invoice', 'doc@example.com', {
      invoiceNumber: 'FAC-001',
      doctorName: 'Dr. Pérez',
      amount: '100',
    });

    const call = emailPort.send.mock.calls[0]![0]!;
    expect(call.text).toBeUndefined();
  });

  it('replaces unknown placeholders with empty string', async () => {
    templateRepo.findByName.mockResolvedValue(
      makeTemplate({
        subject: 'Hello {{missingKey}}',
        html: '<p>{{missingKey}}</p>',
        text: null,
      }),
    );
    emailPort.send.mockResolvedValue({ id: 'msg-1' });

    await service.sendTemplate('invoice', 'doc@example.com', {});

    const call = emailPort.send.mock.calls[0]![0]!;
    expect(call.subject).toBe('Hello ');
    expect(call.html).toBe('<p></p>');
  });

  it('serialises numeric values to string', async () => {
    templateRepo.findByName.mockResolvedValue(
      makeTemplate({
        subject: 'Amount: {{amount}}',
        html: '<p>{{amount}}</p>',
        text: null,
      }),
    );
    emailPort.send.mockResolvedValue({ id: 'msg-1' });

    await service.sendTemplate('invoice', 'doc@example.com', { amount: 150.5 });

    const call = emailPort.send.mock.calls[0]![0]!;
    expect(call.subject).toBe('Amount: 150.5');
  });

  it('replaces null value with empty string', async () => {
    templateRepo.findByName.mockResolvedValue(
      makeTemplate({
        subject: 'Desc: {{description}}',
        html: '<p></p>',
        text: null,
      }),
    );
    emailPort.send.mockResolvedValue({ id: 'msg-1' });

    await service.sendTemplate('invoice', 'doc@example.com', { description: null });

    const call = emailPort.send.mock.calls[0]![0]!;
    expect(call.subject).toBe('Desc: ');
  });

  // ---------------------------------------------------------------------------
  // Delivery
  // ---------------------------------------------------------------------------

  it('forwards to and returns the result from emailPort.send', async () => {
    templateRepo.findByName.mockResolvedValue(
      makeTemplate({ subject: 'S', html: 'H', text: null }),
    );
    const mockResult: EmailSendResult = { id: 'resend-123' };
    emailPort.send.mockResolvedValue(mockResult);

    const result = await service.sendTemplate('invoice', ['a@b.com', 'c@d.com'], {});

    expect(emailPort.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['a@b.com', 'c@d.com'] }),
    );
    expect(result).toEqual({ id: 'resend-123' });
  });

  it('propagates emailPort.send errors to the caller', async () => {
    templateRepo.findByName.mockResolvedValue(
      makeTemplate({ subject: 'S', html: 'H', text: null }),
    );
    emailPort.send.mockRejectedValue(new Error('provider error'));

    await expect(service.sendTemplate('invoice', 'doc@example.com', {})).rejects.toThrow(
      'provider error',
    );
  });

  // ---------------------------------------------------------------------------
  // Send log — success path
  // ---------------------------------------------------------------------------

  it('records a sent log entry after successful delivery', async () => {
    templateRepo.findByName.mockResolvedValue(
      makeTemplate({ subject: 'S', html: 'H', text: null }),
    );
    emailPort.send.mockResolvedValue({ id: 'resend-msg-id' });

    await service.sendTemplate('invoice', 'doc@example.com', {});

    expect(sendLogRepo.record).toHaveBeenCalledTimes(1);
    const entry = sendLogRepo.record.mock.calls[0]![0]!;
    expect(entry.status).toBe('sent');
    expect(entry.templateName).toBe('invoice');
    expect(entry.providerMessageId).toBe('resend-msg-id');
    expect(entry.errorDetail).toBeNull();
  });

  it('uses recipient type and id from the optional recipient param', async () => {
    templateRepo.findByName.mockResolvedValue(
      makeTemplate({ subject: 'S', html: 'H', text: null }),
    );
    emailPort.send.mockResolvedValue({ id: 'msg-x' });

    await service.sendTemplate(
      'invoice',
      'doc@example.com',
      {},
      { type: 'doctor', id: 'doc-uuid' },
    );

    const entry = sendLogRepo.record.mock.calls[0]![0]!;
    expect(entry.recipientType).toBe('doctor');
    expect(entry.recipientId).toBe('doc-uuid');
  });

  it('defaults recipientType to system when no recipient is provided', async () => {
    templateRepo.findByName.mockResolvedValue(
      makeTemplate({ subject: 'S', html: 'H', text: null }),
    );
    emailPort.send.mockResolvedValue({ id: 'msg-x' });

    await service.sendTemplate('invoice', 'doc@example.com', {});

    const entry = sendLogRepo.record.mock.calls[0]![0]!;
    expect(entry.recipientType).toBe('system');
    expect(entry.recipientId).toBeNull();
  });

  it('records the provider from config in the sent log', async () => {
    config.get.mockReturnValue('sandbox');
    templateRepo.findByName.mockResolvedValue(
      makeTemplate({ subject: 'S', html: 'H', text: null }),
    );
    emailPort.send.mockResolvedValue({ id: null });

    await service.sendTemplate('invoice', 'doc@example.com', {});

    const entry = sendLogRepo.record.mock.calls[0]![0]!;
    expect(entry.provider).toBe('sandbox');
  });

  // ---------------------------------------------------------------------------
  // Send log — failure path
  // ---------------------------------------------------------------------------

  it('records a failed log entry when delivery throws', async () => {
    templateRepo.findByName.mockResolvedValue(
      makeTemplate({ subject: 'S', html: 'H', text: null }),
    );
    emailPort.send.mockRejectedValue(new Error('smtp timeout'));

    await expect(service.sendTemplate('invoice', 'doc@example.com', {})).rejects.toThrow(
      'smtp timeout',
    );

    expect(sendLogRepo.record).toHaveBeenCalledTimes(1);
    const entry = sendLogRepo.record.mock.calls[0]![0]!;
    expect(entry.status).toBe('failed');
    expect(entry.errorDetail).toBe('smtp timeout');
    expect(entry.providerMessageId).toBeNull();
  });

  it('re-throws the original error even when the log is recorded', async () => {
    templateRepo.findByName.mockResolvedValue(
      makeTemplate({ subject: 'S', html: 'H', text: null }),
    );
    const originalError = new Error('connection refused');
    emailPort.send.mockRejectedValue(originalError);

    await expect(service.sendTemplate('invoice', 'doc@example.com', {})).rejects.toBe(
      originalError,
    );
  });

  // ---------------------------------------------------------------------------
  // Defensive logging — log write failure must NOT affect the send result
  // ---------------------------------------------------------------------------

  it('still returns the send result when the log write fails (success path)', async () => {
    templateRepo.findByName.mockResolvedValue(
      makeTemplate({ subject: 'S', html: 'H', text: null }),
    );
    emailPort.send.mockResolvedValue({ id: 'msg-ok' });
    sendLogRepo.record.mockRejectedValue(new Error('DB write failed'));

    const result = await service.sendTemplate('invoice', 'doc@example.com', {});

    expect(result).toEqual({ id: 'msg-ok' });
  });

  it('still throws the original send error when the log write also fails (failure path)', async () => {
    templateRepo.findByName.mockResolvedValue(
      makeTemplate({ subject: 'S', html: 'H', text: null }),
    );
    const sendError = new Error('provider down');
    emailPort.send.mockRejectedValue(sendError);
    sendLogRepo.record.mockRejectedValue(new Error('DB write failed'));

    await expect(service.sendTemplate('invoice', 'doc@example.com', {})).rejects.toBe(sendError);
  });
});
