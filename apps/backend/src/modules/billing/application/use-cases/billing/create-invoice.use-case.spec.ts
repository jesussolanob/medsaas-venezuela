import { CreateInvoiceUseCase } from './create-invoice.use-case';
import { Invoice } from '../../../domain/entities/invoice.entity';
import type { IInvoiceRepository } from '../../../domain/repositories/invoice.repository';

function makeSavedInvoice(invoiceNumber: string): Invoice {
  return Invoice.create({
    id: 'inv-1',
    doctorId: 'doc-1',
    invoiceNumber,
    amount: 100,
    currency: 'USD',
    description: null,
    status: 'issued',
    issuedAt: new Date(),
    sentAt: null,
    paidAt: null,
    createdBy: 'admin-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('CreateInvoiceUseCase', () => {
  let mockRepo: jest.Mocked<IInvoiceRepository>;
  let useCase: CreateInvoiceUseCase;

  beforeEach(() => {
    mockRepo = {
      countAll: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      markPaid: jest.fn(),
    };
    useCase = new CreateInvoiceUseCase(mockRepo);
  });

  it('generates FAC-YYYYMMDD-0001 for the first invoice', async () => {
    mockRepo.countAll.mockResolvedValue(0);
    mockRepo.save.mockImplementation(async (params) => makeSavedInvoice(params.invoiceNumber));

    await useCase.execute({
      doctorId: 'doc-1',
      amount: 100,
      createdBy: 'admin-1',
    });

    const call = mockRepo.save.mock.calls[0];
    expect(call).toBeDefined();
    const savedWith = call![0]!;
    expect(savedWith.invoiceNumber).toMatch(/^FAC-\d{8}-0001$/);
  });

  it('generates FAC-YYYYMMDD-0042 for the 42nd invoice', async () => {
    mockRepo.countAll.mockResolvedValue(41); // next = 42
    mockRepo.save.mockImplementation(async (params) => makeSavedInvoice(params.invoiceNumber));

    await useCase.execute({ doctorId: 'doc-1', amount: 100, createdBy: 'admin-1' });

    const call = mockRepo.save.mock.calls[0];
    expect(call).toBeDefined();
    const savedWith = call![0]!;
    expect(savedWith.invoiceNumber).toMatch(/^FAC-\d{8}-0042$/);
  });

  it('passes correct fields to repository', async () => {
    mockRepo.countAll.mockResolvedValue(0);
    mockRepo.save.mockImplementation(async (params) => makeSavedInvoice(params.invoiceNumber));

    await useCase.execute({
      doctorId: 'doc-1',
      amount: 250,
      currency: 'USD',
      description: 'Plan premium',
      createdBy: 'admin-1',
    });

    const call = mockRepo.save.mock.calls[0];
    expect(call).toBeDefined();
    const savedWith = call![0]!;
    expect(savedWith.doctorId).toBe('doc-1');
    expect(savedWith.amount).toBe(250);
    expect(savedWith.currency).toBe('USD');
    expect(savedWith.description).toBe('Plan premium');
    expect(savedWith.createdBy).toBe('admin-1');
  });

  it('defaults currency to USD when not provided', async () => {
    mockRepo.countAll.mockResolvedValue(0);
    mockRepo.save.mockImplementation(async (params) => makeSavedInvoice(params.invoiceNumber));

    await useCase.execute({ doctorId: 'doc-1', amount: 100, createdBy: null });

    const call = mockRepo.save.mock.calls[0];
    expect(call).toBeDefined();
    expect(call![0]!.currency).toBe('USD');
  });

  it('passes null description when not provided', async () => {
    mockRepo.countAll.mockResolvedValue(0);
    mockRepo.save.mockImplementation(async (params) => makeSavedInvoice(params.invoiceNumber));

    await useCase.execute({ doctorId: 'doc-1', amount: 100, createdBy: null });

    const call = mockRepo.save.mock.calls[0];
    expect(call).toBeDefined();
    expect(call![0]!.description).toBeNull();
  });
});
