import { SendInvoiceEmailUseCase } from './send-invoice-email.use-case';
import { Invoice } from '../../../domain/entities/invoice.entity';
import { InvoiceNotFoundError } from '../../../domain/errors/invoice-not-found.error';
import { EmailTemplateNotFoundError } from '../../../../email/domain/errors/email-template-not-found.error';
import type { IInvoiceRepository } from '../../../domain/repositories/invoice.repository';
import type {
  IProfileLookupRepository,
  DoctorProfileSnapshot,
} from '../../../domain/repositories/profile-lookup.repository';
import type { MailerService } from '../../../../email/application/services/mailer.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInvoice(
  overrides: Partial<Parameters<typeof Invoice.create>[0]> = {},
): Invoice {
  return Invoice.create({
    id: 'inv-1',
    doctorId: 'doc-1',
    invoiceNumber: 'FAC-20260101-0001',
    amount: 150,
    currency: 'USD',
    description: 'Suscripción mensual',
    status: 'issued',
    issuedAt: new Date('2026-01-01'),
    sentAt: null,
    paidAt: null,
    createdBy: 'admin-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function makeSentInvoice(): Invoice {
  return makeInvoice({ status: 'sent', sentAt: new Date() });
}

function makeDoctorProfile(): DoctorProfileSnapshot {
  return {
    id: 'doc-1',
    fullName: 'Dr. Juan Pérez',
    email: 'doctor@example.com',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SendInvoiceEmailUseCase (MailerService refactor)', () => {
  let invoiceRepo: jest.Mocked<IInvoiceRepository>;
  let profileRepo: jest.Mocked<IProfileLookupRepository>;
  let mailerService: jest.Mocked<MailerService>;
  let useCase: SendInvoiceEmailUseCase;

  beforeEach(() => {
    invoiceRepo = {
      countAll: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      markSent: jest.fn(),
      markPaid: jest.fn(),
    };

    profileRepo = {
      findById: jest.fn(),
    };

    mailerService = {
      sendTemplate: jest.fn(),
    } as unknown as jest.Mocked<MailerService>;

    useCase = new SendInvoiceEmailUseCase(invoiceRepo, profileRepo, mailerService);
  });

  // ---------------------------------------------------------------------------
  // Invoice not found
  // ---------------------------------------------------------------------------

  it('throws InvoiceNotFoundError when invoice does not exist', async () => {
    invoiceRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ invoiceId: 'missing' })).rejects.toThrow(InvoiceNotFoundError);
    expect(invoiceRepo.markSent).not.toHaveBeenCalled();
    expect(mailerService.sendTemplate).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Successful send
  // ---------------------------------------------------------------------------

  it('marks invoice as sent and calls mailerService.sendTemplate on success', async () => {
    const invoice = makeInvoice();
    const sentInvoice = makeSentInvoice();
    invoiceRepo.findById.mockResolvedValue(invoice);
    invoiceRepo.markSent.mockResolvedValue(sentInvoice);
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    mailerService.sendTemplate.mockResolvedValue({ id: 'msg-1' });

    const result = await useCase.execute({ invoiceId: 'inv-1' });

    expect(invoiceRepo.markSent).toHaveBeenCalledWith('inv-1');
    expect(mailerService.sendTemplate).toHaveBeenCalledTimes(1);
    expect(result.emailSent).toBe(true);
    expect(result.invoice.status).toBe('sent');
  });

  it('calls sendTemplate with template name invoice', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice());
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    mailerService.sendTemplate.mockResolvedValue({ id: 'msg-1' });

    await useCase.execute({ invoiceId: 'inv-1' });

    const [templateName] = mailerService.sendTemplate.mock.calls[0]!;
    expect(templateName).toBe('invoice');
  });

  it('passes doctor email as recipient to sendTemplate', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice());
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    mailerService.sendTemplate.mockResolvedValue({ id: 'msg-1' });

    await useCase.execute({ invoiceId: 'inv-1' });

    const [, to] = mailerService.sendTemplate.mock.calls[0]!;
    expect(to).toBe('doctor@example.com');
  });

  it('includes invoice number in template data', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice());
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    mailerService.sendTemplate.mockResolvedValue({ id: 'msg-1' });

    await useCase.execute({ invoiceId: 'inv-1' });

    const [, , data] = mailerService.sendTemplate.mock.calls[0]!;
    expect(data.invoiceNumber).toBe('FAC-20260101-0001');
  });

  it('includes doctor name in template data', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice());
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    mailerService.sendTemplate.mockResolvedValue({ id: 'msg-1' });

    await useCase.execute({ invoiceId: 'inv-1' });

    const [, , data] = mailerService.sendTemplate.mock.calls[0]!;
    expect(data.doctorName).toBe('Dr. Juan Pérez');
  });

  it('looks up doctor profile using doctorId from invoice', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice({ doctorId: 'doc-99' }));
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    mailerService.sendTemplate.mockResolvedValue({ id: 'msg-1' });

    await useCase.execute({ invoiceId: 'inv-1' });

    expect(profileRepo.findById).toHaveBeenCalledWith('doc-99');
  });

  // ---------------------------------------------------------------------------
  // Doctor profile not found — email skipped, operation still succeeds
  // ---------------------------------------------------------------------------

  it('returns emailSent=false and does not throw when doctor profile is missing', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice());
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute({ invoiceId: 'inv-1' });

    expect(mailerService.sendTemplate).not.toHaveBeenCalled();
    expect(result.emailSent).toBe(false);
    expect(result.invoice.status).toBe('sent');
  });

  // ---------------------------------------------------------------------------
  // Email failure is non-fatal
  // ---------------------------------------------------------------------------

  it('returns emailSent=false and does NOT throw when mailerService.sendTemplate rejects', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice());
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    mailerService.sendTemplate.mockRejectedValue(new Error('Resend 403 forbidden'));

    const result = await useCase.execute({ invoiceId: 'inv-1' });

    expect(result.emailSent).toBe(false);
    expect(result.invoice.status).toBe('sent');
  });

  it('returns emailSent=false when template is not found (non-fatal)', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice());
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    mailerService.sendTemplate.mockRejectedValue(new EmailTemplateNotFoundError('invoice'));

    const result = await useCase.execute({ invoiceId: 'inv-1' });

    expect(result.emailSent).toBe(false);
    expect(result.invoice.status).toBe('sent');
  });

  it('marks invoice as sent even when email delivery fails', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice());
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    mailerService.sendTemplate.mockRejectedValue(new Error('network error'));

    await useCase.execute({ invoiceId: 'inv-1' });

    expect(invoiceRepo.markSent).toHaveBeenCalledWith('inv-1');
  });

  // ---------------------------------------------------------------------------
  // Description fallback
  // ---------------------------------------------------------------------------

  it('uses fallback description when invoice has no description', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice({ description: null }));
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    mailerService.sendTemplate.mockResolvedValue({ id: 'msg-1' });

    await useCase.execute({ invoiceId: 'inv-1' });

    const [, , data] = mailerService.sendTemplate.mock.calls[0]!;
    expect(data.description).toBe('Suscripción mensual Delta Medical');
  });

  it('sends without throwing when invoice has no issuedAt', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice({ issuedAt: null }));
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    mailerService.sendTemplate.mockResolvedValue({ id: 'msg-1' });

    const result = await useCase.execute({ invoiceId: 'inv-1' });

    expect(result.emailSent).toBe(true);
  });
});
