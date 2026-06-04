import { MarkInvoicePaidUseCase } from './mark-invoice-paid.use-case';
import { Invoice } from '../../../domain/entities/invoice.entity';
import { InvoiceNotFoundError } from '../../../domain/errors/invoice-not-found.error';
import type { IInvoiceRepository } from '../../../domain/repositories/invoice.repository';

function makeInvoice(status: 'issued' | 'sent' | 'paid' = 'issued'): Invoice {
  return Invoice.create({
    id: 'inv-1',
    doctorId: 'doc-1',
    invoiceNumber: 'FAC-20260101-0001',
    amount: 100,
    currency: 'USD',
    description: null,
    status,
    issuedAt: new Date(),
    sentAt: null,
    paidAt: null,
    createdBy: 'admin-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('MarkInvoicePaidUseCase', () => {
  let mockRepo: jest.Mocked<IInvoiceRepository>;
  let useCase: MarkInvoicePaidUseCase;

  beforeEach(() => {
    mockRepo = {
      countAll: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      markPaid: jest.fn(),
    };
    useCase = new MarkInvoicePaidUseCase(mockRepo);
  });

  it('throws InvoiceNotFoundError when invoice does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ invoiceId: 'missing' })).rejects.toThrow(InvoiceNotFoundError);
  });

  it('calls repo.markPaid with the correct id', async () => {
    const invoice = makeInvoice('issued');
    mockRepo.findById.mockResolvedValue(invoice);
    mockRepo.markPaid.mockResolvedValue(makeInvoice('paid'));

    await useCase.execute({ invoiceId: 'inv-1' });

    expect(mockRepo.markPaid).toHaveBeenCalledWith('inv-1');
  });

  it('returns the updated invoice with paid status', async () => {
    const invoice = makeInvoice('issued');
    mockRepo.findById.mockResolvedValue(invoice);
    const paidInvoice = makeInvoice('paid');
    mockRepo.markPaid.mockResolvedValue(paidInvoice);

    const result = await useCase.execute({ invoiceId: 'inv-1' });

    expect(result.status).toBe('paid');
  });

  it('does not call markPaid when invoice is not found', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ invoiceId: 'missing' })).rejects.toThrow();
    expect(mockRepo.markPaid).not.toHaveBeenCalled();
  });
});
