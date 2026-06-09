import { MailerService } from './mailer.service';
import type { IEmailTemplateRepository } from '../../domain/repositories/email-template.repository';
import type { IEmailPort, EmailSendResult } from '../ports/email.port';
import { EmailTemplate } from '../../domain/entities/email-template.entity';
import { EmailTemplateNotFoundError } from '../../domain/errors/email-template-not-found.error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTemplate(overrides: Partial<Parameters<typeof EmailTemplate.create>[0]> = {}): EmailTemplate {
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
  let service: MailerService;

  beforeEach(() => {
    templateRepo = {
      findByName: jest.fn(),
    };

    emailPort = {
      send: jest.fn(),
    };

    service = new MailerService(templateRepo, emailPort);
  });

  // ---------------------------------------------------------------------------
  // Template not found
  // ---------------------------------------------------------------------------

  it('throws EmailTemplateNotFoundError when template does not exist', async () => {
    templateRepo.findByName.mockResolvedValue(null);

    await expect(
      service.sendTemplate('invoice', 'doc@example.com', {}),
    ).rejects.toThrow(EmailTemplateNotFoundError);

    expect(emailPort.send).not.toHaveBeenCalled();
  });

  it('passes the template name to the repository', async () => {
    templateRepo.findByName.mockResolvedValue(null);

    await expect(
      service.sendTemplate('reminder', 'doc@example.com', {}),
    ).rejects.toThrow(EmailTemplateNotFoundError);

    expect(templateRepo.findByName).toHaveBeenCalledWith('reminder');
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
    templateRepo.findByName.mockResolvedValue(makeTemplate({
      subject: 'Hello {{missingKey}}',
      html: '<p>{{missingKey}}</p>',
      text: null,
    }));
    emailPort.send.mockResolvedValue({ id: 'msg-1' });

    await service.sendTemplate('invoice', 'doc@example.com', {});

    const call = emailPort.send.mock.calls[0]![0]!;
    expect(call.subject).toBe('Hello ');
    expect(call.html).toBe('<p></p>');
  });

  it('serialises numeric values to string', async () => {
    templateRepo.findByName.mockResolvedValue(makeTemplate({
      subject: 'Amount: {{amount}}',
      html: '<p>{{amount}}</p>',
      text: null,
    }));
    emailPort.send.mockResolvedValue({ id: 'msg-1' });

    await service.sendTemplate('invoice', 'doc@example.com', { amount: 150.5 });

    const call = emailPort.send.mock.calls[0]![0]!;
    expect(call.subject).toBe('Amount: 150.5');
  });

  it('replaces null value with empty string', async () => {
    templateRepo.findByName.mockResolvedValue(makeTemplate({
      subject: 'Desc: {{description}}',
      html: '<p></p>',
      text: null,
    }));
    emailPort.send.mockResolvedValue({ id: 'msg-1' });

    await service.sendTemplate('invoice', 'doc@example.com', { description: null });

    const call = emailPort.send.mock.calls[0]![0]!;
    expect(call.subject).toBe('Desc: ');
  });

  // ---------------------------------------------------------------------------
  // Delivery
  // ---------------------------------------------------------------------------

  it('forwards to and returns the result from emailPort.send', async () => {
    templateRepo.findByName.mockResolvedValue(makeTemplate({ subject: 'S', html: 'H', text: null }));
    const mockResult: EmailSendResult = { id: 'resend-123' };
    emailPort.send.mockResolvedValue(mockResult);

    const result = await service.sendTemplate('invoice', ['a@b.com', 'c@d.com'], {});

    expect(emailPort.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['a@b.com', 'c@d.com'] }),
    );
    expect(result).toEqual({ id: 'resend-123' });
  });

  it('propagates emailPort.send errors to the caller', async () => {
    templateRepo.findByName.mockResolvedValue(makeTemplate({ subject: 'S', html: 'H', text: null }));
    emailPort.send.mockRejectedValue(new Error('provider error'));

    await expect(
      service.sendTemplate('invoice', 'doc@example.com', {}),
    ).rejects.toThrow('provider error');
  });
});
