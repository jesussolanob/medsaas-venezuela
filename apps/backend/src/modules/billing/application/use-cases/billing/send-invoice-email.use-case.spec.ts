import { SendInvoiceEmailUseCase } from './send-invoice-email.use-case';
import { Invoice } from '../../../domain/entities/invoice.entity';
import { InvoiceNotFoundError } from '../../../domain/errors/invoice-not-found.error';
import type { IInvoiceRepository } from '../../../domain/repositories/invoice.repository';
import type {
  IProfileLookupRepository,
  DoctorProfileSnapshot,
} from '../../../domain/repositories/profile-lookup.repository';
import type { IEmailPort } from '../../../../email/application/ports/email.port';

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

describe('SendInvoiceEmailUseCase', () => {
  let invoiceRepo: jest.Mocked<IInvoiceRepository>;
  let profileRepo: jest.Mocked<IProfileLookupRepository>;
  let emailPort: jest.Mocked<IEmailPort>;
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

    emailPort = {
      send: jest.fn(),
    };

    useCase = new SendInvoiceEmailUseCase(invoiceRepo, profileRepo, emailPort);
  });

  // ---------------------------------------------------------------------------
  // Invoice not found
  // ---------------------------------------------------------------------------

  it('throws InvoiceNotFoundError when invoice does not exist', async () => {
    invoiceRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ invoiceId: 'missing' })).rejects.toThrow(InvoiceNotFoundError);
    expect(invoiceRepo.markSent).not.toHaveBeenCalled();
    expect(emailPort.send).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Successful send
  // ---------------------------------------------------------------------------

  it('marks invoice as sent and calls emailPort.send on success', async () => {
    const invoice = makeInvoice();
    const sentInvoice = makeSentInvoice();
    invoiceRepo.findById.mockResolvedValue(invoice);
    invoiceRepo.markSent.mockResolvedValue(sentInvoice);
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    emailPort.send.mockResolvedValue({ id: 'msg-1' });

    const result = await useCase.execute({ invoiceId: 'inv-1' });

    expect(invoiceRepo.markSent).toHaveBeenCalledWith('inv-1');
    expect(emailPort.send).toHaveBeenCalledTimes(1);
    expect(result.emailSent).toBe(true);
    expect(result.invoice.status).toBe('sent');
  });

  it('passes the invoice number in the email subject', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice());
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    emailPort.send.mockResolvedValue({ id: 'msg-1' });

    await useCase.execute({ invoiceId: 'inv-1' });

    const call = emailPort.send.mock.calls[0]![0]!;
    expect(call.subject).toContain('FAC-20260101-0001');
  });

  it('includes the invoice number in the HTML body', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice());
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    emailPort.send.mockResolvedValue({ id: 'msg-1' });

    await useCase.execute({ invoiceId: 'inv-1' });

    const call = emailPort.send.mock.calls[0]![0]!;
    expect(call.html).toContain('FAC-20260101-0001');
  });

  it('looks up doctor profile using the doctorId from the invoice', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice({ doctorId: 'doc-99' }));
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    emailPort.send.mockResolvedValue({ id: 'msg-1' });

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

    expect(emailPort.send).not.toHaveBeenCalled();
    expect(result.emailSent).toBe(false);
    expect(result.invoice.status).toBe('sent');
  });

  // ---------------------------------------------------------------------------
  // Email failure is non-fatal
  // ---------------------------------------------------------------------------

  it('returns emailSent=false and does NOT throw when emailPort.send rejects', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice());
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    emailPort.send.mockRejectedValue(new Error('Resend 403 forbidden'));

    const result = await useCase.execute({ invoiceId: 'inv-1' });

    expect(result.emailSent).toBe(false);
    // Invoice is still marked sent — the DB operation must not be rolled back.
    expect(result.invoice.status).toBe('sent');
  });

  it('marks the invoice as sent even when email delivery fails', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice());
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    emailPort.send.mockRejectedValue(new Error('Resend network error'));

    await useCase.execute({ invoiceId: 'inv-1' });

    expect(invoiceRepo.markSent).toHaveBeenCalledWith('inv-1');
  });

  // ---------------------------------------------------------------------------
  // HTML content validation
  // ---------------------------------------------------------------------------

  it('uses fallback description when invoice has no description', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice({ description: null }));
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    emailPort.send.mockResolvedValue({ id: 'msg-1' });

    await useCase.execute({ invoiceId: 'inv-1' });

    const call = emailPort.send.mock.calls[0]![0]!;
    expect(call.html).toContain('Suscripción mensual Delta Medical');
  });

  it('uses current date in email when invoice has no issuedAt', async () => {
    invoiceRepo.findById.mockResolvedValue(makeInvoice({ issuedAt: null }));
    invoiceRepo.markSent.mockResolvedValue(makeSentInvoice());
    profileRepo.findById.mockResolvedValue(makeDoctorProfile());
    emailPort.send.mockResolvedValue({ id: 'msg-1' });

    const result = await useCase.execute({ invoiceId: 'inv-1' });

    // Just ensure it doesn't throw and emailSent is true
    expect(result.emailSent).toBe(true);
  });
});
